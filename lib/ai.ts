// Claude-backed content generation.
//
// Two rules shape everything here:
//   1. The student must never wait or hit a dead end. Every call is deadlined
//      and every failure path lands on the offline bank (NFR 1 + NFR 4).
//   2. A generated question is not trusted until it's been checked. LLM
//      arithmetic can be wrong, and a wrong answer key is worse than no AI.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

import { getTheme, getTopic, getTopics } from "./catalog";
import { db, id, nowIso } from "./db";
import { fallbackQuestion } from "./fallback";
import { fallbackLesson } from "./lessons";
import type { GradeBand, Difficulty, Lesson, Question, QuestStage, SkillLevel } from "./types";

const MODEL = "claude-opus-5";

/** Latency budget. The brief allows 3–5s for AI content; past this we serve cached. */
const QUESTION_TIMEOUT_MS = Number(process.env.QUESTLEARN_AI_TIMEOUT_MS ?? 9_000);
const QUESTLINE_TIMEOUT_MS = Number(process.env.QUESTLEARN_AI_TIMEOUT_MS ?? 12_000);
const LESSON_TIMEOUT_MS = Number(process.env.QUESTLEARN_AI_TIMEOUT_MS ?? 12_000);

let _client: Anthropic | null = null;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function client(): Anthropic {
  if (!_client) _client = new Anthropic({ maxRetries: 1 });
  return _client;
}

// --- schemas -----------------------------------------------------------------

const QuestionSchema = z.object({
  prompt: z.string().describe("The question, 1-2 short sentences, themed."),
  choices: z.array(z.string()).describe("Exactly 4 answer options."),
  answer: z.string().describe("The correct option, copied character-for-character from choices."),
  answerIndex: z.number().int().describe("0-based index of the correct option within choices."),
  hint: z.string().describe("One nudge that does not give away the answer."),
  explanation: z.string().describe("One or two sentences showing the working."),
});

const LessonSchema = z.object({
  title: z.string().describe("What this skill is called, in kid words. Max 5 words."),
  intro: z.string().describe("One sentence: what this skill actually is."),
  steps: z.array(z.string()).describe("2-4 short steps: the method, in order."),
  exampleProblem: z.string().describe("One concrete example problem, themed."),
  exampleWorking: z.array(z.string()).describe("2-4 lines showing the example solved step by step."),
  exampleAnswer: z.string().describe("The answer to the example problem."),
  tip: z.string().describe("The mistake students most often make here, and how to dodge it."),
});

const QuestLineSchema = z.object({
  title: z.string().describe("Quest line name, themed, max 5 words."),
  blurb: z.string().describe("One sentence of setup, addressed to the student as 'you'."),
  stages: z
    .array(
      z.object({
        title: z.string().describe("Stage name, themed, max 5 words."),
        topic: z.string().describe("Topic id, chosen from the provided list."),
        difficulty: z.number().int().describe("1-5."),
      }),
    )
    .describe("4 stages, ordered easiest to hardest."),
});

// --- prompt construction -----------------------------------------------------

const GRADE_GUIDANCE: Record<GradeBand, string> = {
  // Kindergarten and 1st grade are emergent readers. Every extra word is a
  // barrier between the child and the maths, so the wording gets brutal limits.
  "K-1":
    "Kindergarten to 1st grade (ages 5-7). MANY CANNOT READ YET. Use 10 words or fewer. One short sentence, no commas, no clauses. Numbers under 20 only. Plain wording a 5-year-old hears in speech. Prefer a bare question like 'What is 3 + 2?' over any story. Never use a word longer than two syllables.",
  "2-3":
    "2nd to 3rd grade (ages 7-9). Short sentences, around 15 words. One step at a time. Numbers under 100. Simple, common words only.",
  "4-5":
    "4th to 5th grade (ages 9-11). Two-step reasoning is fine. Normal sentences, but keep them tight.",
  "6":
    "6th grade (ages 11-12). Multi-step problems and slightly denser wording are fine. Keep it concrete, not abstract.",
};

/**
 * Frozen across every question request so the cached prefix actually hits.
 * Anything that varies per request goes in the user turn, never here.
 */
const QUESTION_SYSTEM = `You write single multiple-choice practice questions for a kids' learning game.

Hard requirements:
- Exactly 4 choices. Exactly one is correct.
- The maths must be correct. Work it out before you write the choices.
- "answer" must be copied character-for-character from "choices", and "answerIndex" must be its 0-based position.
- Wrong choices must be plausible near-misses a student could actually arrive at (off-by-one, the wrong operation, a forgotten step) — never absurd, never negative, never zero.
- Use the student's interest theme for the setting, but keep the underlying skill exactly as specified.
- Minimal text. A student reads this on a phone.
- No preamble, no markdown, no emoji in the question text.`;

function questionUserTurn(args: {
  topic: string;
  topicLabel: string;
  difficulty: Difficulty;
  themeLabel: string;
  themeFlavor: string;
  gradeBand: GradeBand;
  scaffold: boolean;
  avoid: string[];
}): string {
  const lines = [
    `Skill: ${args.topicLabel} (topic id: ${args.topic})`,
    `Difficulty: ${args.difficulty} of 5`,
    `Interest theme: ${args.themeLabel} — ${args.themeFlavor}`,
    `Reading level: ${GRADE_GUIDANCE[args.gradeBand]}`,
  ];
  if (args.scaffold) {
    lines.push(
      "This student just got two wrong in a row. Make this a confidence-rebuilding step: one single operation, smaller numbers, and a hint that names the first move.",
    );
  }
  if (args.avoid.length > 0) {
    lines.push(`Do not reuse these recent question stems:\n${args.avoid.map((a) => `- ${a}`).join("\n")}`);
  }
  return lines.join("\n");
}

// --- generation --------------------------------------------------------------

/** Hard deadline around a promise — a hung socket must not outlive our budget. */
async function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

export interface GenerateArgs {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  theme: string;
  gradeBand: GradeBand;
  scaffold?: boolean;
  studentId?: string;
}

function slotKey(a: GenerateArgs): string {
  return [a.subject, a.topic, a.difficulty, a.theme, a.gradeBand, a.scaffold ? "s" : "n"].join("|");
}

/**
 * Reject anything structurally broken or self-inconsistent. This is the guard
 * that stops a bad answer key ever reaching a student.
 */
function validate(raw: z.infer<typeof QuestionSchema>): string | null {
  const { choices, answer, answerIndex } = raw;
  if (!Array.isArray(choices) || choices.length !== 4) return `expected 4 choices, got ${choices?.length}`;
  if (choices.some((c) => typeof c !== "string" || c.trim() === "")) return "empty choice";
  if (new Set(choices.map((c) => c.trim())).size !== 4) return "duplicate choices";
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return `answerIndex ${answerIndex}`;
  // The cross-check: the model's own stated answer must match the index it gave.
  if (choices[answerIndex].trim() !== answer.trim()) {
    return `answerIndex points at "${choices[answerIndex]}" but answer is "${answer}"`;
  }
  if (!raw.prompt.trim() || !raw.hint.trim() || !raw.explanation.trim()) return "empty text field";
  if (choices.some((c) => /^-/.test(c.trim()))) return "negative choice";
  return null;
}

async function generateFresh(args: GenerateArgs): Promise<Question | null> {
  if (!hasApiKey()) return null;

  const topic = getTopic(args.subject, args.topic);
  const theme = getTheme(args.theme);
  const avoid = args.studentId ? recentStems(args.studentId) : [];

  try {
    const res = await withDeadline(
      client().messages.parse({
        model: MODEL,
        max_tokens: 2000,
        system: [{ type: "text", text: QUESTION_SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: {
          effort: "low", // latency-sensitive route — the brief allows 3-5s
          format: zodOutputFormat(QuestionSchema),
        },
        messages: [
          {
            role: "user",
            content: questionUserTurn({
              topic: topic.id,
              topicLabel: topic.label,
              difficulty: args.difficulty,
              themeLabel: theme.label,
              themeFlavor: theme.flavor,
              gradeBand: args.gradeBand,
              scaffold: args.scaffold ?? false,
              avoid,
            }),
          },
        ],
      }),
      QUESTION_TIMEOUT_MS,
      "question generation",
    );

    if (res.stop_reason === "refusal") {
      console.warn("[ai] question refused:", res.stop_details?.category);
      return null;
    }
    const parsed = res.parsed_output;
    if (!parsed) return null;

    const problem = validate(parsed);
    if (problem) {
      console.warn("[ai] rejected generated question:", problem);
      return null;
    }

    const q: Question = {
      id: id("q"),
      prompt: parsed.prompt.trim(),
      choices: parsed.choices.map((c) => c.trim()),
      answerIndex: parsed.answerIndex,
      hint: parsed.hint.trim(),
      explanation: parsed.explanation.trim(),
      topic: topic.id,
      difficulty: args.difficulty,
      scaffolded: args.scaffold ?? false,
      source: "ai",
    };
    cacheQuestion(slotKey(args), q);
    return q;
  } catch (err) {
    logApiError("question", err);
    return null;
  }
}

function logApiError(what: string, err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) {
    console.warn(`[ai] ${what}: bad or missing API key — falling back to offline content`);
  } else if (err instanceof Anthropic.RateLimitError) {
    console.warn(`[ai] ${what}: rate limited — falling back to offline content`);
  } else if (err instanceof Anthropic.APIError) {
    console.warn(`[ai] ${what}: API error ${err.status} — falling back to offline content`);
  } else {
    console.warn(`[ai] ${what}: ${(err as Error)?.message ?? err} — falling back to offline content`);
  }
}

// --- cache -------------------------------------------------------------------

function cacheQuestion(slot: string, q: Question) {
  db()
    .prepare("INSERT OR REPLACE INTO question_cache (id, slot, payload, uses, created_at) VALUES (?,?,?,0,?)")
    .run(q.id, slot, JSON.stringify(q), nowIso());
}

/** Least-used cached question for this slot that this student hasn't seen yet. */
function cachedQuestion(args: GenerateArgs): Question | null {
  const hit = db()
    .prepare(
      `SELECT id, payload FROM question_cache
        WHERE slot = ?
          AND id NOT IN (SELECT question_id FROM served_questions WHERE student_id = ?)
        ORDER BY uses ASC, RANDOM() LIMIT 1`,
    )
    .get(slotKey(args), args.studentId ?? "") as { id: string; payload: string } | undefined;

  if (!hit) return null;
  db().prepare("UPDATE question_cache SET uses = uses + 1 WHERE id = ?").run(hit.id);
  return { ...(JSON.parse(hit.payload) as Question), source: "cache" };
}

function recentStems(studentId: string): string[] {
  const rows = db()
    .prepare(
      `SELECT c.payload FROM served_questions s
         JOIN question_cache c ON c.id = s.question_id
        WHERE s.student_id = ? ORDER BY s.served_at DESC LIMIT 4`,
    )
    .all(studentId) as { payload: string }[];
  return rows.map((r) => (JSON.parse(r.payload) as Question).prompt.slice(0, 90));
}

export function markServed(studentId: string, questionId: string) {
  db()
    .prepare("INSERT OR IGNORE INTO served_questions (student_id, question_id, served_at) VALUES (?,?,?)")
    .run(studentId, questionId, nowIso());
}

/**
 * The one entry point the app uses. Tries a fresh generation, then the cache for
 * this exact slot, then the offline bank. Always returns a question.
 */
export async function getQuestion(args: GenerateArgs): Promise<Question> {
  const fresh = await generateFresh(args);
  if (fresh) return fresh;

  const cached = cachedQuestion(args);
  if (cached) return cached;

  return fallbackQuestion({
    topic: args.topic,
    difficulty: args.difficulty,
    theme: args.theme,
    scaffold: args.scaffold,
    seed: `${args.studentId ?? "anon"}:${Date.now()}:${Math.random()}`,
  });
}

// --- quest lines -------------------------------------------------------------

const QUESTLINE_SYSTEM = `You design short quest lines for a kids' learning game.

A quest line is 4 stages of practice, wrapped in a story from the student's favourite thing.
- Stages run easiest to hardest.
- Every "topic" must be one of the topic ids given to you, verbatim.
- Titles are punchy and themed. No markdown, no emoji.
- The blurb speaks directly to the student and is one sentence.`;

const STAGE_QUESTIONS = 3;

export async function getQuestLine(args: {
  subject: string;
  theme: string;
  skillLevel: SkillLevel;
  difficulty: Difficulty;
  gradeBand: GradeBand;
}): Promise<{ title: string; blurb: string; stages: QuestStage[]; source: "ai" | "fallback" }> {
  const theme = getTheme(args.theme);
  const topics = getTopics(args.subject);
  const ladder = plannedLadder(args.difficulty);

  if (hasApiKey()) {
    try {
      const res = await withDeadline(
        client().messages.parse({
          model: MODEL,
          max_tokens: 2000,
          system: [{ type: "text", text: QUESTLINE_SYSTEM, cache_control: { type: "ephemeral" } }],
          output_config: { effort: "low", format: zodOutputFormat(QuestLineSchema) },
          messages: [
            {
              role: "user",
              content: [
                `Interest theme: ${theme.label} — ${theme.flavor}`,
                `Student level: ${args.skillLevel} (working at difficulty ${args.difficulty} of 5)`,
                `Reading level: ${GRADE_GUIDANCE[args.gradeBand]}`,
                `Use this difficulty ladder for the 4 stages, in order: ${ladder.join(", ")}`,
                `Available topic ids:\n${topics.map((t) => `- ${t.id} (${t.label}, suits difficulty ${t.band[0]}-${t.band[1]})`).join("\n")}`,
              ].join("\n"),
            },
          ],
        }),
        QUESTLINE_TIMEOUT_MS,
        "quest line generation",
      );

      const parsed = res.stop_reason === "refusal" ? null : res.parsed_output;
      if (parsed && Array.isArray(parsed.stages) && parsed.stages.length >= 3) {
        const valid = new Set(topics.map((t) => t.id));
        const stages: QuestStage[] = parsed.stages.slice(0, 4).map((st, i) => ({
          id: id("st"),
          title: st.title.trim() || `Stage ${i + 1}`,
          // Repair rather than reject: a bad topic id shouldn't cost the student a quest.
          topic: valid.has(st.topic) ? st.topic : topicForDifficulty(args.subject, ladder[i]),
          difficulty: ladder[i],
          questionsTarget: STAGE_QUESTIONS,
          questionsDone: 0,
          status: i === 0 ? "active" : "locked",
        }));
        return {
          title: parsed.title.trim() || `${theme.label} Quest`,
          blurb: parsed.blurb.trim(),
          stages,
          source: "ai",
        };
      }
    } catch (err) {
      logApiError("quest line", err);
    }
  }

  return { ...fallbackQuestLine(args.subject, theme.label, ladder), source: "fallback" };
}

/** Four stages that step up from where the student is, capped at 5. */
function plannedLadder(start: Difficulty): Difficulty[] {
  return [0, 0, 1, 1].map((bump, i) => {
    const d = Math.min(5, Math.max(1, start + bump + (i === 3 ? 1 : 0)));
    return d as Difficulty;
  });
}

function topicForDifficulty(subject: string, d: Difficulty): string {
  const pool = getTopics(subject).filter((t) => d >= t.band[0] && d <= t.band[1]);
  return (pool.length > 0 ? pool : getTopics(subject))[0].id;
}

function fallbackQuestLine(subject: string, themeLabel: string, ladder: Difficulty[]) {
  const names = ["Warm-Up", "The Climb", "Deep Water", "Boss Battle"];
  return {
    title: `${themeLabel} Training Run`,
    blurb: `Four stages, each a little tougher than the last. Ready?`,
    stages: ladder.map((d, i) => ({
      id: id("st"),
      title: names[i] ?? `Stage ${i + 1}`,
      topic: topicForDifficulty(subject, d),
      difficulty: d,
      questionsTarget: STAGE_QUESTIONS,
      questionsDone: 0,
      status: (i === 0 ? "active" : "locked") as QuestStage["status"],
    })),
  };
}

// --- lessons ------------------------------------------------------------------

const LESSON_SYSTEM = `You teach one small maths skill to a child, right before they practise it.

This is the explanation a student gets *instead of* being thrown straight into questions, so it has to actually teach — not just describe.

Hard requirements:
- Teach the method, not the vocabulary. Show how to do it.
- "steps" is 2-4 short imperative steps, in the order you'd actually do them.
- Include one concrete worked example and solve it line by line. The arithmetic must be correct — work it out before you write it.
- "exampleAnswer" must be the answer the working actually arrives at.
- The tip names the specific mistake students make here.
- Use the student's interest theme for the example's setting only. Never change the skill.
- Short sentences. A child reads this on a phone, and it has to fit on one screen.
- No markdown, no emoji, no preamble.`;

function lessonSlot(a: { subject: string; topic: string; difficulty: Difficulty; theme: string; gradeBand: GradeBand }) {
  return ["lesson", a.subject, a.topic, a.difficulty, a.theme, a.gradeBand].join("|");
}

function validateLesson(raw: z.infer<typeof LessonSchema>): string | null {
  if (!raw.title.trim()) return "empty title";
  if (!raw.intro.trim()) return "empty intro";
  if (!raw.tip.trim()) return "empty tip";
  if (!Array.isArray(raw.steps) || raw.steps.length < 2 || raw.steps.length > 4) {
    return `expected 2-4 steps, got ${raw.steps?.length}`;
  }
  if (raw.steps.some((x) => !x.trim())) return "blank step";
  if (!raw.exampleProblem.trim()) return "empty example problem";
  if (!raw.exampleAnswer.trim()) return "empty example answer";
  if (!Array.isArray(raw.exampleWorking) || raw.exampleWorking.length < 2) {
    return "worked example needs at least 2 lines";
  }
  if (raw.exampleWorking.some((x) => !x.trim())) return "blank working line";
  return null;
}

function cacheLesson(slot: string, lesson: Lesson) {
  db()
    .prepare("INSERT OR REPLACE INTO lesson_cache (id, slot, payload, uses, created_at) VALUES (?,?,?,0,?)")
    .run(lesson.id, slot, JSON.stringify(lesson), nowIso());
}

function cachedLesson(slot: string): Lesson | null {
  const hit = db()
    .prepare("SELECT id, payload FROM lesson_cache WHERE slot = ? ORDER BY uses ASC, RANDOM() LIMIT 1")
    .get(slot) as { id: string; payload: string } | undefined;
  if (!hit) return null;
  db().prepare("UPDATE lesson_cache SET uses = uses + 1 WHERE id = ?").run(hit.id);
  return { ...(JSON.parse(hit.payload) as Lesson), source: "cache" };
}

export interface LessonArgs {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  theme: string;
  gradeBand: GradeBand;
}

/**
 * The lesson a student sees before a stage's questions. Same chain as
 * getQuestion: generate fresh, then this slot's cache, then the offline bank.
 * Always returns a lesson.
 */
export async function getLesson(args: LessonArgs): Promise<Lesson> {
  const slot = lessonSlot(args);
  const topic = getTopic(args.subject, args.topic);
  const theme = getTheme(args.theme);

  if (hasApiKey()) {
    try {
      const res = await withDeadline(
        client().messages.parse({
          model: MODEL,
          max_tokens: 2000,
          system: [{ type: "text", text: LESSON_SYSTEM, cache_control: { type: "ephemeral" } }],
          output_config: { effort: "low", format: zodOutputFormat(LessonSchema) },
          messages: [
            {
              role: "user",
              content: [
                `Skill to teach: ${topic.label} (topic id: ${topic.id})`,
                `Difficulty: ${args.difficulty} of 5 — pitch the example at this level`,
                `Interest theme: ${theme.label} — ${theme.flavor}`,
                `Reading level: ${GRADE_GUIDANCE[args.gradeBand]}`,
              ].join("\n"),
            },
          ],
        }),
        LESSON_TIMEOUT_MS,
        "lesson generation",
      );

      if (res.stop_reason === "refusal") {
        console.warn("[ai] lesson refused:", res.stop_details?.category);
      } else if (res.parsed_output) {
        const problem = validateLesson(res.parsed_output);
        if (problem) {
          console.warn("[ai] rejected generated lesson:", problem);
        } else {
          const p = res.parsed_output;
          const lesson: Lesson = {
            id: id("les"),
            topic: topic.id,
            difficulty: args.difficulty,
            title: p.title.trim(),
            intro: p.intro.trim(),
            steps: p.steps.map((x) => x.trim()),
            example: {
              problem: p.exampleProblem.trim(),
              working: p.exampleWorking.map((x) => x.trim()),
              answer: p.exampleAnswer.trim(),
            },
            tip: p.tip.trim(),
            source: "ai",
          };
          cacheLesson(slot, lesson);
          return lesson;
        }
      }
    } catch (err) {
      logApiError("lesson", err);
    }
  }

  return cachedLesson(slot) ?? fallbackLesson(args);
}

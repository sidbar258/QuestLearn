// Quest play loop: hand out a question, grade it, move the student along.
//
// Grading happens here, not in the browser. The client is told what it needs to
// render and nothing more — it never receives answerIndex before answering.

import { adapt, type Adaptation } from "./adaptive";
import { getLesson, getQuestion, getQuestLine, markServed } from "./ai";
import { db, id, nowIso, today } from "./db";
import { getTopic } from "./catalog";
import { awardBadges, levelFromXp, touchStreak, xpForAnswer } from "./gamify";
import { addXp, getStudent, setDifficulty } from "./students";
import type { Badge, Difficulty, Lesson, Question, QuestLine, QuestStage, Student } from "./types";

// --- quest lines -------------------------------------------------------------

interface QuestLineRow {
  id: string;
  student_id: string;
  subject: string;
  theme: string;
  title: string;
  blurb: string;
  stages: string;
  created_at: string;
}

function toQuestLine(r: QuestLineRow): QuestLine {
  return {
    id: r.id,
    studentId: r.student_id,
    subject: r.subject,
    theme: r.theme,
    title: r.title,
    blurb: r.blurb,
    stages: JSON.parse(r.stages) as QuestStage[],
    createdAt: r.created_at,
  };
}

export function activeQuestLine(studentId: string): QuestLine | null {
  const r = db()
    .prepare("SELECT * FROM questlines WHERE student_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1")
    .get(studentId) as QuestLineRow | undefined;
  return r ? toQuestLine(r) : null;
}

function saveStages(questlineId: string, stages: QuestStage[]) {
  db().prepare("UPDATE questlines SET stages = ? WHERE id = ?").run(JSON.stringify(stages), questlineId);
}

/** Retire any open quest line and generate a fresh one at the student's level. */
export async function startQuestLine(student: Student): Promise<QuestLine> {
  db().prepare("UPDATE questlines SET active = 0 WHERE student_id = ?").run(student.id);

  const generated = await getQuestLine({
    subject: student.subject,
    theme: student.theme,
    skillLevel: student.skillLevel ?? "beginner",
    difficulty: student.difficulty,
    gradeBand: student.gradeBand,
  });

  const questline: QuestLine = {
    id: id("ql"),
    studentId: student.id,
    subject: student.subject,
    theme: student.theme,
    title: generated.title,
    blurb: generated.blurb,
    stages: generated.stages,
    createdAt: nowIso(),
  };

  db()
    .prepare(
      `INSERT INTO questlines (id, student_id, subject, theme, title, blurb, stages, active, created_at)
       VALUES (@id, @studentId, @subject, @theme, @title, @blurb, @stages, 1, @createdAt)`,
    )
    .run({ ...questline, stages: JSON.stringify(questline.stages) });

  return questline;
}

// --- serving a question ------------------------------------------------------

/** What the browser is allowed to see. Note the absent answerIndex. */
export interface ClientQuestion {
  id: string;
  prompt: string;
  choices: string[];
  hint: string;
  topic: string;
  topicLabel: string;
  difficulty: Difficulty;
  scaffolded: boolean;
  source: Question["source"];
}

export function toClientQuestion(q: Question, topicLabel: string): ClientQuestion {
  return {
    id: q.id,
    prompt: q.prompt,
    choices: q.choices,
    hint: q.hint,
    topic: q.topic,
    topicLabel,
    difficulty: q.difficulty,
    scaffolded: q.scaffolded ?? false,
    source: q.source,
  };
}

export function stashQuestion(
  studentId: string,
  q: Question,
  ctx: { context: "quest" | "diagnostic"; questlineId?: string; stageId?: string },
) {
  db()
    .prepare(
      `INSERT OR REPLACE INTO current_question (student_id, payload, questline_id, stage_id, context, served_at)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(studentId, JSON.stringify(q), ctx.questlineId ?? null, ctx.stageId ?? null, ctx.context, nowIso());
}

export function takeStashedQuestion(
  studentId: string,
): { question: Question; questlineId: string | null; stageId: string | null; context: string } | null {
  const r = db().prepare("SELECT * FROM current_question WHERE student_id = ?").get(studentId) as
    | { payload: string; questline_id: string | null; stage_id: string | null; context: string }
    | undefined;
  if (!r) return null;
  return {
    question: JSON.parse(r.payload) as Question,
    questlineId: r.questline_id,
    stageId: r.stage_id,
    context: r.context,
  };
}

export function clearStashedQuestion(studentId: string) {
  db().prepare("DELETE FROM current_question WHERE student_id = ?").run(studentId);
}

/**
 * What the student should see next. A stage always teaches before it asks, so
 * the first thing a new stage hands back is a lesson, not a question.
 */
export type NextStep =
  | {
      mode: "lesson";
      lesson: Lesson;
      questline: QuestLine;
      stage: QuestStage;
      topicLabel: string;
      finished: false;
    }
  | {
      mode: "question";
      question: ClientQuestion;
      questline: QuestLine;
      stage: QuestStage;
      adaptation: Adaptation;
      finished: false;
    }
  | { mode: "done"; questline: QuestLine; finished: true };

export async function nextStep(student: Student): Promise<NextStep> {
  let questline = activeQuestLine(student.id);
  if (!questline) questline = await startQuestLine(student);

  const stage = questline.stages.find((s) => s.status === "active");
  if (!stage) return { mode: "done", questline, finished: true };

  // Teach first. A student who has never seen how fractions work cannot
  // practise their way into understanding them — they just fail and quit.
  if (!stage.lessonSeen) {
    const lesson = await getLesson({
      subject: questline.subject,
      topic: stage.topic,
      difficulty: stage.difficulty,
      theme: questline.theme,
      gradeBand: student.gradeBand,
    });
    return {
      mode: "lesson",
      lesson,
      questline,
      stage,
      topicLabel: getTopic(questline.subject, stage.topic).label,
      finished: false,
    };
  }

  // The stage sets a nominal difficulty; the adaptive engine can override it.
  // Struggling wins outright — nobody should be stuck on a wall because the
  // stage says "hard". Mastery is allowed to push past the stage's ceiling.
  const adaptation = adapt(student.id, student.difficulty);
  const difficulty: Difficulty =
    adaptation.reason === "struggle"
      ? adaptation.difficulty
      : adaptation.reason === "mastery"
        ? (Math.max(stage.difficulty, adaptation.difficulty) as Difficulty)
        : stage.difficulty;

  if (difficulty !== student.difficulty) setDifficulty(student.id, difficulty);

  const q = await getQuestion({
    subject: questline.subject,
    topic: stage.topic,
    difficulty,
    theme: questline.theme,
    gradeBand: student.gradeBand,
    scaffold: adaptation.scaffold,
    studentId: student.id,
  });

  stashQuestion(student.id, q, { context: "quest", questlineId: questline.id, stageId: stage.id });
  markServed(student.id, q.id);

  return {
    mode: "question",
    question: toClientQuestion(q, getTopic(questline.subject, q.topic).label),
    questline,
    stage,
    adaptation,
    finished: false,
  };
}

/** Mark the active stage's lesson as read, so the next call serves questions. */
export function markLessonSeen(student: Student): QuestLine | null {
  const questline = activeQuestLine(student.id);
  if (!questline) return null;
  const stage = questline.stages.find((s) => s.status === "active");
  if (!stage) return questline;
  stage.lessonSeen = true;
  saveStages(questline.id, questline.stages);
  return questline;
}

/**
 * Re-fetch the current stage's lesson without changing any state, so a student
 * mid-stage can look the method up again instead of guessing.
 */
export async function activeStageLesson(
  student: Student,
): Promise<{ lesson: Lesson; topicLabel: string } | null> {
  const questline = activeQuestLine(student.id);
  const stage = questline?.stages.find((s) => s.status === "active");
  if (!questline || !stage) return null;
  const lesson = await getLesson({
    subject: questline.subject,
    topic: stage.topic,
    difficulty: stage.difficulty,
    theme: questline.theme,
    gradeBand: student.gradeBand,
  });
  return { lesson, topicLabel: getTopic(questline.subject, stage.topic).label };
}

// --- grading -----------------------------------------------------------------

export interface AnswerOutcome {
  correct: boolean;
  answerIndex: number;
  explanation: string;
  xpGained: number;
  xpTotal: number;
  level: number;
  levelPct: number;
  leveledUp: boolean;
  streakDays: number;
  newBadges: Badge[];
  adaptation: Adaptation;
  stageComplete: boolean;
  questComplete: boolean;
  stageTitle: string | null;
}

export function submitAnswer(student: Student, choiceIndex: number, timeMs: number): AnswerOutcome | null {
  const stashed = takeStashedQuestion(student.id);
  if (!stashed) return null;

  const { question, questlineId, stageId } = stashed;
  const correct = choiceIndex === question.answerIndex;

  db()
    .prepare(
      `INSERT INTO answers (student_id, questline_id, stage_id, topic, difficulty, correct, time_ms, day, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      student.id,
      questlineId,
      stageId,
      question.topic,
      question.difficulty,
      correct ? 1 : 0,
      Math.max(0, timeMs),
      today(),
      nowIso(),
    );

  clearStashedQuestion(student.id);

  const xpGained = xpForAnswer(correct, question.difficulty, timeMs);
  const { xp, level, leveledUp } = addXp(student.id, xpGained);
  const { streakDays } = touchStreak(student);

  // Advance the stage only on a correct answer — a stage is "3 right", not "3 tries".
  let stageComplete = false;
  let questComplete = false;
  let stageTitle: string | null = null;

  if (correct && questlineId && stageId) {
    const ql = activeQuestLine(student.id);
    if (ql && ql.id === questlineId) {
      const stages = ql.stages;
      const ix = stages.findIndex((s) => s.id === stageId);
      if (ix >= 0) {
        const stage = stages[ix];
        stage.questionsDone += 1;
        stageTitle = stage.title;
        if (stage.questionsDone >= stage.questionsTarget) {
          stage.status = "done";
          stageComplete = true;
          const next = stages[ix + 1];
          if (next) next.status = "active";
          else {
            questComplete = true;
            db().prepare("UPDATE questlines SET active = 0 WHERE id = ?").run(ql.id);
          }
        }
        saveStages(ql.id, stages);
      }
    }
  }

  const after = getStudent(student.id)!;
  const newBadges = awardBadges(after, { questCompleted: questComplete });

  // Reported for the client, but deliberately NOT persisted here. nextQuestion()
  // is the single owner of the student's difficulty — when both applied the
  // step, one struggle moved a student two levels at once (d4 → d2), skipping
  // the rung they actually needed.
  const adaptation = adapt(student.id, after.difficulty);

  return {
    correct,
    answerIndex: question.answerIndex,
    explanation: question.explanation,
    xpGained,
    xpTotal: xp,
    level,
    levelPct: levelFromXp(xp).pct,
    leveledUp,
    streakDays,
    newBadges,
    adaptation,
    stageComplete,
    questComplete,
    stageTitle,
  };
}

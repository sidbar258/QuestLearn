// Real-time difficulty adaptation. Reads the answer log — the same log the
// parent dashboard summarises — so the thing that reacts to a student and the
// thing that reports on them can never disagree.

import { db } from "./db";
import { FAST_ANSWER_MS } from "./gamify";
import type { Difficulty } from "./types";

export type AdaptReason = "struggle" | "mastery" | "hold";

export interface Adaptation {
  difficulty: Difficulty;
  /** Ask the generator to break the next question into a smaller step. */
  scaffold: boolean;
  reason: AdaptReason;
  /** Kid-facing, shown only when the level actually moves. */
  message: string | null;
}

const STRUGGLE_RUN = 2; // consecutive misses before we step down
const MASTERY_RUN = 3;  // consecutive quick wins before we step up

function clamp(d: number): Difficulty {
  return Math.max(1, Math.min(5, d)) as Difficulty;
}

interface Recent {
  correct: number;
  time_ms: number;
}

/**
 * Decide the difficulty for the *next* question after `current`.
 * Struggle is checked first: getting a student unstuck outranks pushing them.
 */
export function adapt(studentId: string, current: Difficulty): Adaptation {
  const recent = db()
    .prepare("SELECT correct, time_ms FROM answers WHERE student_id = ? ORDER BY id DESC LIMIT ?")
    .all(studentId, MASTERY_RUN) as Recent[];

  const missRun = countRun(recent, 0);
  if (missRun >= STRUGGLE_RUN) {
    const next = clamp(current - 1);
    return {
      difficulty: next,
      scaffold: true,
      reason: "struggle",
      message: next < current ? "Let's try one a little easier 💪" : "Let's break this one down 💪",
    };
  }

  const winRun = countRun(recent, 1);
  if (winRun >= MASTERY_RUN && recent.every((r) => r.time_ms > 0 && r.time_ms < FAST_ANSWER_MS)) {
    const next = clamp(current + 1);
    return {
      difficulty: next,
      scaffold: false,
      reason: next > current ? "mastery" : "hold",
      message: next > current ? "You're crushing it — level up! 🔥" : null,
    };
  }

  return { difficulty: current, scaffold: false, reason: "hold", message: null };
}

function countRun(recent: Recent[], want: 0 | 1): number {
  let n = 0;
  for (const r of recent) {
    if (r.correct === want) n++;
    else break;
  }
  return n;
}

// --- Diagnostic quiz ---------------------------------------------------------
// A short staircase: start mid, step up on a correct answer and down on a miss.
// After DIAGNOSTIC_LENGTH questions the difficulties the student actually held
// their own at settle into a skill level.

export const DIAGNOSTIC_LENGTH = 7;

export interface DiagnosticState {
  asked: { topic: string; difficulty: Difficulty; correct: boolean }[];
  difficulty: Difficulty;
  /**
   * How far above the student's grade the staircase may climb.
   *
   * Without this, seven lucky guesses walk a five-year-old up to 6th-grade
   * ratios, and the quest line then gets built there — reading-heavy problems
   * they cannot read, which is precisely the wall this app exists to remove.
   * With four choices a guess lands 25% of the time, so this is not a rare
   * case. Under-placing costs far less: the in-quest mastery engine promotes a
   * genuinely advanced student within a few questions, while an over-placed one
   * just quits.
   */
  ceiling: Difficulty;
}

export function newDiagnostic(start: Difficulty = 2): DiagnosticState {
  return { asked: [], difficulty: start, ceiling: clamp(start + 1) };
}

export function diagnosticNext(state: DiagnosticState, wasCorrect: boolean): DiagnosticState {
  const step = wasCorrect ? 1 : -1;
  const ceiling = state.ceiling ?? 5;
  return { ...state, difficulty: Math.min(ceiling, clamp(state.difficulty + step)) as Difficulty };
}

export function diagnosticDone(state: DiagnosticState): boolean {
  return state.asked.length >= DIAGNOSTIC_LENGTH;
}

/**
 * Score the staircase, then read it against what this grade is expected to
 * handle.
 *
 * `difficulty` is absolute — it decides what content the student actually gets,
 * and that must match ability, never grade. `level` is relative, because
 * "beginner" should mean "behind where they are", not "young": a kindergartener
 * who tops out at the K-1 rung is doing well, and grading them against a 6th
 * grader's ladder would label every five-year-old a beginner forever.
 *
 * A correct answer counts for its full difficulty, a miss for one step below —
 * so a student who tops out at 4 but misses 5 lands between the two rather than
 * being punished for reaching.
 */
export function scoreDiagnostic(
  state: DiagnosticState,
  expected: Difficulty = 2,
): {
  level: "beginner" | "intermediate" | "advanced";
  difficulty: Difficulty;
  score: number;
} {
  if (state.asked.length === 0) {
    return { level: "beginner", difficulty: 1, score: 1 };
  }
  const total = state.asked.reduce(
    (sum, a) => sum + (a.correct ? a.difficulty : Math.max(0.5, a.difficulty - 1)),
    0,
  );
  const score = total / state.asked.length;
  // Never place a student more than one rung above their grade, for the same
  // reason the staircase is capped.
  const ceiling = state.ceiling ?? clamp(expected + 1);
  const difficulty = Math.min(ceiling, clamp(Math.round(score))) as Difficulty;
  const delta = score - expected;
  // <= not <: a K-1 student who misses every question bottoms out at 0.5
  // against an expected 1.0, landing on exactly -0.5. They are a beginner.
  // A capped perfect run tops out around expected + 0.86, so "advanced" has to
  // sit below that or it would be unreachable for every grade.
  const level = delta <= -0.5 ? "beginner" : delta < 0.7 ? "intermediate" : "advanced";
  return { level, difficulty, score: Math.round(score * 10) / 10 };
}

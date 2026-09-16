// The adaptive placement quiz. Seven questions on a staircase: right and it
// steps up, wrong and it steps down, so it converges on the student's edge
// instead of marching them through a fixed worksheet.

import {
  DIAGNOSTIC_LENGTH,
  diagnosticDone,
  diagnosticNext,
  newDiagnostic,
  scoreDiagnostic,
  type DiagnosticState,
} from "./adaptive";
import { getQuestion, markServed } from "./ai";
import { getTopic, topicsAtDifficulty } from "./catalog";
import { db, id, nowIso } from "./db";
import {
  clearStashedQuestion,
  stashQuestion,
  takeStashedQuestion,
  toClientQuestion,
  type ClientQuestion,
} from "./play";
import { setSkillLevel } from "./students";
import type { Difficulty, SkillLevel, Student } from "./types";

interface Row {
  id: string;
  student_id: string;
  subject: string;
  state: string;
  result_level: string | null;
  completed_at: string | null;
}

function openDiagnostic(studentId: string): { id: string; state: DiagnosticState } | null {
  const r = db()
    .prepare("SELECT * FROM diagnostics WHERE student_id = ? AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .get(studentId) as Row | undefined;
  return r ? { id: r.id, state: JSON.parse(r.state) as DiagnosticState } : null;
}

function saveState(diagnosticId: string, state: DiagnosticState) {
  db().prepare("UPDATE diagnostics SET state = ? WHERE id = ?").run(JSON.stringify(state), diagnosticId);
}

export function startDiagnostic(student: Student): { id: string; state: DiagnosticState } {
  // Abandon any half-finished attempt rather than resuming a stale one.
  db()
    .prepare("UPDATE diagnostics SET completed_at = ? WHERE student_id = ? AND completed_at IS NULL")
    .run(nowIso(), student.id);
  clearStashedQuestion(student.id);

  const state = newDiagnostic();
  const diagId = id("dg");
  db()
    .prepare("INSERT INTO diagnostics (id, student_id, subject, state, created_at) VALUES (?,?,?,?,?)")
    .run(diagId, student.id, student.subject, JSON.stringify(state), nowIso());
  return { id: diagId, state };
}

export interface DiagnosticQuestion {
  question: ClientQuestion;
  index: number; // 1-based
  total: number;
}

export async function nextDiagnosticQuestion(student: Student): Promise<DiagnosticQuestion> {
  const open = openDiagnostic(student.id) ?? startDiagnostic(student);
  const { state } = open;

  // Rotate topics so the placement isn't decided by one narrow skill.
  const pool = topicsAtDifficulty(student.subject, state.difficulty);
  const used = new Set(state.asked.map((a) => a.topic));
  const unused = pool.filter((t) => !used.has(t.id));
  const topic = (unused.length > 0 ? unused : pool)[state.asked.length % (unused.length > 0 ? unused.length : pool.length)];

  const q = await getQuestion({
    subject: student.subject,
    topic: topic.id,
    difficulty: state.difficulty,
    theme: student.theme,
    ageBand: student.ageBand,
    studentId: student.id,
  });

  stashQuestion(student.id, q, { context: "diagnostic" });
  markServed(student.id, q.id);

  return {
    question: toClientQuestion(q, getTopic(student.subject, q.topic).label),
    index: state.asked.length + 1,
    total: DIAGNOSTIC_LENGTH,
  };
}

export interface DiagnosticAnswer {
  correct: boolean;
  answerIndex: number;
  explanation: string;
  index: number;
  total: number;
  done: boolean;
  result: { level: SkillLevel; difficulty: Difficulty; score: number } | null;
}

export function answerDiagnostic(student: Student, choiceIndex: number): DiagnosticAnswer | null {
  const open = openDiagnostic(student.id);
  const stashed = takeStashedQuestion(student.id);
  if (!open || !stashed || stashed.context !== "diagnostic") return null;

  const { question } = stashed;
  const correct = choiceIndex === question.answerIndex;
  clearStashedQuestion(student.id);

  const state: DiagnosticState = {
    ...diagnosticNext(open.state, correct),
    asked: [...open.state.asked, { topic: question.topic, difficulty: question.difficulty, correct }],
  };
  saveState(open.id, state);

  // The diagnostic is placement, not practice — its answers stay out of the
  // answer log so they can't skew the adaptive engine or the parent summary.
  const done = diagnosticDone(state);
  let result: DiagnosticAnswer["result"] = null;

  if (done) {
    const scored = scoreDiagnostic(state);
    result = scored;
    db()
      .prepare("UPDATE diagnostics SET result_level = ?, completed_at = ? WHERE id = ?")
      .run(scored.level, nowIso(), open.id);
    setSkillLevel(student.id, scored.level, scored.difficulty);
  }

  return {
    correct,
    answerIndex: question.answerIndex,
    explanation: question.explanation,
    index: state.asked.length,
    total: DIAGNOSTIC_LENGTH,
    done,
    result,
  };
}

export function hasCompletedDiagnostic(studentId: string): boolean {
  const r = db()
    .prepare("SELECT 1 AS x FROM diagnostics WHERE student_id = ? AND completed_at IS NOT NULL AND result_level IS NOT NULL LIMIT 1")
    .get(studentId) as { x: number } | undefined;
  return Boolean(r);
}

// Parent/teacher summary. The brief is explicit that this must be a summary,
// not a data dump — so this module deliberately exposes judgements ("struggling
// with fractions") rather than the answer log those judgements come from.

import { getTopic } from "./catalog";
import { db, daysBetween, today } from "./db";
import { earnedBadges, levelFromXp } from "./gamify";
import { getStudent } from "./students";
import type { Badge, Student } from "./types";

const MASTERED_MIN_ATTEMPTS = 5;
const MASTERED_ACCURACY = 0.8;
const STRUGGLING_MIN_ATTEMPTS = 3;
const STRUGGLING_ACCURACY = 0.5;

export interface TopicSummary {
  topic: string;
  label: string;
  attempts: number;
  accuracy: number; // 0-1
}

export interface DaySummary {
  date: string;
  answered: number;
}

export interface StudentSummary {
  student: Student;
  level: number;
  levelPct: number;
  xp: number;
  streakDays: number;
  streakAlive: boolean;
  badges: (Badge & { earnedAt: string })[];
  mastered: TopicSummary[];
  struggling: TopicSummary[];
  practising: TopicSummary[];
  totalAnswered: number;
  accuracy: number;
  lastSevenDays: DaySummary[];
  activeDaysThisWeek: number;
  /** One plain-English line a busy parent can act on. */
  headline: string;
}

function topicRows(studentId: string): TopicSummary[] {
  const rows = db()
    .prepare(
      `SELECT topic, COUNT(*) AS attempts, SUM(correct) AS correct
         FROM answers WHERE student_id = ? GROUP BY topic ORDER BY attempts DESC`,
    )
    .all(studentId) as { topic: string; attempts: number; correct: number | null }[];

  return rows.map((r) => ({
    topic: r.topic,
    label: getTopic("math", r.topic).label,
    attempts: r.attempts,
    accuracy: r.attempts > 0 ? (r.correct ?? 0) / r.attempts : 0,
  }));
}

function lastSevenDays(studentId: string): DaySummary[] {
  const rows = db()
    .prepare(
      `SELECT day AS d, COUNT(*) AS n
         FROM answers WHERE student_id = ? GROUP BY day`,
    )
    .all(studentId) as { d: string; n: number }[];
  const byDate = new Map(rows.map((r) => [r.d, r.n]));

  const out: DaySummary[] = [];
  const now = new Date();
  for (let back = 6; back >= 0; back--) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const pad = (n: number) => String(n).padStart(2, "0");
    const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    out.push({ date: key, answered: byDate.get(key) ?? 0 });
  }
  return out;
}

export function summarise(studentId: string): StudentSummary | null {
  const student = getStudent(studentId);
  if (!student) return null;

  const topics = topicRows(studentId);
  const mastered = topics.filter(
    (t) => t.attempts >= MASTERED_MIN_ATTEMPTS && t.accuracy >= MASTERED_ACCURACY,
  );
  const struggling = topics.filter(
    (t) => t.attempts >= STRUGGLING_MIN_ATTEMPTS && t.accuracy < STRUGGLING_ACCURACY,
  );
  const practising = topics.filter(
    (t) => !mastered.includes(t) && !struggling.includes(t) && t.attempts > 0,
  );

  const agg = db()
    .prepare("SELECT COUNT(*) AS total, SUM(correct) AS correct FROM answers WHERE student_id = ?")
    .get(studentId) as { total: number; correct: number | null };
  const totalAnswered = agg.total ?? 0;
  const accuracy = totalAnswered > 0 ? (agg.correct ?? 0) / totalAnswered : 0;

  const week = lastSevenDays(studentId);
  const activeDaysThisWeek = week.filter((d) => d.answered > 0).length;

  const gap = student.lastActiveDate ? daysBetween(student.lastActiveDate, today()) : Infinity;
  const streakAlive = gap <= 1;
  const { level, pct } = levelFromXp(student.xp);

  return {
    student,
    level,
    levelPct: pct,
    xp: student.xp,
    streakDays: streakAlive ? student.streakDays : 0,
    streakAlive,
    badges: earnedBadges(studentId),
    mastered,
    struggling,
    practising,
    totalAnswered,
    accuracy,
    lastSevenDays: week,
    activeDaysThisWeek,
    headline: headlineFor({
      name: student.name,
      totalAnswered,
      struggling,
      mastered,
      activeDaysThisWeek,
      streakAlive,
      streakDays: student.streakDays,
    }),
  };
}

function headlineFor(a: {
  name: string;
  totalAnswered: number;
  struggling: TopicSummary[];
  mastered: TopicSummary[];
  activeDaysThisWeek: number;
  streakAlive: boolean;
  streakDays: number;
}): string {
  if (a.totalAnswered === 0) return `${a.name} hasn't started a quest yet.`;
  if (a.struggling.length > 0) {
    const names = a.struggling.slice(0, 2).map((t) => t.label.toLowerCase()).join(" and ");
    return `${a.name} is finding ${names} hard right now — worth sitting with them on it.`;
  }
  if (a.mastered.length > 0 && a.streakAlive && a.streakDays >= 3) {
    return `${a.name} is on a ${a.streakDays}-day streak and has ${a.mastered.length} topic${a.mastered.length === 1 ? "" : "s"} solid. Nothing to worry about.`;
  }
  if (a.activeDaysThisWeek === 0) return `${a.name} hasn't practised this week.`;
  return `${a.name} is practising steadily — no topics flagged.`;
}

export function summariseAll(): StudentSummary[] {
  const ids = db().prepare("SELECT id FROM students ORDER BY created_at").all() as { id: string }[];
  return ids.flatMap((r) => {
    const s = summarise(r.id);
    return s ? [s] : [];
  });
}

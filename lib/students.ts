// Student records. Deliberately thin on personal data: a display name, an age
// band (not a birthday), an avatar emoji and a chosen theme. No email, no
// surname, no free-text profile — there is nothing here worth breaching.

import { db, id, nowIso, today } from "./db";
import { levelFromXp } from "./gamify";
import type { GradeBand, Difficulty, SkillLevel, Student } from "./types";

interface Row {
  id: string;
  name: string;
  avatar: string;
  grade_band: string;
  theme: string;
  subject: string;
  skill_level: string | null;
  difficulty: number;
  xp: number;
  level: number;
  streak_days: number;
  last_active_date: string | null;
  created_at: string;
}

function toStudent(r: Row): Student {
  return {
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    gradeBand: r.grade_band as GradeBand,
    theme: r.theme,
    subject: r.subject,
    skillLevel: r.skill_level as SkillLevel | null,
    difficulty: r.difficulty as Difficulty,
    xp: r.xp,
    level: r.level,
    streakDays: r.streak_days,
    lastActiveDate: r.last_active_date,
    createdAt: r.created_at,
  };
}

export function listStudents(): Student[] {
  const rows = db().prepare("SELECT * FROM students ORDER BY created_at").all() as Row[];
  return rows.map(toStudent);
}

export function getStudent(studentId: string): Student | null {
  const r = db().prepare("SELECT * FROM students WHERE id = ?").get(studentId) as Row | undefined;
  return r ? toStudent(r) : null;
}

export function createStudent(input: {
  name: string;
  avatar: string;
  gradeBand: GradeBand;
  theme: string;
  subject?: string;
}): Student {
  const student: Student = {
    id: id("stu"),
    name: input.name.trim().slice(0, 24),
    avatar: input.avatar,
    gradeBand: input.gradeBand,
    theme: input.theme,
    subject: input.subject ?? "math",
    skillLevel: null,
    difficulty: 2,
    xp: 0,
    level: 1,
    streakDays: 0,
    lastActiveDate: null,
    createdAt: nowIso(),
  };
  db()
    .prepare(
      `INSERT INTO students (id, name, avatar, grade_band, theme, subject, skill_level, difficulty, xp, level, streak_days, last_active_date, created_at)
       VALUES (@id, @name, @avatar, @gradeBand, @theme, @subject, NULL, @difficulty, 0, 1, 0, NULL, @createdAt)`,
    )
    .run(student);
  return student;
}

export function setSkillLevel(studentId: string, level: SkillLevel, difficulty: Difficulty) {
  db()
    .prepare("UPDATE students SET skill_level = ?, difficulty = ? WHERE id = ?")
    .run(level, difficulty, studentId);
}

export function setDifficulty(studentId: string, difficulty: Difficulty) {
  db().prepare("UPDATE students SET difficulty = ? WHERE id = ?").run(difficulty, studentId);
}

export function updateProfile(studentId: string, patch: { theme?: string; name?: string; avatar?: string }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.theme) { sets.push("theme = ?"); vals.push(patch.theme); }
  if (patch.name) { sets.push("name = ?"); vals.push(patch.name.trim().slice(0, 24)); }
  if (patch.avatar) { sets.push("avatar = ?"); vals.push(patch.avatar); }
  if (sets.length === 0) return;
  vals.push(studentId);
  db().prepare(`UPDATE students SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

/** Add XP and recompute level. Returns whether the student levelled up. */
export function addXp(studentId: string, amount: number): { xp: number; level: number; leveledUp: boolean } {
  const before = getStudent(studentId);
  if (!before) throw new Error(`unknown student ${studentId}`);
  const xp = before.xp + amount;
  const { level } = levelFromXp(xp);
  db().prepare("UPDATE students SET xp = ?, level = ? WHERE id = ?").run(xp, level, studentId);
  return { xp, level, leveledUp: level > before.level };
}

export function deleteStudent(studentId: string) {
  const conn = db();
  conn.prepare("DELETE FROM served_questions WHERE student_id = ?").run(studentId);
  conn.prepare("DELETE FROM students WHERE id = ?").run(studentId); // cascades the rest
}

export function markActiveToday(studentId: string) {
  db().prepare("UPDATE students SET last_active_date = ? WHERE id = ?").run(today(), studentId);
}

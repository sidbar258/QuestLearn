// XP, levels, streaks and badges. Deliberately generous: a wrong answer still
// earns a little XP, because the students this is built for disengage fastest
// when a system only ever rewards already knowing the answer.

import { db, daysBetween, nowIso, today } from "./db";
import type { Badge, Difficulty, Student } from "./types";

/** XP needed to go from `level` to `level + 1`. Grows gently, never walls off. */
export function xpForNextLevel(level: number): number {
  return 100 + 25 * (level - 1);
}

/** Cumulative XP required to *be* at `level`. Level 1 starts at 0. */
export function xpToReachLevel(level: number): number {
  const n = level - 1;
  return 100 * n + (25 * n * (n - 1)) / 2;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans end to end. */
  span: number;
  /** 0–100, for the progress bar. */
  pct: number;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (xp >= xpToReachLevel(level + 1)) level++;
  const base = xpToReachLevel(level);
  const span = xpForNextLevel(level);
  const into = xp - base;
  return { level, into, span, pct: Math.min(100, Math.round((into / span) * 100)) };
}

export const FAST_ANSWER_MS = 12_000;

/** XP for a single answer. Correct scales with difficulty; effort still counts. */
export function xpForAnswer(correct: boolean, difficulty: Difficulty, timeMs: number): number {
  if (!correct) return 2;
  const base = 10 * difficulty;
  const speedBonus = timeMs > 0 && timeMs < FAST_ANSWER_MS ? 5 : 0;
  return base + speedBonus;
}

/**
 * Roll the daily streak forward. Same day is a no-op, yesterday extends,
 * anything older restarts at 1.
 */
export function touchStreak(student: Student): { streakDays: number; extended: boolean } {
  const t = today();
  if (student.lastActiveDate === t) {
    return { streakDays: student.streakDays, extended: false };
  }
  const gap = student.lastActiveDate ? daysBetween(student.lastActiveDate, t) : Infinity;
  const streakDays = gap === 1 ? student.streakDays + 1 : 1;
  db()
    .prepare("UPDATE students SET streak_days = ?, last_active_date = ? WHERE id = ?")
    .run(streakDays, t, student.id);
  return { streakDays, extended: true };
}

export const BADGES: Badge[] = [
  { key: "first_steps",   label: "First Steps",    emoji: "👟", blurb: "Answered your first question" },
  { key: "quest_done",    label: "Quest Complete", emoji: "🗺️", blurb: "Finished a whole quest line" },
  { key: "streak_3",      label: "On a Roll",      emoji: "🔥", blurb: "3-day streak" },
  { key: "streak_7",      label: "Week Warrior",   emoji: "🗓️", blurb: "7-day streak" },
  { key: "streak_30",     label: "Unstoppable",    emoji: "💎", blurb: "30-day streak" },
  { key: "level_5",       label: "Rising Star",    emoji: "⭐", blurb: "Reached level 5" },
  { key: "level_10",      label: "Champion",       emoji: "🏆", blurb: "Reached level 10" },
  { key: "hot_streak_5",  label: "Hot Streak",     emoji: "⚡", blurb: "5 correct in a row" },
  { key: "speedster",     label: "Speedster",      emoji: "💨", blurb: "10 fast correct answers" },
  { key: "comeback",      label: "Comeback Kid",   emoji: "🛡️", blurb: "Got it right after two misses" },
  { key: "century",       label: "Centurion",      emoji: "💯", blurb: "Answered 100 questions" },
  { key: "hard_mode",     label: "Boss Slayer",    emoji: "🐉", blurb: "Beat a level 5 question" },
];

export function badgeByKey(key: string): Badge | undefined {
  return BADGES.find((b) => b.key === key);
}

interface BadgeStats {
  total: number;
  correct: number;
  runOfCorrect: number;
  fastCorrect: number;
  hardWin: boolean;
  comeback: boolean;
  questCompleted: boolean;
  level: number;
  streakDays: number;
}

function statsFor(student: Student, opts: { questCompleted: boolean }): BadgeStats {
  const conn = db();
  const agg = conn
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(correct) AS correct,
              SUM(CASE WHEN correct = 1 AND time_ms > 0 AND time_ms < ? THEN 1 ELSE 0 END) AS fast,
              MAX(CASE WHEN correct = 1 AND difficulty >= 5 THEN 1 ELSE 0 END) AS hard
         FROM answers WHERE student_id = ?`,
    )
    .get(FAST_ANSWER_MS, student.id) as {
    total: number; correct: number | null; fast: number | null; hard: number | null;
  };

  // Recent tail, newest first — enough to see a run and a comeback.
  const recent = conn
    .prepare("SELECT correct FROM answers WHERE student_id = ? ORDER BY id DESC LIMIT 10")
    .all(student.id) as { correct: number }[];

  let runOfCorrect = 0;
  for (const r of recent) {
    if (r.correct === 1) runOfCorrect++;
    else break;
  }
  const comeback =
    recent.length >= 3 && recent[0].correct === 1 && recent[1].correct === 0 && recent[2].correct === 0;

  return {
    total: agg.total ?? 0,
    correct: agg.correct ?? 0,
    runOfCorrect,
    fastCorrect: agg.fast ?? 0,
    hardWin: (agg.hard ?? 0) === 1,
    comeback,
    questCompleted: opts.questCompleted,
    level: student.level,
    streakDays: student.streakDays,
  };
}

const RULES: Record<string, (s: BadgeStats) => boolean> = {
  first_steps:  (s) => s.total >= 1,
  quest_done:   (s) => s.questCompleted,
  streak_3:     (s) => s.streakDays >= 3,
  streak_7:     (s) => s.streakDays >= 7,
  streak_30:    (s) => s.streakDays >= 30,
  level_5:      (s) => s.level >= 5,
  level_10:     (s) => s.level >= 10,
  hot_streak_5: (s) => s.runOfCorrect >= 5,
  speedster:    (s) => s.fastCorrect >= 10,
  comeback:     (s) => s.comeback,
  century:      (s) => s.total >= 100,
  hard_mode:    (s) => s.hardWin,
};

/** Evaluate every badge rule and persist newly-earned ones. Returns only the new. */
export function awardBadges(student: Student, opts = { questCompleted: false }): Badge[] {
  const conn = db();
  const owned = new Set(
    (conn.prepare("SELECT badge_key FROM badges WHERE student_id = ?").all(student.id) as {
      badge_key: string;
    }[]).map((r) => r.badge_key),
  );
  const stats = statsFor(student, opts);
  const insert = conn.prepare(
    "INSERT OR IGNORE INTO badges (student_id, badge_key, earned_at) VALUES (?, ?, ?)",
  );
  const fresh: Badge[] = [];
  for (const badge of BADGES) {
    if (owned.has(badge.key)) continue;
    if (RULES[badge.key]?.(stats)) {
      insert.run(student.id, badge.key, nowIso());
      fresh.push(badge);
    }
  }
  return fresh;
}

export function earnedBadges(studentId: string): (Badge & { earnedAt: string })[] {
  const rows = db()
    .prepare("SELECT badge_key, earned_at FROM badges WHERE student_id = ? ORDER BY earned_at")
    .all(studentId) as { badge_key: string; earned_at: string }[];
  return rows.flatMap((r) => {
    const b = badgeByKey(r.badge_key);
    return b ? [{ ...b, earnedAt: r.earned_at }] : [];
  });
}

// SQLite persistence. One file on disk, no external service — which keeps the
// whole app free to run and means progress survives restarts (NFR 4).

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_DIR = process.env.QUESTLEARN_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "questlearn.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  avatar           TEXT NOT NULL,
  grade_band         TEXT NOT NULL,
  theme            TEXT NOT NULL,
  subject          TEXT NOT NULL DEFAULT 'math',
  skill_level      TEXT,
  difficulty       INTEGER NOT NULL DEFAULT 2,
  xp               INTEGER NOT NULL DEFAULT 0,
  level            INTEGER NOT NULL DEFAULT 1,
  streak_days      INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  questline_id TEXT,
  stage_id     TEXT,
  topic        TEXT NOT NULL,
  difficulty   INTEGER NOT NULL,
  correct      INTEGER NOT NULL,
  time_ms      INTEGER NOT NULL DEFAULT 0,
  -- Local calendar day (YYYY-MM-DD). created_at is UTC, so bucketing the week
  -- by substr(created_at) disagrees with the streak once local time and UTC
  -- fall on different dates — which is most of every evening in the Americas.
  day          TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_student ON answers(student_id, id);
CREATE INDEX IF NOT EXISTS idx_answers_topic   ON answers(student_id, topic);
CREATE INDEX IF NOT EXISTS idx_answers_day     ON answers(student_id, day);

CREATE TABLE IF NOT EXISTS questlines (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  theme      TEXT NOT NULL,
  title      TEXT NOT NULL,
  blurb      TEXT NOT NULL,
  stages     TEXT NOT NULL,          -- JSON QuestStage[]
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questlines_student ON questlines(student_id, active);

CREATE TABLE IF NOT EXISTS badges (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_key  TEXT NOT NULL,
  earned_at  TEXT NOT NULL,
  PRIMARY KEY (student_id, badge_key)
);

-- Generated questions are cached so a repeat of the same (topic, difficulty,
-- theme, age) slot is instant and costs nothing — and still works if the API is
-- down. This is the "cached questions" half of the reliability requirement.
CREATE TABLE IF NOT EXISTS question_cache (
  id         TEXT PRIMARY KEY,
  slot       TEXT NOT NULL,          -- subject|topic|difficulty|theme|gradeBand|scaffold
  payload    TEXT NOT NULL,          -- JSON Question
  uses       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qcache_slot ON question_cache(slot, uses);

-- Generated lessons, cached per (topic, difficulty, theme, age) slot for the
-- same reason questions are: instant on a repeat, and still there if the API
-- isn't.
CREATE TABLE IF NOT EXISTS lesson_cache (
  id         TEXT PRIMARY KEY,
  slot       TEXT NOT NULL,
  payload    TEXT NOT NULL,          -- JSON Lesson
  uses       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lcache_slot ON lesson_cache(slot, uses);

-- Questions already served to a student, so we don't repeat one back at them.
CREATE TABLE IF NOT EXISTS served_questions (
  student_id  TEXT NOT NULL,
  question_id TEXT NOT NULL,
  served_at   TEXT NOT NULL,
  PRIMARY KEY (student_id, question_id)
);

-- The question a student is looking at right now. Held server-side so the
-- answer key never reaches the browser and grading can't be spoofed.
CREATE TABLE IF NOT EXISTS current_question (
  student_id   TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  payload      TEXT NOT NULL,        -- JSON Question, including answerIndex
  questline_id TEXT,
  stage_id     TEXT,
  context      TEXT NOT NULL,        -- 'quest' | 'diagnostic'
  served_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostics (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject      TEXT NOT NULL,
  state        TEXT NOT NULL,        -- JSON DiagnosticState
  result_level TEXT,
  completed_at TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(SCHEMA);
  migrate(conn);
  _db = conn;
  return conn;
}

/** Migrations for databases created by an earlier version. */
function migrate(conn: Database.Database) {
  const columnsOf = (table: string) =>
    (conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

  const answerCols = columnsOf("answers");
  if (!answerCols.includes("day")) {
    conn.exec("ALTER TABLE answers ADD COLUMN day TEXT NOT NULL DEFAULT ''");
  }
  // Backfill anything written before the column existed, using the UTC date as
  // the best available approximation.
  conn.exec("UPDATE answers SET day = substr(created_at, 1, 10) WHERE day = ''");

  // Students used to be keyed by age band (8-9 / 10-11 / 12-14) before the app
  // moved to K-6 grade bands. Rename in place and remap, so existing players
  // keep their level, streak and history instead of being wiped by a reword.
  const studentCols = columnsOf("students");
  if (studentCols.includes("age_band") && !studentCols.includes("grade_band")) {
    conn.exec("ALTER TABLE students RENAME COLUMN age_band TO grade_band");
    const remap: Record<string, string> = {
      "8-9": "2-3",   // ages 8-9 sit across 2nd-3rd
      "10-11": "4-5",
      "12-14": "6",   // the ladder now stops at 6th grade
    };
    const update = conn.prepare("UPDATE students SET grade_band = ? WHERE grade_band = ?");
    for (const [from, to] of Object.entries(remap)) update.run(to, from);
  }

  // Anything still holding an unrecognised band lands on the middle of the
  // range rather than breaking the generator's Record lookup.
  conn.exec("UPDATE students SET grade_band = '2-3' WHERE grade_band NOT IN ('K-1','2-3','4-5','6')");
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local calendar date (YYYY-MM-DD) — streaks are counted in the student's day. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

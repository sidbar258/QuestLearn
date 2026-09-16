// Shared domain types for QuestLearn.

export type SkillLevel = "beginner" | "intermediate" | "advanced";

/** 1 = easiest, 5 = hardest. The adaptive engine moves a student along this axis. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type AgeBand = "8-9" | "10-11" | "12-14";

export interface Theme {
  id: string;
  label: string;
  emoji: string;
  /** Fed to the model so it can reframe problems in the student's world. */
  flavor: string;
}

export interface Topic {
  id: string;
  label: string;
  /** Difficulty band this topic normally lives in. Drives quest sequencing. */
  band: [Difficulty, Difficulty];
}

export interface Question {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  hint: string;
  explanation: string;
  topic: string;
  difficulty: Difficulty;
  /** True when generated as a scaffolded step-down after a struggle. */
  scaffolded?: boolean;
  /** Where the question came from, for the reliability story. */
  source: "ai" | "cache" | "fallback";
}

export interface QuestStage {
  id: string;
  title: string;
  topic: string;
  difficulty: Difficulty;
  questionsTarget: number;
  questionsDone: number;
  status: "locked" | "active" | "done";
  /** Each stage teaches its topic before asking anything. */
  lessonSeen?: boolean;
}

/** A short "here's how this works" shown before a stage's questions. */
export interface Lesson {
  id: string;
  topic: string;
  difficulty: Difficulty;
  title: string;
  /** One sentence: what this skill actually is. */
  intro: string;
  /** 2–4 short steps — the method, in order. */
  steps: string[];
  /** One fully worked example, so the method is shown and not just described. */
  example: {
    problem: string;
    working: string[];
    answer: string;
  };
  /** The mistake students most often make here. */
  tip: string;
  source: "ai" | "cache" | "fallback";
}

export interface QuestLine {
  id: string;
  studentId: string;
  subject: string;
  theme: string;
  title: string;
  blurb: string;
  stages: QuestStage[];
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  avatar: string;
  ageBand: AgeBand;
  theme: string;
  subject: string;
  skillLevel: SkillLevel | null;
  difficulty: Difficulty;
  xp: number;
  level: number;
  streakDays: number;
  lastActiveDate: string | null;
  createdAt: string;
}

export interface AnswerRecord {
  id: number;
  studentId: string;
  questlineId: string | null;
  stageId: string | null;
  topic: string;
  difficulty: Difficulty;
  correct: 0 | 1;
  timeMs: number;
  createdAt: string;
}

export interface Badge {
  key: string;
  label: string;
  emoji: string;
  blurb: string;
}

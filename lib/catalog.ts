// The fixed scaffolding the AI generates *into*: subjects, topic ladders, and
// interest themes. Keeping this static (rather than model-generated) is what
// makes quest sequencing deterministic and the parent dashboard legible.

import type { Difficulty, GradeBand, SkillLevel, Theme, Topic } from "./types";

export const THEMES: Theme[] = [
  {
    id: "minecraft",
    label: "Minecraft",
    emoji: "⛏️",
    flavor:
      "blocks, mining, crafting recipes, redstone circuits, building bases, stacks of 64, creepers and villagers",
  },
  {
    id: "sports",
    label: "Sports",
    emoji: "⚽",
    flavor:
      "scoring points, team stats, tournament brackets, running times, ticket sales, training schedules",
  },
  {
    id: "space",
    label: "Space",
    emoji: "🚀",
    flavor:
      "rocket fuel, planets and moons, light-years, crew supplies, orbits, alien colonies",
  },
  {
    id: "animals",
    label: "Animals",
    emoji: "🐾",
    flavor:
      "zoo keeping, feeding schedules, habitats, animal speeds and weights, rescue shelters",
  },
  {
    id: "cooking",
    label: "Cooking",
    emoji: "🍕",
    flavor:
      "recipes and ingredients, slicing pizzas, doubling batches, bake times, running a food truck",
  },
  {
    id: "gaming",
    label: "Video Games",
    emoji: "🎮",
    flavor:
      "XP and loot drops, damage numbers, inventory slots, speedruns, level design, in-game currency",
  },
];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/**
 * Math topic ladder for Kindergarten through 6th grade.
 *
 * `band` is the difficulty range a topic lives in, and difficulty maps roughly
 * onto grade:
 *   1 → K–1    2 → 1–2    3 → 3–4    4 → 4–5    5 → 6
 *
 * The ceiling is 6th-grade material (ratios, percentages, one-step equations) —
 * there is deliberately nothing from middle-school algebra here.
 */
export const MATH_TOPICS: Topic[] = [
  // --- number sense (K–2) ---
  { id: "counting", label: "Counting", band: [1, 1] },
  { id: "comparing", label: "Bigger or Smaller", band: [1, 2] },
  { id: "shapes", label: "Shapes", band: [1, 2] },
  { id: "skip-counting", label: "Skip Counting", band: [1, 2] },
  { id: "addition", label: "Addition", band: [1, 3] },
  { id: "subtraction", label: "Subtraction", band: [1, 3] },
  { id: "place-value", label: "Place Value", band: [2, 3] },
  // --- operations and parts (3–5) ---
  { id: "multiplication", label: "Multiplication", band: [3, 4] },
  { id: "division", label: "Division", band: [3, 4] },
  { id: "fractions", label: "Fractions", band: [3, 5] },
  { id: "decimals", label: "Decimals", band: [4, 5] },
  // --- 6th grade ---
  { id: "percentages", label: "Percentages", band: [5, 5] },
  { id: "ratios", label: "Ratios & Rates", band: [5, 5] },
  { id: "pre-algebra", label: "Simple Equations", band: [5, 5] },
  { id: "word-problems", label: "Word Problems", band: [2, 5] },
];

export const SUBJECTS = [{ id: "math", label: "Math", emoji: "🔢", topics: MATH_TOPICS }];

export function getTopics(subject: string): Topic[] {
  return SUBJECTS.find((s) => s.id === subject)?.topics ?? MATH_TOPICS;
}

export function getTopic(subject: string, topicId: string): Topic {
  const topics = getTopics(subject);
  return topics.find((t) => t.id === topicId) ?? topics[0];
}

/** Topics whose band contains this difficulty — the pool a quest stage draws from. */
export function topicsAtDifficulty(subject: string, d: Difficulty): Topic[] {
  const hits = getTopics(subject).filter((t) => d >= t.band[0] && d <= t.band[1]);
  return hits.length > 0 ? hits : getTopics(subject);
}

export const SKILL_LEVEL_START: Record<SkillLevel, Difficulty> = {
  beginner: 1,
  intermediate: 3,
  advanced: 4,
};

/** The grades the app covers, in order, as the profile picker shows them. */
export const GRADE_BANDS: { id: GradeBand; label: string; blurb: string }[] = [
  { id: "K-1", label: "K–1", blurb: "Kindergarten & 1st" },
  { id: "2-3", label: "2–3", blurb: "2nd & 3rd" },
  { id: "4-5", label: "4–5", blurb: "4th & 5th" },
  { id: "6", label: "6", blurb: "6th grade" },
];

export function isGradeBand(v: string): v is GradeBand {
  return GRADE_BANDS.some((g) => g.id === v);
}

/**
 * Where the placement quiz starts for each grade. Starting every child at the
 * same rung means a kindergartener opens on work three grades above them —
 * the staircase would find its way down, but only after several misses, which
 * is exactly the experience this app exists to avoid.
 */
export const GRADE_START_DIFFICULTY: Record<GradeBand, Difficulty> = {
  "K-1": 1,
  "2-3": 2,
  "4-5": 3,
  "6": 4,
};

export const AVATARS = [
  "🦊", "🐸", "🦉", "🐬", "🦄",
  "🐙", "🦋", "🐧", "🦁", "🐢",
  "🦎", "🐝",
];

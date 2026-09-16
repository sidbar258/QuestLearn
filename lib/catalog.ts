// The fixed scaffolding the AI generates *into*: subjects, topic ladders, and
// interest themes. Keeping this static (rather than model-generated) is what
// makes quest sequencing deterministic and the parent dashboard legible.

import type { Difficulty, SkillLevel, Theme, Topic } from "./types";

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

/** Math topic ladder. Bands drive both quest sequencing and the diagnostic. */
export const MATH_TOPICS: Topic[] = [
  { id: "addition", label: "Addition", band: [1, 2] },
  { id: "subtraction", label: "Subtraction", band: [1, 2] },
  { id: "place-value", label: "Place Value", band: [1, 2] },
  { id: "multiplication", label: "Multiplication", band: [2, 3] },
  { id: "division", label: "Division", band: [2, 4] },
  { id: "fractions", label: "Fractions", band: [3, 4] },
  { id: "decimals", label: "Decimals", band: [3, 4] },
  { id: "percentages", label: "Percentages", band: [4, 5] },
  { id: "ratios", label: "Ratios & Rates", band: [4, 5] },
  { id: "pre-algebra", label: "Pre-Algebra", band: [4, 5] },
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

export const AVATARS = [
  "🦊", "🐸", "🦉", "🐬", "🦄",
  "🐙", "🦋", "🐧", "🦁", "🐢",
  "🦎", "🐝",
];

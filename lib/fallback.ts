// Deterministic, themed question generator. Two jobs:
//   1. Reliability — if the model is slow, rate-limited, or the key is missing,
//      the student never sees a dead end (NFR 4).
//   2. Zero-cost demo — the whole app is playable with no API key at all.
// Every answer here is computed, never hand-typed, so the bank can't drift.

import { getTheme } from "./catalog";
import type { Difficulty, Question } from "./types";

// --- seeded rng --------------------------------------------------------------

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Rng = () => number;
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: Rng, xs: T[]): T => xs[Math.floor(r() * xs.length)];

// --- theme vocabulary --------------------------------------------------------

export interface Vocab {
  actor: string;
  item: string;      // plural countable noun
  itemOne: string;
  container: string; // plural
  containerOne: string;
  verb: string;      // 3rd person, e.g. "mines"
  place: string;
}

const VOCAB: Record<string, Vocab> = {
  minecraft: { actor: "Alex", item: "blocks", itemOne: "block", container: "chests", containerOne: "chest", verb: "mines", place: "the base" },
  sports:    { actor: "Jordan", item: "points", itemOne: "point", container: "teams", containerOne: "team", verb: "scores", place: "the tournament" },
  space:     { actor: "Captain Rae", item: "fuel cells", itemOne: "fuel cell", container: "cargo pods", containerOne: "cargo pod", verb: "loads", place: "the station" },
  animals:   { actor: "Sam the keeper", item: "treats", itemOne: "treat", container: "habitats", containerOne: "habitat", verb: "hands out", place: "the sanctuary" },
  cooking:   { actor: "Chef Lu", item: "slices", itemOne: "slice", container: "trays", containerOne: "tray", verb: "bakes", place: "the food truck" },
  gaming:    { actor: "Pixel", item: "coins", itemOne: "coin", container: "inventory slots", containerOne: "slot", verb: "collects", place: "the level" },
};

export function vocab(themeId: string): Vocab {
  return VOCAB[themeId] ?? VOCAB.minecraft;
}

// --- multiple choice assembly ------------------------------------------------

/**
 * Build four unique choices around `correct`. Distractors are near-misses
 * (off-by-one, wrong operation) so a guess isn't obvious, then padded with
 * jitter if the caller's list collides.
 */
function mc(
  r: Rng,
  correct: number | string,
  distractors: (number | string)[],
  fmt: (v: number | string) => string = String,
): { choices: string[]; answerIndex: number } {
  // A distractor that renders as 0 or a negative is a giveaway — and in a word
  // problem it's nonsense. Numeric candidates must be positive and finite.
  const usable = (d: number | string) => {
    if (typeof d === "number") return Number.isFinite(d) && d > 0;
    const n = Number(d);
    return Number.isNaN(n) ? d !== "" : n > 0;
  };

  const seen = new Set<string>([fmt(correct)]);
  const out: string[] = [];
  for (const d of distractors) {
    if (!usable(d)) continue;
    const s = fmt(d);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
    if (out.length === 3) break;
  }
  let guard = 0;
  while (out.length < 3 && guard++ < 200) {
    const base = typeof correct === "number" ? correct : Number(correct) || 10;
    const delta = int(r, 1, 5) * (r() < 0.5 ? -1 : 1) * (r() < 0.5 ? 1 : 2);
    const jitter = Math.max(1, Math.round((base + delta) * 10) / 10);
    if (!usable(jitter)) continue;
    const s = fmt(jitter);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  const choices = [fmt(correct), ...out];
  // Fisher-Yates so the answer isn't always first.
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { choices, answerIndex: choices.indexOf(fmt(correct)) };
}

interface Draft {
  prompt: string;
  choices: string[];
  answerIndex: number;
  hint: string;
  explanation: string;
}

// Number ranges widen with difficulty.
const RANGE: Record<Difficulty, [number, number]> = {
  1: [1, 10],
  2: [2, 25],
  3: [3, 60],
  4: [12, 250],
  5: [25, 900],
};

type Gen = (r: Rng, d: Difficulty, v: Vocab, scaffold: boolean) => Draft;

const GENERATORS: Record<string, Gen> = {
  addition: (r, d, v, scaffold) => {
    const [lo, hi] = scaffold ? RANGE[Math.max(1, d - 1) as Difficulty] : RANGE[d];
    const a = int(r, lo, hi);
    const b = int(r, lo, hi);
    const sum = a + b;
    return {
      prompt: `${v.actor} ${v.verb} ${a} ${v.item}, then ${b} more. How many ${v.item} in total?`,
      ...mc(r, sum, [sum - 1, sum + 1, Math.abs(a - b), sum + 10]),
      hint: `Start at ${a} and count on ${b} more.`,
      explanation: `${a} + ${b} = ${sum}.`,
    };
  },

  subtraction: (r, d, v, scaffold) => {
    const [lo, hi] = scaffold ? RANGE[Math.max(1, d - 1) as Difficulty] : RANGE[d];
    const a = int(r, lo + 2, hi + 5);
    const b = int(r, lo, Math.max(lo, a - 1));
    const diff = a - b;
    return {
      prompt: `${v.actor} has ${a} ${v.item} and uses ${b} of them at ${v.place}. How many are left?`,
      ...mc(r, diff, [diff + 1, diff - 1, a + b, Math.abs(b - a) + 2]),
      hint: `Take away ${b} from ${a}.`,
      explanation: `${a} − ${b} = ${diff}.`,
    };
  },

  "place-value": (r, d, v) => {
    const digits = Math.min(6, 2 + d);
    const n = int(r, 10 ** (digits - 1), 10 ** digits - 1);
    const names = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"];
    const digitAt = (k: number) => Math.floor(n / 10 ** k) % 10;
    // Only target a place whose digit is non-zero, else the answer is just "0".
    const candidates = Array.from({ length: digits }, (_, k) => k).filter((k) => digitAt(k) !== 0);
    const pos = candidates.length > 0 ? pick(r, candidates) : digits - 1;
    const digit = digitAt(pos);
    const value = digit * 10 ** pos;
    return {
      prompt: `At ${v.place} the counter reads ${n.toLocaleString()}. What is the value of the digit in the ${names[pos]} place?`,
      ...mc(
        r,
        value,
        [
          digit * 10 ** Math.max(0, pos - 1), // one place too low
          value * 10,                          // one place too high
          10 ** pos,                           // the place value itself, digit ignored
          digit,                               // the bare digit
          value + 10 ** pos,
        ],
        (x) => Number(x).toLocaleString(),
      ),
      hint: `Find the ${names[pos]} digit, then multiply it by ${(10 ** pos).toLocaleString()}.`,
      explanation: `The ${names[pos]} digit is ${digit}, and ${digit} × ${(10 ** pos).toLocaleString()} = ${value.toLocaleString()}.`,
    };
  },

  multiplication: (r, d, v, scaffold) => {
    const caps: Record<Difficulty, [number, number]> = { 1: [2, 5], 2: [2, 9], 3: [3, 12], 4: [6, 25], 5: [12, 60] };
    const [lo, hi] = scaffold ? caps[Math.max(1, d - 1) as Difficulty] : caps[d];
    const a = int(r, lo, hi);
    const b = int(r, 2, Math.min(12, hi));
    const p = a * b;
    return {
      prompt: `Each ${v.containerOne} at ${v.place} holds ${a} ${v.item}. ${v.actor} fills ${b} ${v.container}. How many ${v.item} is that?`,
      ...mc(r, p, [a + b, p - a, p + b, a * (b + 1)]),
      hint: `${b} groups of ${a} — that's ${a} × ${b}.`,
      explanation: `${a} × ${b} = ${p}.`,
    };
  },

  division: (r, d, v, scaffold) => {
    const caps: Record<Difficulty, [number, number]> = { 1: [2, 5], 2: [2, 9], 3: [3, 12], 4: [4, 20], 5: [6, 40] };
    const [lo, hi] = scaffold ? caps[Math.max(1, d - 1) as Difficulty] : caps[d];
    const divisor = int(r, lo, hi);
    const quotient = int(r, 2, hi);
    const total = divisor * quotient; // exact division keeps the answer clean
    return {
      prompt: `${v.actor} shares ${total} ${v.item} equally between ${divisor} ${v.container}. How many ${v.item} go in each one?`,
      ...mc(r, quotient, [quotient + 1, quotient - 1, total - divisor, divisor]),
      hint: `Split ${total} into ${divisor} equal groups.`,
      explanation: `${total} ÷ ${divisor} = ${quotient}.`,
    };
  },

  fractions: (r, d, v) => {
    if (d <= 3) {
      const den = pick(r, [2, 3, 4, 5, 6, 8, 10]);
      const num = int(r, 1, den - 1);
      const whole = den * int(r, 2, d === 3 ? 12 : 6);
      const part = (whole / den) * num;
      return {
        prompt: `${v.actor} has ${whole} ${v.item}. What is ${num}/${den} of them?`,
        ...mc(r, part, [part + den, whole / den, part - num, whole - part]),
        hint: `First find 1/${den} of ${whole}, then take ${num} of those.`,
        explanation: `${whole} ÷ ${den} = ${whole / den}, and ${whole / den} × ${num} = ${part}.`,
      };
    }
    // Adding two genuinely different fractions with unlike denominators.
    let d1 = 2, d2 = 3, n1 = 1, n2 = 1;
    for (let tries = 0; tries < 20; tries++) {
      d1 = pick(r, [2, 3, 4, 6]);
      d2 = pick(r, [3, 4, 6, 8].filter((x) => x !== d1));
      n1 = int(r, 1, d1 - 1);
      n2 = int(r, 1, d2 - 1);
      // Reject equivalent fractions (1/2 + 4/8) — they make a degenerate question.
      if (n1 * d2 !== n2 * d1) break;
    }
    const lcm = (d1 * d2) / gcd(d1, d2);
    const num = n1 * (lcm / d1) + n2 * (lcm / d2);
    const g = gcd(num, lcm);
    const rNum = num / g;
    const rDen = lcm / g;
    const correct = fmtFraction(rNum, rDen);
    const wrongAdd = fmtFraction(n1 + n2, d1 + d2);
    const unreduced = `${num}/${lcm}`;
    return {
      prompt: `A recipe at ${v.place} needs ${n1}/${d1} of a batch, then ${n2}/${d2} more. How much is that altogether?`,
      ...mc(
        r,
        correct,
        [
          wrongAdd,
          unreduced !== correct ? unreduced : fmtFraction(rNum + 1, rDen),
          fmtFraction(n1 + n2, lcm),
          fmtFraction(rNum + 1, rDen),
          fmtFraction(Math.max(1, rNum - 1), rDen),
        ],
        String,
      ),
      hint: `Rewrite both fractions over a common denominator of ${lcm}.`,
      explanation: `${n1}/${d1} = ${n1 * (lcm / d1)}/${lcm} and ${n2}/${d2} = ${n2 * (lcm / d2)}/${lcm}. Together that's ${num}/${lcm}${
        correct === unreduced ? "" : `, which simplifies to ${correct}`
      }.`,
    };
  },

  decimals: (r, d, v) => {
    const one = (x: number) => Math.round(x * 10) / 10;
    // a > b so the "subtracted by mistake" distractor stays positive.
    const b = one(int(r, 15, d >= 4 ? 400 : 150) / 10);
    const a = one(b + int(r, 5, d >= 4 ? 500 : 200) / 10);
    const sum = one(a + b);
    const kg = (x: number | string) => `${Number(x).toFixed(1)} kg`;
    return {
      prompt: `${v.actor} records ${a.toFixed(1)} kg of supplies, then adds ${b.toFixed(1)} kg more at ${v.place}. What is the total weight?`,
      ...mc(r, sum, [one(a + b + 0.1), one(a - b), one(sum - 0.1), one(a + b + 1)], kg),
      hint: `Line up the decimal points before you add.`,
      explanation: `${a.toFixed(1)} + ${b.toFixed(1)} = ${sum.toFixed(1)} kg.`,
    };
  },

  percentages: (r, d, v) => {
    const pct = pick(r, d >= 5 ? [12, 15, 18, 35, 45, 65] : [10, 20, 25, 50, 75]);
    // Base must be a multiple of 100/gcd(pct,100) or the answer isn't a whole
    // number — and "10% of 148 = 15" is a lie we should never show a student.
    const step = 100 / gcd(pct, 100);
    const base = step * int(r, 2, d >= 5 ? 14 : 9);
    const value = (base * pct) / 100;
    return {
      prompt: `${v.actor} needs ${pct}% of ${base} ${v.item} for ${v.place}. How many ${v.item} is that?`,
      ...mc(r, value, [base - value, value + pct, Math.round((base * pct) / 10), value * 2, value + step]),
      hint: `${pct}% means ${pct} out of every 100. Try finding 10% first.`,
      explanation: `${pct}% of ${base} = ${base} × ${pct / 100} = ${value}.`,
    };
  },

  ratios: (r, d, v) => {
    const a = int(r, 2, 9);
    const b = int(r, 2, 9);
    const mult = int(r, 2, d >= 5 ? 12 : 6);
    const total = (a + b) * mult;
    const share = a * mult;
    return {
      prompt: `${v.actor} splits ${total} ${v.item} between two ${v.container} in the ratio ${a}:${b}. How many go to the first one?`,
      ...mc(r, share, [b * mult, total / 2, share + a, total - share - a]),
      hint: `The ratio has ${a} + ${b} = ${a + b} equal parts. Find the size of one part first.`,
      explanation: `${total} ÷ ${a + b} = ${mult} per part, and ${mult} × ${a} = ${share}.`,
    };
  },

  "pre-algebra": (r, d, v) => {
    const x = int(r, 2, d >= 5 ? 25 : 12);
    const coef = int(r, 2, d >= 5 ? 9 : 5);
    const add = int(r, 1, d >= 5 ? 40 : 15);
    const result = coef * x + add;
    return {
      prompt: `${v.actor} ${v.verb} the same number of ${v.item} in each of ${coef} runs, then finds ${add} more — ${result} in total. How many did each run give? (Solve ${coef}x + ${add} = ${result})`,
      ...mc(r, x, [result - add, Math.round(result / coef), x + 1, add]),
      hint: `Undo the +${add} first, then undo the ×${coef}.`,
      explanation: `${result} − ${add} = ${coef * x}, and ${coef * x} ÷ ${coef} = ${x}.`,
    };
  },

  "word-problems": (r, d, v) => {
    const perDay = int(r, 3, 6 + d * 3);
    const days = int(r, 3, 4 + d * 2);
    const spent = int(r, 2, Math.max(3, Math.floor((perDay * days) / 3)));
    const left = perDay * days - spent;
    return {
      prompt: `${v.actor} ${v.verb} ${perDay} ${v.item} every day for ${days} days, then uses ${spent} at ${v.place}. How many ${v.item} are left?`,
      ...mc(r, left, [perDay * days, left + spent, left - perDay, left + perDay, perDay * days + spent]),
      hint: `Work out the total collected first, then subtract what was used.`,
      explanation: `${perDay} × ${days} = ${perDay * days}, and ${perDay * days} − ${spent} = ${left}.`,
    };
  },
};

/** Reduced fractions display as a whole number when the denominator is 1. */
function fmtFraction(num: number, den: number): string {
  const g = gcd(num, den) || 1;
  const n = num / g;
  const d = den / g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

export function hasFallback(topic: string): boolean {
  return topic in GENERATORS;
}

/**
 * Build a question offline. `seed` makes it repeatable for a given slot but
 * varied across attempts — pass something that changes per serve.
 */
export function fallbackQuestion(args: {
  topic: string;
  difficulty: Difficulty;
  theme: string;
  scaffold?: boolean;
  seed?: string;
}): Question {
  const { topic, difficulty, theme, scaffold = false } = args;
  const seed = args.seed ?? `${Date.now()}:${Math.random()}`;
  const r = mulberry32(hashString(`${topic}|${difficulty}|${theme}|${scaffold}|${seed}`));
  const gen = GENERATORS[topic] ?? GENERATORS.addition;
  const draft = gen(r, difficulty, vocab(getTheme(theme).id), scaffold);
  return {
    id: `fb_${hashString(seed + topic + difficulty).toString(36)}`,
    prompt: draft.prompt,
    choices: draft.choices,
    answerIndex: draft.answerIndex,
    hint: draft.hint,
    explanation: draft.explanation,
    topic,
    difficulty,
    scaffolded: scaffold,
    source: "fallback",
  };
}

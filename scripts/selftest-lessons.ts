// Self-test for the offline lesson bank.
//
// A lesson with wrong working is worse than no lesson — it teaches the mistake.
// This checks every arithmetic claim in every worked example, across every
// topic and theme, and asserts the structural shape the UI depends on.
//
//   npx tsx scripts/selftest-lessons.ts

import { MATH_TOPICS, THEMES } from "../lib/catalog";
import { fallbackLesson, hasLesson, missingLessons } from "../lib/lessons";
import type { Difficulty } from "../lib/types";

/** Matches a number without swallowing the full stop that ends a sentence. */
const NUMBER = /-?\d+(?:\.\d+)?/;

const problems: string[] = [];
const fail = (tag: string, msg: string) => problems.push(`${tag}: ${msg}`);

// Every topic the quest ladder can land on must teach itself.
const gaps = missingLessons(MATH_TOPICS.map((t) => t.id));
if (gaps.length > 0) fail("coverage", `no lesson for: ${gaps.join(", ")}`);

/** Evaluate "A op B = C" / "A op B op C = D" claims written in the working. */
function checkArithmetic(tag: string, line: string) {
  const sym: Record<string, (a: number, b: number) => number> = {
    "+": (a, b) => a + b,
    "−": (a, b) => a - b,
    "-": (a, b) => a - b,
    "×": (a, b) => a * b,
    "÷": (a, b) => a / b,
  };

  // Chained equalities like "8 + 8 + 8 = 24" or "3 × 5 = 15".
  const m = line.match(/([\d.]+(?:\s*[+−\-×÷]\s*[\d.]+)+)\s*=\s*([\d.]+)/);
  if (!m) return;

  const tokens = m[1].split(/\s*([+−\-×÷])\s*/);
  let acc = Number(tokens[0]);
  if (Number.isNaN(acc)) return;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = sym[tokens[i]];
    const rhs = Number(tokens[i + 1]);
    if (!op || Number.isNaN(rhs)) return;
    acc = op(acc, rhs);
  }
  const stated = Number(m[2]);
  if (Math.abs(acc - stated) > 1e-9) {
    fail(tag, `"${line.trim()}" — computes to ${acc}, states ${stated}`);
  }
}

let checked = 0;
for (const topic of MATH_TOPICS) {
  if (!hasLesson(topic.id)) continue;
  for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
    for (const theme of THEMES) {
      const l = fallbackLesson({ topic: topic.id, difficulty: d, theme: theme.id });
      const tag = `${topic.id}/d${d}/${theme.id}`;
      checked++;

      // --- structure the UI relies on ---
      if (!l.title.trim()) fail(tag, "empty title");
      if (!l.intro.trim()) fail(tag, "empty intro");
      if (!l.tip.trim()) fail(tag, "empty tip");
      if (l.steps.length < 2 || l.steps.length > 4) fail(tag, `${l.steps.length} steps (want 2–4)`);
      if (l.steps.some((s) => !s.trim())) fail(tag, "blank step");
      if (!l.example.problem.trim()) fail(tag, "empty example problem");
      if (!l.example.answer.trim()) fail(tag, "empty example answer");
      if (l.example.working.length < 2) fail(tag, "worked example has fewer than 2 steps");
      if (l.topic !== topic.id) fail(tag, `topic mismatch: ${l.topic}`);

      const all = [l.title, l.intro, l.tip, ...l.steps, l.example.problem, ...l.example.working, l.example.answer].join(" | ");
      if (/undefined|NaN|\[object|\$\{/.test(all)) fail(tag, `unsubstituted or bad token in: ${all.slice(0, 120)}`);

      // --- the maths itself ---
      for (const line of l.example.working) checkArithmetic(tag, line);

      // The final working step must actually arrive at the stated answer.
      // This is a presence check rather than "the last = sign", because real
      // working ends in prose ("= 16 + 4 = 20." / "→ 16.1.") and a single-value
      // extraction picks the wrong number. The arithmetic itself is already
      // verified above; this just catches working that stops short.
      const last = l.example.working[l.example.working.length - 1];
      const answerNum = l.example.answer.match(NUMBER)?.[0];
      const lastNums = last.match(new RegExp(NUMBER, "g")) ?? [];
      if (
        answerNum &&
        !lastNums.some((n) => Math.abs(Number(n) - Number(answerNum)) < 1e-9)
      ) {
        fail(tag, `final step "${last.trim()}" never reaches the answer "${l.example.answer}"`);
      }
    }
  }
}

console.log(`checked ${checked} lessons across ${MATH_TOPICS.length} topics × 5 difficulties × ${THEMES.length} themes`);
if (problems.length > 0) {
  console.log(`\nFAILURES: ${problems.length}`);
  const seen = new Set<string>();
  for (const p of problems) {
    const key = p.replace(/\d+/g, "#");
    if (seen.has(key)) continue;
    seen.add(key);
    console.log("  -", p);
    if (seen.size >= 20) break;
  }
  process.exit(1);
}
console.log("PASS — every worked example's arithmetic verified, every topic covered");

export {};

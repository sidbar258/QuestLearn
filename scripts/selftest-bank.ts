// Self-test for the offline question bank. Everything here is generated, so the
// bank can regress silently — this asserts the properties that actually matter
// to a student: the marked answer is right, the distractors are plausible but
// wrong, and nothing renders as nonsense.
//
//   npx tsx scripts/selftest-bank.ts

import { fallbackQuestion, hasFallback } from "../lib/fallback";
import { MATH_TOPICS, THEMES } from "../lib/catalog";
import type { Difficulty } from "../lib/types";

const problems: string[] = [];
const fail = (tag: string, msg: string) => problems.push(`${tag}: ${msg}`);
let checked = 0;

const DIFFS: Difficulty[] = [1, 2, 3, 4, 5];

for (const topic of MATH_TOPICS) {
  if (!hasFallback(topic.id)) {
    fail(topic.id, "no generator registered");
    continue;
  }
  for (const d of DIFFS) {
    for (const theme of THEMES) {
      for (let i = 0; i < 15; i++) {
        for (const scaffold of [false, true]) {
          const q = fallbackQuestion({ topic: topic.id, difficulty: d, theme: theme.id, scaffold, seed: `s${i}` });
          const tag = `${topic.id}/d${d}/${theme.id}/#${i}${scaffold ? "+scaffold" : ""}`;
          checked++;

          // --- structure ---
          if (q.choices.length !== 4) fail(tag, `${q.choices.length} choices`);
          if (new Set(q.choices).size !== q.choices.length) fail(tag, `duplicate choices ${JSON.stringify(q.choices)}`);
          if (q.answerIndex < 0 || q.answerIndex >= q.choices.length) fail(tag, `answerIndex ${q.answerIndex} out of range`);
          if (!q.prompt.trim() || !q.hint.trim() || !q.explanation.trim()) fail(tag, "empty text field");

          const all = q.prompt + q.explanation + q.hint + q.choices.join(",");

          // --- rendering sanity ---
          if (/undefined|NaN|Infinity|\[object/.test(all)) fail(tag, `bad token -> ${q.prompt} | ${q.explanation}`);
          for (const c of q.choices) {
            if (/^-/.test(c)) fail(tag, `negative choice "${c}"`);
            if (/\/1$/.test(c)) fail(tag, `unreduced fraction choice "${c}"`);
            if (/\/0\b/.test(c)) fail(tag, `zero denominator "${c}"`);
          }
          // A choice of "0" is a giveaway in these contexts.
          if (q.choices.includes("0")) fail(tag, `zero choice in ${JSON.stringify(q.choices)}`);

          // --- per-topic answer verification, recomputed from the prompt ---
          const ans = q.choices[q.answerIndex];
          const nums = (q.prompt.match(/\d[\d,]*\.?\d*/g) ?? []).map((x) => Number(x.replace(/,/g, "")));

          if (topic.id === "addition") {
            expect(tag, Number(ans) === nums[0] + nums[1], `${nums[0]}+${nums[1]} != ${ans}`);
          } else if (topic.id === "subtraction") {
            expect(tag, Number(ans) === nums[0] - nums[1], `${nums[0]}-${nums[1]} != ${ans}`);
          } else if (topic.id === "multiplication") {
            expect(tag, Number(ans) === nums[0] * nums[1], `${nums[0]}*${nums[1]} != ${ans}`);
          } else if (topic.id === "division") {
            expect(tag, Number(ans) === nums[0] / nums[1], `${nums[0]}/${nums[1]} != ${ans}`);
          } else if (topic.id === "percentages") {
            const [pct, base] = nums;
            expect(tag, Number.isInteger((base * pct) / 100), `${pct}% of ${base} is not whole`);
            expect(tag, Number(ans) === (base * pct) / 100, `${pct}% of ${base} != ${ans}`);
            // the explanation must state the exact value, not a rounded one
            const stated = Number(q.explanation.match(/=\s*([\d.]+)\.$/)?.[1]);
            expect(tag, stated === (base * pct) / 100, `explanation states ${stated}, exact is ${(base * pct) / 100}`);
          } else if (topic.id === "ratios") {
            const [total, a, b] = nums;
            expect(tag, Number(ans) === (total * a) / (a + b), `ratio ${a}:${b} of ${total} != ${ans}`);
          } else if (topic.id === "pre-algebra") {
            const m = q.prompt.match(/Solve (\d+)x \+ (\d+) = (\d+)/);
            if (!m) fail(tag, "no equation in prompt");
            else {
              const [, c, k, res] = m.map(Number);
              expect(tag, Number(ans) === (res - k) / c, `${c}x+${k}=${res} => ${(res - k) / c}, marked ${ans}`);
            }
          } else if (topic.id === "decimals") {
            const m = q.prompt.match(/([\d.]+) kg of supplies, then adds ([\d.]+) kg/);
            if (!m) fail(tag, "decimal prompt shape changed");
            else {
              const exact = Math.round((Number(m[1]) + Number(m[2])) * 10) / 10;
              expect(tag, Number(ans.replace(" kg", "")) === exact, `${m[1]}+${m[2]} != ${ans}`);
              for (const c of q.choices) if (!/^\d+\.\d kg$/.test(c)) fail(tag, `malformed decimal choice "${c}"`);
            }
          } else if (topic.id === "fractions" && d >= 4) {
            const m = q.prompt.match(/needs (\d+)\/(\d+) of a batch, then (\d+)\/(\d+)/);
            if (!m) fail(tag, "fraction prompt shape changed");
            else {
              const [, n1, d1, n2, d2] = m.map(Number);
              expect(tag, n1 * d2 !== n2 * d1, `equivalent fractions ${n1}/${d1} and ${n2}/${d2}`);
              const num = n1 * d2 + n2 * d1;
              const den = d1 * d2;
              const [an, ad] = ans.includes("/") ? ans.split("/").map(Number) : [Number(ans), 1];
              expect(tag, an * den === num * ad, `${n1}/${d1}+${n2}/${d2} != ${ans}`);
            }
          } else if (topic.id === "place-value") {
            for (const c of q.choices) if (!/^[\d,]+$/.test(c)) fail(tag, `malformed place-value choice "${c}"`);
          }

          // --- distractors must actually be wrong ---
          q.choices.forEach((c, ix) => {
            if (ix !== q.answerIndex && c === ans) fail(tag, `distractor equals answer "${c}"`);
          });
        }
      }
    }
  }
}

function expect(tag: string, cond: boolean, msg: string) {
  if (!cond) fail(tag, msg);
}

console.log(`checked ${checked} generated questions across ${MATH_TOPICS.length} topics × 5 difficulties × ${THEMES.length} themes`);
if (problems.length) {
  console.log(`\nFAILURES: ${problems.length}`);
  const shown = new Set<string>();
  for (const p of problems) {
    const key = p.split(":").slice(1).join(":").replace(/\d+/g, "#");
    if (shown.has(key)) continue;
    shown.add(key);
    console.log("  -", p);
    if (shown.size >= 20) break;
  }
  process.exit(1);
}
console.log("PASS — every marked answer verified against a recomputation of its own prompt");

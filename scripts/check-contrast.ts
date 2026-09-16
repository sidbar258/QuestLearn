// Verifies every foreground/background pair the UI actually uses against WCAG
// AA. Colour choices drift; this keeps the accessibility claim honest.
//
//   npx tsx scripts/check-contrast.ts

const TOKENS = {
  bg: "#f6f2ff",
  surface: "#ffffff",
  surfaceAlt: "#f3eeff",
  ink: "#1a1033",
  inkSoft: "#4b3f6b",
  inkFaint: "#6b5f88",
  primary: "#5b2fd6",
  primaryDark: "#4522a8",
  primarySoft: "#ede6ff",
  success: "#0f7a55",
  successSoft: "#dff5ec",
  danger: "#b3164c",
  dangerSoft: "#ffe4ee",
  xp: "#b45309",
  streak: "#c2430a",
  white: "#ffffff",
} as const;

type Token = keyof typeof TOKENS;

/** Every pair the UI renders as normal-size text (so the bar is 4.5:1). */
const PAIRS: [string, Token, Token][] = [
  ["body text on card", "ink", "surface"],
  ["body text on page", "ink", "bg"],
  ["secondary text on card", "inkSoft", "surface"],
  ["secondary text on page", "inkSoft", "bg"],
  ["fine print on card", "inkFaint", "surface"],
  ["fine print on page", "inkFaint", "bg"],
  ["fine print on alt surface", "inkFaint", "surfaceAlt"],
  ["primary button label", "white", "primary"],
  ["success button label", "white", "success"],
  ["danger button label", "white", "danger"],
  ["XP figure", "xp", "surface"],
  ["streak figure on page", "streak", "bg"],
  ["streak figure on card", "streak", "surface"],
  ["topic chip", "primaryDark", "primarySoft"],
  ["link on soft primary", "primary", "primarySoft"],
  ["correct feedback text", "success", "successSoft"],
  ["wrong feedback text", "danger", "dangerSoft"],
];

const AA = 4.5;

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;
for (const [label, fg, bg] of PAIRS) {
  const r = contrast(TOKENS[fg], TOKENS[bg]);
  const pass = r >= AA;
  if (!pass) failures++;
  console.log(`${r.toFixed(2).padStart(6)}:1  ${pass ? "PASS" : "FAIL"}  ${label} (${fg} on ${bg})`);
}

console.log(
  failures === 0
    ? `\nAll ${PAIRS.length} pairs meet WCAG AA (${AA}:1) for normal-size text.`
    : `\n${failures} pair(s) below ${AA}:1.`,
);
process.exit(failures === 0 ? 0 : 1);

// Marks this file as a module so its top-level names stay file-scoped.
export {};

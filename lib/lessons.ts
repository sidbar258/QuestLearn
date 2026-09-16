// Offline lesson bank — the "teach it first" half of the app.
//
// A student who has never been shown how fractions work cannot practise their
// way to understanding them; they just fail repeatedly and quit. So every quest
// stage opens with a short lesson: what the skill is, the method in steps, one
// fully worked example, and the mistake most students make.
//
// Same reliability contract as the question bank — these exist so a lesson is
// always available, with or without an API key. Numbers here are fixed (not
// generated) so the worked examples can be verified exactly; the theme only
// changes the nouns.

import { getTheme, getTopic } from "./catalog";
import { vocab, type Vocab } from "./fallback";
import type { Difficulty, Lesson } from "./types";

interface Draft {
  title: string;
  intro: string;
  steps: string[];
  example: { problem: string; working: string[]; answer: string };
  tip: string;
}

type Builder = (v: Vocab) => Draft;

const LESSONS: Record<string, Builder> = {
  addition: (v) => ({
    title: "Putting amounts together",
    intro: `Adding means joining two amounts to find how many there are altogether.`,
    steps: [
      "Start from the bigger number.",
      "Add the tens first, then the ones.",
      "That total is your answer.",
    ],
    example: {
      problem: `${v.actor} has 24 ${v.item} and finds 13 more. How many altogether?`,
      working: ["Start at 24.", "Add the 10 → 34.", "Add the 3 → 37."],
      answer: `37 ${v.item}`,
    },
    tip: "The order never matters: 24 + 13 gives the same answer as 13 + 24.",
  }),

  subtraction: (v) => ({
    title: "Taking amounts away",
    intro: `Subtracting means removing one amount from another to see what's left.`,
    steps: [
      "Start from the number you began with.",
      "Take away the tens first, then the ones.",
      "What remains is your answer.",
    ],
    example: {
      problem: `${v.actor} has 42 ${v.item} and uses 17 at ${v.place}. How many are left?`,
      working: ["Start at 42.", "Take away 10 → 32.", "Take away 7 more → 25."],
      answer: `25 ${v.item}`,
    },
    tip: "Check it by adding back: 25 + 17 = 42. If it doesn't match, try again.",
  }),

  "place-value": (v) => ({
    title: "What each digit is worth",
    intro: `The same digit is worth different amounts depending on where it sits in a number.`,
    steps: [
      "Count the places from the right: ones, tens, hundreds, thousands.",
      "Find which place your digit is in.",
      "Multiply the digit by what that place is worth.",
    ],
    example: {
      problem: `The counter at ${v.place} reads 4,382. What is the 3 worth?`,
      working: [
        "From the right: 2 is ones, 8 is tens, 3 is hundreds.",
        "So the 3 sits in the hundreds place.",
        "3 × 100 = 300.",
      ],
      answer: "300",
    },
    tip: "A digit's value depends on where it sits, not just what it looks like.",
  }),

  multiplication: (v) => ({
    title: "Equal groups, fast",
    intro: `Multiplying is a shortcut for adding the same amount over and over.`,
    steps: [
      "Work out how many groups there are.",
      "Work out how many are in each group.",
      "Multiply the two numbers together.",
    ],
    example: {
      problem: `${v.actor} fills 6 ${v.container} with 8 ${v.item} each. How many ${v.item}?`,
      working: ["That's 6 groups of 8.", "8 + 8 + 8 + 8 + 8 + 8 = 48.", "So 6 × 8 = 48."],
      answer: `48 ${v.item}`,
    },
    tip: "Forgotten a times-table fact? Add the groups up — you'll get there.",
  }),

  division: (v) => ({
    title: "Sharing equally",
    intro: `Dividing means splitting an amount into equal groups.`,
    steps: [
      "Find the total you are sharing.",
      "Find how many groups you are sharing it between.",
      "Ask: what number times the groups makes the total?",
    ],
    example: {
      problem: `${v.actor} shares 56 ${v.item} between 7 ${v.container}. How many each?`,
      working: ["Ask: 7 times what makes 56?", "7 × 8 = 56.", "So 56 ÷ 7 = 8."],
      answer: `8 ${v.item} in each`,
    },
    tip: "Every division is a multiplication in disguise. Use the times-tables you know.",
  }),

  fractions: (v) => ({
    title: "Parts of a whole",
    intro: `A fraction splits something into equal parts and takes some of them.`,
    steps: [
      "The bottom number says how many equal parts to split into.",
      "Divide by that to find the size of one part.",
      "The top number says how many of those parts to take.",
    ],
    example: {
      problem: `${v.actor} has 20 ${v.item}. What is 3/4 of them?`,
      working: [
        "The bottom is 4, so split into 4 equal parts.",
        "20 ÷ 4 = 5, so one part is 5.",
        "The top is 3, so take 3 parts: 3 × 5 = 15.",
      ],
      answer: `15 ${v.item}`,
    },
    tip: "Bottom tells you how many parts. Top tells you how many you keep.",
  }),

  decimals: (v) => ({
    title: "Numbers between whole numbers",
    intro: `The digits after the dot are parts of a whole — tenths, then hundredths.`,
    steps: [
      "Write the numbers with the dots lined up under each other.",
      "Add or subtract as normal, starting from the right.",
      "Bring the dot straight down into your answer.",
    ],
    example: {
      problem: `${v.actor} records 3.4 kg, then adds 12.7 kg more.`,
      working: [
        "Line up the dots: 3.4 and 12.7.",
        "4 tenths + 7 tenths = 11 tenths, which is 1 whole and 1 tenth.",
        "3 + 12 + 1 = 16, then the leftover tenth → 16.1.",
      ],
      answer: "16.1 kg",
    },
    tip: "Line up the dots, not the ends of the numbers. 3.4 is bigger than 3.04.",
  }),

  percentages: (v) => ({
    title: "Out of every hundred",
    intro: `A percentage is just a fraction out of 100 — 25% means 25 of every 100.`,
    steps: [
      "Find 10% first: move the decimal point one place left.",
      "Build the percentage you need from 10% chunks.",
      "Add the pieces together.",
    ],
    example: {
      problem: `${v.actor} needs 25% of 80 ${v.item}. How many is that?`,
      working: [
        "10% of 80 = 8.",
        "So 20% = 8 + 8 = 16.",
        "5% is half of 10%, so 5% = 4.",
        "20% + 5% = 16 + 4 = 20.",
      ],
      answer: `20 ${v.item}`,
    },
    tip: "Always find 10% first. It's the easiest one, and everything else builds from it.",
  }),

  ratios: (v) => ({
    title: "Sharing in parts",
    intro: `A ratio like 3:5 means for every 3 of one thing, there are 5 of the other.`,
    steps: [
      "Add the ratio numbers to find the total number of parts.",
      "Divide the amount by that to find the size of one part.",
      "Multiply one part by each ratio number.",
    ],
    example: {
      problem: `${v.actor} splits 40 ${v.item} between two ${v.container} in the ratio 3:5.`,
      working: [
        "3 + 5 = 8 parts in total.",
        "40 ÷ 8 = 5, so one part is 5.",
        "First: 3 × 5 = 15. Second: 5 × 5 = 25.",
      ],
      answer: "15 and 25",
    },
    tip: "Add the ratio numbers first. Forgetting that step is the usual mistake.",
  }),

  "pre-algebra": (v) => ({
    title: "Finding the missing number",
    intro: `The letter x just stands for a number you don't know yet. Your job is to uncover it.`,
    steps: [
      "Look at what has been done to x.",
      "Undo it in reverse order: plus and minus first, then times and divide.",
      "Do the same thing to both sides, and x is left on its own.",
    ],
    example: {
      problem: `${v.actor} ${v.verb} the same amount in each of 4 runs, then finds 7 more — 31 in total. Solve 4x + 7 = 31.`,
      working: [
        "Undo the + 7 first: 31 − 7 = 24.",
        "That leaves 4x = 24.",
        "Undo the × 4: 24 ÷ 4 = 6.",
        "So x = 6.",
      ],
      answer: "x = 6",
    },
    tip: "Whatever you do to one side, do to the other. That's what keeps it balanced.",
  }),

  "word-problems": (v) => ({
    title: "Turning words into maths",
    intro: `The hard part isn't the sum — it's working out which sum to do.`,
    steps: [
      "Read it once to see what's happening.",
      "Pick out the numbers and what the question is actually asking.",
      "Do the steps in order, one at a time.",
    ],
    example: {
      problem: `${v.actor} ${v.verb} 5 ${v.item} a day for 6 days, then uses 9 at ${v.place}. How many are left?`,
      working: [
        "First find the total collected: 5 × 6 = 30.",
        "Then take away what was used: 30 − 9 = 21.",
      ],
      answer: `21 ${v.item}`,
    },
    tip: "Do it in stages. Most word problems are two easy sums, not one hard one.",
  }),
};

export function hasLesson(topic: string): boolean {
  return topic in LESSONS;
}

export function fallbackLesson(args: {
  subject?: string;
  topic: string;
  difficulty: Difficulty;
  theme: string;
}): Lesson {
  const build = LESSONS[args.topic] ?? LESSONS.addition;
  const draft = build(vocab(getTheme(args.theme).id));
  return {
    id: `fl_${args.topic}_${args.difficulty}_${getTheme(args.theme).id}`,
    topic: args.topic,
    difficulty: args.difficulty,
    ...draft,
    source: "fallback",
  };
}

/** Every topic in the ladder must have a lesson, or a stage would open empty. */
export function missingLessons(topicIds: string[]): string[] {
  return topicIds.filter((t) => !hasLesson(t));
}

export function lessonTopicLabel(subject: string, topic: string): string {
  return getTopic(subject, topic).label;
}

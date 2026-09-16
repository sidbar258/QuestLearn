"use client";

import { Speak } from "./Speak";
import type { Lesson } from "@/lib/types";

/**
 * The teaching step, shown before a stage's questions. Deliberately calmer than
 * the question card — no timer, no scoring, nothing to get wrong. The worked
 * example is the point: showing the method beats describing it.
 */
export function LessonCard({
  lesson,
  topicLabel,
  onDone,
  busy,
  doneLabel = "Got it — let's practise",
  onSkip,
}: {
  lesson: Lesson;
  topicLabel: string;
  onDone: () => void;
  busy: boolean;
  doneLabel?: string;
  /** When present, renders a way out for a student who already knows this. */
  onSkip?: () => void;
}) {
  const readAloud = [
    lesson.title,
    lesson.intro,
    ...lesson.steps,
    "Here's an example.",
    lesson.example.problem,
    ...lesson.example.working,
    `The answer is ${lesson.example.answer}.`,
    `Watch out: ${lesson.tip}`,
  ].join(" ");

  return (
    <div className="ql-card p-5 sm:p-6 ql-rise">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-success-soft text-success">
          Learn this first
        </span>
        <span className="text-xs font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-primary-soft text-primary-dark">
          {topicLabel}
        </span>
      </div>

      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <h2 className="text-[clamp(1.35rem,5.4vw,1.75rem)] leading-tight font-black mb-1">
            {lesson.title}
          </h2>
          <p className="text-lg font-bold text-ink-soft leading-snug">{lesson.intro}</p>
        </div>
        <Speak text={readAloud} label="Read this lesson out loud" />
      </div>

      <section className="mb-5">
        <h3 className="text-sm font-black uppercase tracking-wide text-ink-faint mb-2">
          How to do it
        </h3>
        <ol className="grid gap-2.5">
          {lesson.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="flex-none grid place-items-center rounded-xl bg-primary text-white font-black"
                style={{ width: 32, height: 32, fontSize: "0.95rem" }}
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="font-bold leading-snug pt-1">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border-2 border-line bg-surface-alt p-4 mb-5">
        <h3 className="text-sm font-black uppercase tracking-wide text-ink-faint mb-2">
          Watch one first
        </h3>
        <p className="font-black leading-snug mb-3">{lesson.example.problem}</p>
        <ol className="grid gap-1.5 mb-3">
          {lesson.example.working.map((line, i) => (
            <li key={i} className="flex items-start gap-2 font-bold text-ink-soft leading-snug">
              <span className="text-primary" aria-hidden>→</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <p className="font-black text-success text-lg">
          <span aria-hidden>✅ </span>{lesson.example.answer}
        </p>
      </section>

      <p className="rounded-2xl border-2 border-primary bg-primary-soft p-4 font-bold text-primary-dark leading-snug mb-5">
        <span aria-hidden>💡 </span>
        <span className="font-black">Watch out: </span>
        {lesson.tip}
      </p>

      <button type="button" className="ql-btn ql-btn-primary w-full text-lg" onClick={onDone} disabled={busy}>
        {busy ? "Loading…" : doneLabel} <span aria-hidden>→</span>
      </button>

      {onSkip && (
        <button type="button" className="ql-btn ql-btn-ghost w-full mt-3" onClick={onSkip} disabled={busy}>
          Back to the question
        </button>
      )}

      <p className="mt-4 text-center text-xs font-bold text-ink-faint">
        {lesson.source === "ai"
          ? "Written just now for you ✨"
          : lesson.source === "cache"
            ? "From your saved lessons"
            : "From the offline lesson bank"}
      </p>
    </div>
  );
}

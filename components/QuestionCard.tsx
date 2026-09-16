"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Speak } from "./Speak";
import type { ClientQuestion } from "@/lib/play";

export interface Feedback {
  correct: boolean;
  answerIndex: number;
  explanation: string;
  xpGained?: number;
}

const KEYS = ["A", "B", "C", "D", "E", "F"];

export function QuestionCard({
  question,
  feedback,
  busy,
  onAnswer,
  onNext,
  nextLabel = "Next",
}: {
  question: ClientQuestion;
  feedback: Feedback | null;
  busy: boolean;
  onAnswer: (choiceIndex: number, timeMs: number) => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const shownAt = useRef<number>(0);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Callers render this with key={question.id}, so a new question remounts the
  // component and every bit of per-question state resets on its own — no effect
  // needed to clear it. The clock starts after paint, which is also when the
  // student could first actually read the question.
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  // Move focus to Next once answered, so keyboard users aren't stranded.
  useEffect(() => {
    if (feedback) nextRef.current?.focus();
  }, [feedback]);

  const answered = feedback !== null;

  const choose = useCallback(
    (i: number) => {
      if (answered || busy) return;
      setPicked(i);
      onAnswer(i, shownAt.current === 0 ? 0 : Date.now() - shownAt.current);
    },
    [answered, busy, onAnswer],
  );

  // Number keys as a shortcut — faster than tapping on a laptop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= question.choices.length) choose(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, question.choices.length]);

  return (
    <div className="ql-card p-5 sm:p-6 ql-rise">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-primary-soft text-primary-dark">
            {question.topicLabel}
          </span>
          <span
            className="text-xs font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-surface-alt text-ink-soft"
            title={`Difficulty ${question.difficulty} of 5`}
          >
            {"★".repeat(question.difficulty)}
            <span className="sr-only">Difficulty {question.difficulty} of 5</span>
          </span>
          {question.scaffolded && (
            <span className="text-xs font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-success-soft text-success">
              Step by step
            </span>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 mt-3 mb-5">
        <p className="flex-1 text-[clamp(1.15rem,4.4vw,1.45rem)] leading-snug font-extrabold">
          {question.prompt}
        </p>
        <Speak text={question.prompt} />
      </div>

      <div className="grid gap-3" role="group" aria-label="Answer choices">
        {question.choices.map((choice, i) => {
          const isAnswer = answered && i === feedback.answerIndex;
          const isWrongPick = answered && i === picked && !feedback.correct;
          return (
            <button
              key={i}
              type="button"
              disabled={answered || busy}
              onClick={() => choose(i)}
              aria-label={`Option ${KEYS[i]}: ${choice}`}
              className={[
                "ql-choice",
                isAnswer ? "ql-choice-correct" : "",
                isWrongPick ? "ql-choice-wrong ql-shake" : "",
                answered && !isAnswer && !isWrongPick ? "opacity-55" : "",
              ].join(" ")}
            >
              <span className="ql-choice-key" aria-hidden>{KEYS[i]}</span>
              <span className="flex-1">{choice}</span>
              {isAnswer && <span className="text-2xl" aria-hidden>✅</span>}
              {isWrongPick && <span className="text-2xl" aria-hidden>❌</span>}
            </button>
          );
        })}
      </div>

      {!answered && (
        <div className="mt-4">
          {hintOpen ? (
            <p className="ql-rise rounded-2xl bg-surface-alt border-2 border-line p-4 text-ink-soft font-bold">
              <span aria-hidden>💡 </span>{question.hint}
            </p>
          ) : (
            <button
              type="button"
              className="ql-btn ql-btn-ghost w-full"
              onClick={() => setHintOpen(true)}
              disabled={busy}
            >
              💡 Give me a hint
            </button>
          )}
        </div>
      )}

      {answered && (
        <div className="mt-5 ql-rise" aria-live="polite">
          <div
            className={`rounded-2xl p-4 border-2 ${
              feedback.correct
                ? "bg-success-soft border-success"
                : "bg-danger-soft border-danger"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
              <p className={`text-lg font-black ${feedback.correct ? "text-success" : "text-danger"}`}>
                {feedback.correct ? "Nice one! 🎯" : "Not quite — here's why"}
              </p>
              {typeof feedback.xpGained === "number" && feedback.xpGained > 0 && (
                <span className="ql-pop text-lg font-black text-xp whitespace-nowrap ml-auto">
                  +{feedback.xpGained} XP
                </span>
              )}
            </div>
            <p className="font-bold text-ink-soft leading-snug">{feedback.explanation}</p>
          </div>

          <button
            ref={nextRef}
            type="button"
            className="ql-btn ql-btn-primary w-full mt-4"
            onClick={onNext}
            disabled={busy}
          >
            {busy ? "Loading…" : nextLabel} <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </div>
  );
}

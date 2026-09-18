"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionCard, type Feedback } from "@/components/QuestionCard";
import { Loading } from "@/components/Loading";
import type { ClientQuestion } from "@/lib/play";
import type { Difficulty, SkillLevel } from "@/lib/types";

interface NextPayload {
  question: ClientQuestion;
  index: number;
  total: number;
  earlyReader?: boolean;
}

interface AnswerPayload extends Feedback {
  index: number;
  total: number;
  done: boolean;
  result: { level: SkillLevel; difficulty: Difficulty; score: number } | null;
}

const LEVEL_COPY: Record<SkillLevel, { emoji: string; headline: string; blurb: string }> = {
  beginner: {
    emoji: "🌱",
    headline: "Explorer",
    blurb: "We'll start with the basics and build up fast. Everyone starts somewhere.",
  },
  intermediate: {
    emoji: "⚔️",
    headline: "Adventurer",
    blurb: "You've got solid foundations. Your quests will push you a bit further each time.",
  },
  advanced: {
    emoji: "🐉",
    headline: "Champion",
    blurb: "You're ahead of the curve. Expect proper challenges from the start.",
  },
};

export default function DiagnosticPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<NextPayload | null>(null);
  const [feedback, setFeedback] = useState<AnswerPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [result, setResult] = useState<AnswerPayload["result"]>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(
    async (method: "GET" | "PUT") => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/diagnostic", { method });
        if (res.status === 401) {
          router.replace("/");
          return;
        }
        if (!res.ok) throw new Error((await res.json()).error ?? "Could not load a question.");
        setPayload((await res.json()) as NextPayload);
        setFeedback(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load("PUT");
  }, [load]);

  const answer = async (choiceIndex: number) => {
    setBusy(true);
    try {
      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choiceIndex }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not check that answer.");
      const data = (await res.json()) as AnswerPayload;
      setFeedback(data);
      if (data.done && data.result) setResult(data.result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) return <ResultScreen result={result} onStart={() => router.push("/play")} />;

  const progress = payload ? Math.round(((payload.index - 1) / payload.total) * 100) : 0;

  return (
    <main id="main" className="flex-1 w-full max-w-2xl mx-auto px-5 py-8">
      <header className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h1 className="text-2xl font-black">Let&apos;s find your level</h1>
          {payload && (
            <span className="font-black text-ink-soft">
              {payload.index} / {payload.total}
            </span>
          )}
        </div>
        <div
          className="h-3 rounded-full overflow-hidden border-2 border-line bg-surface-alt"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Quiz progress"
        >
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 font-bold text-ink-soft">
          No pressure — this just sets your starting point. Wrong answers help too.
        </p>
      </header>

      {error && (
        <div role="alert" className="mb-5 rounded-2xl border-2 border-danger bg-danger-soft p-4">
          <p className="font-black text-danger mb-2">{error}</p>
          <button type="button" className="ql-btn ql-btn-ghost" onClick={() => void load("GET")}>
            Try again
          </button>
        </div>
      )}

      {!payload && busy && <Loading label="Setting up your quiz…" />}

      {payload && (
        <QuestionCard
          key={payload.question.id}
          question={payload.question}
          feedback={feedback}
          busy={busy}
          onAnswer={(i) => void answer(i)}
          onNext={() => void load("GET")}
          earlyReader={payload.earlyReader}
          nextLabel={feedback?.index === feedback?.total ? "See my level" : "Next question"}
        />
      )}
    </main>
  );
}

function ResultScreen({
  result,
  onStart,
}: {
  result: NonNullable<AnswerPayload["result"]>;
  onStart: () => void;
}) {
  const copy = LEVEL_COPY[result.level];
  return (
    <main id="main" className="flex-1 w-full max-w-2xl mx-auto px-5 py-14">
      <div className="ql-card ql-pop p-8 text-center">
        <p className="text-7xl mb-4" aria-hidden>{copy.emoji}</p>
        <p className="text-sm font-black uppercase tracking-widest text-ink-faint mb-1">
          Your starting rank
        </p>
        <h1 className="text-4xl font-black mb-3">{copy.headline}</h1>
        <p className="text-lg font-bold text-ink-soft mb-6">{copy.blurb}</p>

        <div className="rounded-2xl bg-surface-alt border-2 border-line p-4 mb-7">
          <p className="font-black text-ink-soft">
            Starting difficulty{" "}
            <span className="text-primary">{"★".repeat(result.difficulty)}</span>
            <span className="text-ink-faint">{"★".repeat(5 - result.difficulty)}</span>
          </p>
          <p className="text-sm font-bold text-ink-faint mt-1">
            This moves on its own as you play.
          </p>
        </div>

        <button type="button" className="ql-btn ql-btn-primary w-full text-lg" onClick={onStart}>
          <span aria-hidden>🗺️</span> Start my quest
        </button>
      </div>
    </main>
  );
}

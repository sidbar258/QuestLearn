"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Celebration, type CelebrationPayload } from "@/components/Celebration";
import { LessonCard } from "@/components/LessonCard";
import { Loading } from "@/components/Loading";
import { QuestionCard, type Feedback } from "@/components/QuestionCard";
import { StageTrack } from "@/components/StageTrack";
import { XpBar } from "@/components/XpBar";
import type { Adaptation } from "@/lib/adaptive";
import type { ClientQuestion } from "@/lib/play";
import type { Badge, Lesson, QuestLine } from "@/lib/types";

interface LevelInfo { level: number; into: number; span: number; pct: number }

interface QuestPayload {
  mode: "lesson" | "question" | "done";
  lesson?: Lesson;
  topicLabel?: string;
  question?: ClientQuestion;
  questline: QuestLine;
  adaptation?: Adaptation;
  finished?: boolean;
  level: LevelInfo;
  xp: number;
  streakDays: number;
  earlyReader?: boolean;
}

interface AnswerPayload extends Feedback {
  xpGained: number;
  xpTotal: number;
  level: number;
  levelPct: number;
  leveledUp: boolean;
  streakDays: number;
  newBadges: Badge[];
  adaptation: Adaptation;
  stageComplete: boolean;
  questComplete: boolean;
  stageTitle: string | null;
  questline: QuestLine | null;
}

export default function PlayPage() {
  const router = useRouter();
  const [data, setData] = useState<QuestPayload | null>(null);
  const [feedback, setFeedback] = useState<AnswerPayload | null>(null);
  const [review, setReview] = useState<{ lesson: Lesson; topicLabel: string } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<CelebrationPayload[]>([]);
  const loaded = useRef(false);

  const load = useCallback(
    async (method: "GET" | "PUT") => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/quest", { method });
        if (res.status === 401) {
          router.replace("/");
          return;
        }
        if (!res.ok) throw new Error((await res.json()).error ?? "Could not load your quest.");
        setData((await res.json()) as QuestPayload);
        setFeedback(null);
        setReview(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load("GET");
  }, [load]);

  /** Student finished reading the stage's lesson — move on to its questions. */
  const finishLesson = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/quest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "lesson-done" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not start the stage.");
      await load("GET");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  /** Look the method up again mid-stage, without losing your place. */
  const openReview = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/quest/lesson");
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load the lesson.");
      setReview((await res.json()) as { lesson: Lesson; topicLabel: string });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const answer = async (choiceIndex: number, timeMs: number) => {
    setBusy(true);
    try {
      const res = await fetch("/api/quest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choiceIndex, timeMs }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not check that answer.");
      const outcome = (await res.json()) as AnswerPayload;
      setFeedback(outcome);

      // Reflect XP/level immediately — the reward must land with the answer.
      setData((prev) =>
        prev
          ? {
              ...prev,
              level: { ...prev.level, level: outcome.level, pct: outcome.levelPct },
              xp: outcome.xpTotal,
              streakDays: outcome.streakDays,
              questline: outcome.questline ?? prev.questline,
            }
          : prev,
      );

      const events: CelebrationPayload[] = [];
      if (outcome.leveledUp) events.push({ kind: "level", level: outcome.level });
      for (const badge of outcome.newBadges) events.push({ kind: "badge", badge });
      if (outcome.questComplete) events.push({ kind: "quest" });
      else if (outcome.stageComplete) events.push({ kind: "stage", title: outcome.stageTitle ?? undefined });
      if (events.length > 0) setQueue(events);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const questFinished = Boolean(feedback?.questComplete || data?.mode === "done");
  const teaching = data?.mode === "lesson" && data.lesson;

  return (
    <main id="main" className="flex-1 w-full max-w-2xl mx-auto px-5 py-6 pb-16">
      <Celebration payload={queue[0] ?? null} onDismiss={() => setQueue((q) => q.slice(1))} />

      <header className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link href="/" className="font-black text-primary" aria-label="Switch player">
            <span aria-hidden>←</span> Switch
          </Link>
          {data && data.streakDays > 0 && (
            <span className="font-black text-streak" aria-label={`${data.streakDays} day streak`}>
              🔥 {data.streakDays}
            </span>
          )}
        </div>
        {data && <XpBar level={data.level.level} pct={data.level.pct} xp={feedback?.xpTotal ?? data.xp} />}
      </header>

      {data?.questline && (
        <section className="mb-5">
          <h1 className="text-2xl font-black leading-tight">{data.questline.title}</h1>
          {data.questline.blurb && (
            <p className="text-ink-soft font-bold mt-1 mb-3">{data.questline.blurb}</p>
          )}
          <StageTrack stages={data.questline.stages} />
        </section>
      )}

      {data?.adaptation?.message && !feedback && !teaching && (
        <p className="mb-4 rounded-2xl border-2 border-primary bg-primary-soft p-3 font-black text-primary-dark text-center ql-rise">
          {data.adaptation.message}
        </p>
      )}

      {error && (
        <div role="alert" className="mb-5 rounded-2xl border-2 border-danger bg-danger-soft p-4">
          <p className="font-black text-danger mb-3">{error}</p>
          <button type="button" className="ql-btn ql-btn-ghost" onClick={() => void load("GET")}>
            Try again
          </button>
        </div>
      )}

      {review ? (
        <LessonCard
          lesson={review.lesson}
          topicLabel={review.topicLabel}
          busy={busy}
          doneLabel="Back to the question"
          earlyReader={data?.earlyReader}
          onDone={() => setReview(null)}
        />
      ) : questFinished ? (
        <QuestComplete onNew={() => void load("PUT")} busy={busy} />
      ) : teaching && data.lesson ? (
        <LessonCard
          lesson={data.lesson}
          topicLabel={data.topicLabel ?? ""}
          busy={busy}
          earlyReader={data.earlyReader}
          onDone={() => void finishLesson()}
        />
      ) : !data?.question && busy ? (
        <Loading label="Writing your next challenge…" />
      ) : data?.question ? (
        <>
          <QuestionCard
            key={data.question.id}
            question={data.question}
            feedback={feedback}
            busy={busy}
            onAnswer={(i, ms) => void answer(i, ms)}
            onNext={() => void load("GET")}
            earlyReader={data.earlyReader}
          />
          {!feedback && (
            <button
              type="button"
              className="ql-btn ql-btn-ghost w-full mt-3"
              onClick={() => void openReview()}
              disabled={busy}
            >
              📖 Show me how again
            </button>
          )}
          <p className="mt-5 text-center text-xs font-bold text-ink-faint">
            {data.question.source === "ai"
              ? "Written just now for you ✨"
              : data.question.source === "cache"
                ? "From your saved challenges"
                : "From the offline challenge bank"}
          </p>
        </>
      ) : null}
    </main>
  );
}

function QuestComplete({ onNew, busy }: { onNew: () => void; busy: boolean }) {
  return (
    <div className="ql-card ql-pop p-8 text-center">
      <p className="text-7xl mb-4" aria-hidden>🏆</p>
      <h2 className="text-3xl font-black mb-2">Quest complete!</h2>
      <p className="text-lg font-bold text-ink-soft mb-7">
        You cleared every stage. Ready for a harder one?
      </p>
      <button type="button" className="ql-btn ql-btn-primary w-full text-lg" onClick={onNew} disabled={busy}>
        {busy ? "Building it…" : "Start a new quest"} <span aria-hidden>→</span>
      </button>
      <Link href="/" className="ql-btn ql-btn-ghost w-full mt-3">
        Take a break
      </Link>
    </div>
  );
}

"use client";

import type { QuestStage } from "@/lib/types";

/**
 * The quest map. At phone width there isn't room for four stage titles side by
 * side — squeezing them in produced "W… T… D… B…" — so the track carries icons
 * and progress, and the stage you're actually on gets its name spelled out.
 */
export function StageTrack({ stages }: { stages: QuestStage[] }) {
  const activeIndex = stages.findIndex((s) => s.status === "active");
  const current = activeIndex >= 0 ? stages[activeIndex] : null;
  const doneCount = stages.filter((s) => s.status === "done").length;

  return (
    <div>
      <p className="flex items-baseline gap-2 mb-2">
        <span className="text-xs font-black uppercase tracking-wide text-ink-faint">
          Stage {Math.min(stages.length, (activeIndex >= 0 ? activeIndex : doneCount - 1) + 1)} of {stages.length}
        </span>
        {current && <span className="font-black truncate">{current.title}</span>}
      </p>

      <ol className="flex items-stretch gap-2" aria-label="Quest stages">
        {stages.map((s, i) => {
          const done = s.status === "done";
          const active = s.status === "active";
          const pct = active
            ? Math.round((s.questionsDone / s.questionsTarget) * 100)
            : done
              ? 100
              : 0;
          return (
            <li key={s.id} className="flex-1 min-w-0">
              <div
                className={`rounded-xl px-2 py-2 h-full border-2 transition-colors ${
                  done
                    ? "bg-success-soft border-success"
                    : active
                      ? "bg-primary-soft border-primary"
                      : "bg-surface-alt border-line"
                }`}
              >
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <span className="text-base leading-none" aria-hidden>
                    {done ? "✅" : active ? "⚔️" : "🔒"}
                  </span>
                  <span
                    className={`text-xs font-black ${
                      done ? "text-success" : active ? "text-primary-dark" : "text-ink-faint"
                    }`}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      done ? "bg-success" : "bg-primary"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="sr-only">
                  Stage {i + 1}, {s.title}:{" "}
                  {done
                    ? "complete"
                    : active
                      ? `${s.questionsDone} of ${s.questionsTarget} done`
                      : "locked"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

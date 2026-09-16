"use client";

import { useEffect } from "react";
import type { Badge } from "@/lib/types";

export interface CelebrationPayload {
  kind: "level" | "badge" | "stage" | "quest";
  level?: number;
  badge?: Badge;
  title?: string;
}

/**
 * The reward moment: level-ups, badges, stage and quest completions. One
 * overlay for all four so they queue instead of fighting for the screen.
 */
export function Celebration({
  payload,
  onDismiss,
}: {
  payload: CelebrationPayload | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!payload) return;
    const t = setTimeout(onDismiss, payload.kind === "level" ? 2600 : 2200);
    return () => clearTimeout(t);
  }, [payload, onDismiss]);

  if (!payload) return null;

  const { emoji, headline, sub } = describe(payload);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(26,16,51,0.55)" }}
      role="alertdialog"
      aria-live="assertive"
      aria-label={headline}
      onClick={onDismiss}
    >
      <div className="ql-card ql-pop p-8 text-center max-w-sm w-full">
        <div className="text-7xl mb-3" aria-hidden>{emoji}</div>
        <h2 className="text-3xl font-black mb-1">{headline}</h2>
        <p className="text-ink-soft font-bold">{sub}</p>
        <button type="button" className="ql-btn ql-btn-primary w-full mt-6" onClick={onDismiss}>
          Keep going
        </button>
      </div>
    </div>
  );
}

function describe(p: CelebrationPayload): { emoji: string; headline: string; sub: string } {
  switch (p.kind) {
    case "level":
      return { emoji: "🎉", headline: `Level ${p.level}!`, sub: "You levelled up. New challenges unlocked." };
    case "badge":
      return { emoji: p.badge?.emoji ?? "🏅", headline: p.badge?.label ?? "New badge!", sub: p.badge?.blurb ?? "" };
    case "stage":
      return { emoji: "✅", headline: "Stage clear!", sub: p.title ? `You finished ${p.title}.` : "On to the next one." };
    case "quest":
      return { emoji: "🏆", headline: "Quest complete!", sub: "You finished the whole quest line." };
  }
}

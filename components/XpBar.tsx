"use client";

/** Level + XP progress. The single most-looked-at thing on the screen. */
export function XpBar({
  level,
  pct,
  xp,
  compact = false,
}: {
  level: number;
  pct: number;
  xp: number;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 w-full">
      <div
        className="flex-none grid place-items-center rounded-2xl bg-primary text-white font-black"
        style={{ width: compact ? 44 : 52, height: compact ? 44 : 52 }}
        aria-hidden
      >
        <span className="text-[0.6rem] leading-none opacity-80">LVL</span>
        <span className="text-lg leading-none">{level}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <span className="sr-only">Level {level}, </span>
          <span className="text-sm font-bold text-ink-soft">{pct}% to level {level + 1}</span>
          <span className="text-sm font-black text-xp">{xp.toLocaleString()} XP</span>
        </div>
        <div
          className="h-4 rounded-full overflow-hidden border-2 border-line bg-surface-alt"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress to level ${level + 1}`}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(pct > 0 ? 6 : 0, pct)}%`,
              background: "linear-gradient(90deg, var(--xp-fill), #fbbf24)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

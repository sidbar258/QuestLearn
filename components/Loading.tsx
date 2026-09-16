"use client";

/**
 * Shown while Claude writes a question. The brief budgets 3–5s for that, which
 * is long enough that a blank screen reads as broken — so the wait gets a
 * skeleton that matches the shape of what's coming.
 */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="ql-card p-6" role="status" aria-live="polite">
      <p className="font-black text-ink-soft mb-4">
        <span aria-hidden>✨ </span>{label}
      </p>
      <div className="h-7 rounded-lg bg-surface-alt ql-shine mb-3" style={{ width: "85%" }} />
      <div className="h-7 rounded-lg bg-surface-alt ql-shine mb-6" style={{ width: "60%" }} />
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[68px] rounded-2xl bg-surface-alt ql-shine" />
        ))}
      </div>
    </div>
  );
}

"use client";

import type { StudentSummary, TopicSummary } from "@/lib/progress";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export function StudentSummaryCard({ summary }: { summary: StudentSummary }) {
  const { student } = summary;
  const needsAttention = summary.struggling.length > 0;

  return (
    <article className="ql-card p-6">
      <header className="flex items-start gap-4 mb-5">
        <span className="text-5xl leading-none" aria-hidden>{student.avatar}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-black leading-tight">{student.name}</h2>
          <p className="font-bold text-ink-soft">
            Level {summary.level}
            {summary.streakAlive && summary.streakDays > 0 && (
              <> · <span className="text-streak">🔥 {summary.streakDays}-day streak</span></>
            )}
            {summary.totalAnswered > 0 && (
              <> · {Math.round(summary.accuracy * 100)}% correct</>
            )}
          </p>
        </div>
      </header>

      {/* The one line a parent reads if they read nothing else. */}
      <p
        className={`rounded-2xl p-4 font-bold mb-5 border-2 ${
          needsAttention
            ? "bg-danger-soft border-danger text-danger"
            : "bg-success-soft border-success text-success"
        }`}
      >
        <span aria-hidden>{needsAttention ? "⚠️ " : "✅ "}</span>
        {summary.headline}
      </p>

      <div className="grid sm:grid-cols-2 gap-5">
        <TopicList
          title="Needs a hand"
          empty="Nothing flagged."
          topics={summary.struggling}
          tone="danger"
        />
        <TopicList
          title="Got it solid"
          empty="Still building — check back after a few more quests."
          topics={summary.mastered}
          tone="success"
        />
      </div>

      <section className="mt-6">
        <h3 className="text-sm font-black uppercase tracking-wide text-ink-faint mb-2">
          This week
        </h3>
        <div className="flex items-end gap-2" role="img" aria-label={weekLabel(summary)}>
          {summary.lastSevenDays.map((d, i) => {
            const max = Math.max(1, ...summary.lastSevenDays.map((x) => x.answered));
            const h = d.answered === 0 ? 4 : Math.max(8, Math.round((d.answered / max) * 52));
            const dayIndex = new Date(d.date + "T00:00:00").getDay();
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-md ${d.answered > 0 ? "bg-primary" : "bg-line"}`}
                  style={{ height: h }}
                />
                <span className="text-[0.65rem] font-black text-ink-faint">
                  {DAY_INITIALS[dayIndex]}
                  {i === 6 && <span className="sr-only"> (today)</span>}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm font-bold text-ink-soft">
          {summary.activeDaysThisWeek === 0
            ? "No practice this week."
            : `Practised on ${summary.activeDaysThisWeek} of the last 7 days · ${summary.totalAnswered} questions all-time.`}
        </p>
      </section>

      {summary.badges.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-black uppercase tracking-wide text-ink-faint mb-2">
            Badges earned ({summary.badges.length})
          </h3>
          <ul className="flex flex-wrap gap-2">
            {summary.badges.map((b) => (
              <li
                key={b.key}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt border-2 border-line px-3 py-1.5"
                title={b.blurb}
              >
                <span aria-hidden>{b.emoji}</span>
                <span className="text-sm font-black">{b.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function TopicList({
  title,
  topics,
  empty,
  tone,
}: {
  title: string;
  topics: TopicSummary[];
  empty: string;
  tone: "danger" | "success";
}) {
  return (
    <section>
      <h3 className="text-sm font-black uppercase tracking-wide text-ink-faint mb-2">{title}</h3>
      {topics.length === 0 ? (
        <p className="font-bold text-ink-faint">{empty}</p>
      ) : (
        <ul className="grid gap-2">
          {topics.map((t) => (
            <li key={t.topic} className="flex items-center justify-between gap-3">
              <span className="font-black truncate">{t.label}</span>
              <span
                className={`text-sm font-black whitespace-nowrap ${
                  tone === "danger" ? "text-danger" : "text-success"
                }`}
              >
                {Math.round(t.accuracy * 100)}%
                <span className="text-ink-faint font-bold"> of {t.attempts}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function weekLabel(s: StudentSummary): string {
  return `Questions answered each of the last 7 days: ${s.lastSevenDays
    .map((d) => `${d.date}: ${d.answered}`)
    .join(", ")}`;
}

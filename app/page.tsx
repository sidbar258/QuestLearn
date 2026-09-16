import Link from "next/link";
import { selectStudent } from "./actions";
import { hasApiKey } from "@/lib/ai";
import { getTheme } from "@/lib/catalog";
import { levelFromXp } from "@/lib/gamify";
import { listStudents } from "@/lib/students";

// Read straight from SQLite rather than round-tripping our own API — this is
// the first paint, and the brief gives it a 2s budget.
export const dynamic = "force-dynamic";

export default function Home() {
  const students = listStudents();
  const aiOn = hasApiKey();

  return (
    <main id="main" className="flex-1 w-full max-w-2xl mx-auto px-5 py-10 sm:py-14">
      <header className="text-center mb-10">
        <p className="text-6xl mb-3" aria-hidden>🗺️</p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">QuestLearn</h1>
        <p className="mt-2 text-lg font-bold text-ink-soft">
          Turn practice into a quest.
        </p>
      </header>

      {students.length > 0 && (
        <section aria-labelledby="whos-playing" className="mb-8">
          <h2 id="whos-playing" className="text-xl font-black mb-4">Who&apos;s playing?</h2>
          <ul className="grid grid-cols-2 gap-4">
            {students.map((s) => {
              const { level } = levelFromXp(s.xp);
              const theme = getTheme(s.theme);
              return (
                <li key={s.id}>
                  <form action={selectStudent}>
                    <input type="hidden" name="studentId" value={s.id} />
                    <button
                      type="submit"
                      className="ql-card w-full p-5 text-center hover:border-primary transition-colors"
                    >
                      <span className="block text-5xl mb-2" aria-hidden>{s.avatar}</span>
                      <span className="block text-lg font-black truncate">{s.name}</span>
                      <span className="block text-sm font-bold text-ink-soft mt-1">
                        Level {level} · {theme.emoji} {theme.label}
                      </span>
                      {s.streakDays > 0 && (
                        <span className="inline-block mt-2 text-sm font-black text-streak">
                          🔥 {s.streakDays} day{s.streakDays === 1 ? "" : "s"}
                        </span>
                      )}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Link href="/new" className="ql-btn ql-btn-primary w-full text-lg">
        <span aria-hidden>✨</span> {students.length > 0 ? "Add another player" : "Start my first quest"}
      </Link>

      <div className="mt-10 pt-6 border-t-2 border-line text-center">
        <Link href="/parent" className="ql-btn ql-btn-ghost w-full">
          <span aria-hidden>👩‍🏫</span> Grown-ups: see progress
        </Link>
        <p className="mt-5 text-sm font-bold text-ink-faint leading-relaxed">
          {aiOn
            ? "Questions are written fresh for each player by Claude."
            : "Running on the offline question bank — add an API key for AI-written quests."}
          <br />
          No email, no ads. Progress stays on this device.
        </p>
      </div>
    </main>
  );
}

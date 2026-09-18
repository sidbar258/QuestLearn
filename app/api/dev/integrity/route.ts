import { db } from "@/lib/db";
import { handle } from "@/lib/session";

/**
 * Test-only: counts rows that reference a student who no longer exists.
 *
 * The dashboard promises that removing a player erases everything about them,
 * and that promise rests on ON DELETE CASCADE actually firing — which it
 * silently won't if the foreign_keys pragma is ever off. This lets the
 * end-to-end suite verify the claim instead of trusting it.
 *
 * 404 unless QUESTLEARN_E2E=1, like the rest of /api/dev.
 */
export async function GET() {
  if (process.env.QUESTLEARN_E2E !== "1") {
    return new Response("Not found", { status: 404 });
  }
  return handle(async () => {
    const conn = db();
    const tables = ["answers", "questlines", "badges", "diagnostics", "current_question", "served_questions"];
    const orphans: Record<string, number> = {};
    for (const t of tables) {
      const r = conn
        .prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE student_id NOT IN (SELECT id FROM students)`)
        .get() as { n: number };
      orphans[t] = r.n;
    }
    const fk = conn.pragma("foreign_keys", { simple: true });
    return { orphans, totalOrphans: Object.values(orphans).reduce((a, b) => a + b, 0), foreignKeys: fk };
  });
}

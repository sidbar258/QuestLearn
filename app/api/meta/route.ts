import { AVATARS, SUBJECTS, THEMES } from "@/lib/catalog";
import { BADGES } from "@/lib/gamify";
import { hasApiKey } from "@/lib/ai";
import { handle } from "@/lib/session";

/** Static catalog the client needs to render pickers, plus the AI status chip. */
export async function GET() {
  return handle(async () => ({
    themes: THEMES,
    avatars: AVATARS,
    subjects: SUBJECTS.map((s) => ({ id: s.id, label: s.label, emoji: s.emoji })),
    badges: BADGES,
    aiEnabled: hasApiKey(),
  }));
}

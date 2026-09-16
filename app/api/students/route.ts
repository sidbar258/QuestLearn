import { cookies } from "next/headers";
import { AVATARS, THEMES } from "@/lib/catalog";
import { STUDENT_COOKIE, cookieOptions } from "@/lib/auth";
import { createStudent, listStudents } from "@/lib/students";
import { hasCompletedDiagnostic } from "@/lib/diagnostic";
import { HttpError, handle } from "@/lib/session";
import type { AgeBand } from "@/lib/types";

const AGE_BANDS: AgeBand[] = ["8-9", "10-11", "12-14"];
const STUDENT_COOKIE_SECONDS = 60 * 60 * 24 * 365;

export async function GET() {
  return handle(async () => ({
    students: listStudents().map((s) => ({ ...s, diagnosed: hasCompletedDiagnostic(s.id) })),
  }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const avatar = String(body.avatar ?? "");
    const ageBand = String(body.ageBand ?? "") as AgeBand;
    const theme = String(body.theme ?? "");

    if (name.length < 1) throw new HttpError(400, "Pick a name.");
    if (!AVATARS.includes(avatar)) throw new HttpError(400, "Pick an avatar.");
    if (!AGE_BANDS.includes(ageBand)) throw new HttpError(400, "Pick an age.");
    if (!THEMES.some((t) => t.id === theme)) throw new HttpError(400, "Pick a theme.");

    const student = createStudent({ name, avatar, ageBand, theme });
    (await cookies()).set(STUDENT_COOKIE, student.id, cookieOptions(STUDENT_COOKIE_SECONDS));
    return { student };
  });
}

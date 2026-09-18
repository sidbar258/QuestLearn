import { cookies } from "next/headers";
import { AVATARS, THEMES, isGradeBand } from "@/lib/catalog";
import { STUDENT_COOKIE, cookieOptions } from "@/lib/auth";
import { createStudent, listStudents } from "@/lib/students";
import { hasCompletedDiagnostic } from "@/lib/diagnostic";
import { HttpError, handle } from "@/lib/session";
import type { GradeBand } from "@/lib/types";

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
    const gradeBand = String(body.gradeBand ?? "") as GradeBand;
    const theme = String(body.theme ?? "");

    if (name.length < 1) throw new HttpError(400, "Pick a name.");
    if (!AVATARS.includes(avatar)) throw new HttpError(400, "Pick an avatar.");
    if (!isGradeBand(gradeBand)) throw new HttpError(400, "Pick a grade.");
    if (!THEMES.some((t) => t.id === theme)) throw new HttpError(400, "Pick a theme.");

    const student = createStudent({ name, avatar, gradeBand, theme });
    (await cookies()).set(STUDENT_COOKIE, student.id, cookieOptions(STUDENT_COOKIE_SECONDS));
    return { student };
  });
}

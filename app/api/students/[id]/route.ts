import { cookies } from "next/headers";
import { STUDENT_COOKIE, cookieOptions } from "@/lib/auth";
import { THEMES } from "@/lib/catalog";
import { hasCompletedDiagnostic } from "@/lib/diagnostic";
import { levelFromXp, earnedBadges } from "@/lib/gamify";
import { activeQuestLine } from "@/lib/play";
import { HttpError, handle, isParent } from "@/lib/session";
import { deleteStudent, getStudent, updateProfile } from "@/lib/students";

const STUDENT_COOKIE_SECONDS = 60 * 60 * 24 * 365;

/** Selecting a profile is also how a student "signs in". */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const student = getStudent(id);
    if (!student) throw new HttpError(404, "No such student.");

    (await cookies()).set(STUDENT_COOKIE, student.id, cookieOptions(STUDENT_COOKIE_SECONDS));

    return {
      student,
      level: levelFromXp(student.xp),
      badges: earnedBadges(student.id),
      diagnosed: hasCompletedDiagnostic(student.id),
      questline: activeQuestLine(student.id),
    };
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    if (!getStudent(id)) throw new HttpError(404, "No such student.");
    const body = (await req.json()) as { theme?: string; name?: string; avatar?: string };
    if (body.theme && !THEMES.some((t) => t.id === body.theme)) throw new HttpError(400, "Unknown theme.");
    updateProfile(id, body);
    return { student: getStudent(id) };
  });
}

/** Deleting a child's record is a grown-up action, so it needs the PIN. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await isParent())) throw new HttpError(403, "Grown-ups only.");
    const { id } = await params;
    deleteStudent(id);
    return { ok: true };
  });
}

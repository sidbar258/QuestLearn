"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE, cookieOptions } from "@/lib/auth";
import { AVATARS, THEMES } from "@/lib/catalog";
import { hasCompletedDiagnostic } from "@/lib/diagnostic";
import { createStudent, getStudent } from "@/lib/students";
import type { AgeBand } from "@/lib/types";

const A_YEAR = 60 * 60 * 24 * 365;
const AGE_BANDS: AgeBand[] = ["8-9", "10-11", "12-14"];

/** Picking your avatar is the whole of "signing in" for a student. */
export async function selectStudent(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");
  const student = getStudent(studentId);
  if (!student) redirect("/");

  (await cookies()).set(STUDENT_COOKIE, student.id, cookieOptions(A_YEAR));
  redirect(hasCompletedDiagnostic(student.id) ? "/play" : "/diagnostic");
}

export async function createStudentAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const avatar = String(formData.get("avatar") ?? "");
  const ageBand = String(formData.get("ageBand") ?? "") as AgeBand;
  const theme = String(formData.get("theme") ?? "");

  if (
    name.length < 1 ||
    !AVATARS.includes(avatar) ||
    !AGE_BANDS.includes(ageBand) ||
    !THEMES.some((t) => t.id === theme)
  ) {
    redirect("/new?error=1");
  }

  const student = createStudent({ name, avatar, ageBand, theme });
  (await cookies()).set(STUDENT_COOKIE, student.id, cookieOptions(A_YEAR));
  redirect("/diagnostic");
}

export async function signOutStudent() {
  (await cookies()).delete(STUDENT_COOKIE);
  redirect("/");
}

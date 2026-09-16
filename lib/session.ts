// Reading "who is this request for" out of cookies, in one place.

import { cookies } from "next/headers";
import { PARENT_COOKIE, STUDENT_COOKIE, isValidParentSession } from "./auth";
import { getStudent } from "./students";
import type { Student } from "./types";

export async function currentStudent(): Promise<Student | null> {
  const jar = await cookies();
  const sid = jar.get(STUDENT_COOKIE)?.value;
  return sid ? getStudent(sid) : null;
}

export async function requireStudent(): Promise<Student> {
  const s = await currentStudent();
  if (!s) throw new HttpError(401, "No student selected.");
  return s;
}

export async function isParent(): Promise<boolean> {
  const jar = await cookies();
  return isValidParentSession(jar.get(PARENT_COOKIE)?.value);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wrap a route handler so thrown HttpErrors become clean JSON responses. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return Response.json((await fn()) as object);
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[api]", err);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

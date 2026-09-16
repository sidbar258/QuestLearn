import { cookies } from "next/headers";
import {
  PARENT_COOKIE,
  PARENT_SESSION_SECONDS,
  cookieOptions,
  createParentSession,
  destroyParentSession,
  isPinSet,
  setPin,
  verifyPin,
} from "@/lib/auth";
import { summariseAll } from "@/lib/progress";
import { HttpError, handle, isParent } from "@/lib/session";

/** Dashboard data. Summaries only — never the raw answer log. */
export async function GET() {
  return handle(async () => {
    if (!(await isParent())) throw new HttpError(403, "Grown-ups only.");
    return { students: summariseAll() };
  });
}

/** First visit sets the PIN; later visits check it. */
export async function POST(req: Request) {
  return handle(async () => {
    const { pin } = (await req.json()) as { pin?: string };
    const candidate = String(pin ?? "");

    if (!isPinSet()) {
      const result = setPin(candidate);
      if (!result.ok) throw new HttpError(400, result.error);
    } else if (!verifyPin(candidate)) {
      // Same shape and timing as a wrong-length PIN — don't leak which it was.
      throw new HttpError(401, "That PIN doesn't match.");
    }

    const token = createParentSession();
    (await cookies()).set(PARENT_COOKIE, token, cookieOptions(PARENT_SESSION_SECONDS));
    return { ok: true };
  });
}

export async function DELETE() {
  return handle(async () => {
    const jar = await cookies();
    destroyParentSession(jar.get(PARENT_COOKIE)?.value);
    jar.delete(PARENT_COOKIE);
    return { ok: true };
  });
}

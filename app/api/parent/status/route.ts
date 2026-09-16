import { isPinSet } from "@/lib/auth";
import { handle, isParent } from "@/lib/session";

/** Lets the sign-in screen decide between "set a PIN" and "enter your PIN". */
export async function GET() {
  return handle(async () => ({ pinSet: isPinSet(), signedIn: await isParent() }));
}

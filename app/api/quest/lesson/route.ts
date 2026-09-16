import { activeStageLesson } from "@/lib/play";
import { HttpError, handle, requireStudent } from "@/lib/session";

/**
 * Re-read the current stage's lesson mid-practice. Read-only: looking the
 * method up again should never cost a student their place.
 */
export async function GET() {
  return handle(async () => {
    const student = await requireStudent();
    const result = await activeStageLesson(student);
    if (!result) throw new HttpError(404, "No active stage.");
    return result;
  });
}

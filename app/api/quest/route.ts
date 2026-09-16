import {
  activeQuestLine,
  markLessonSeen,
  nextStep,
  startQuestLine,
  submitAnswer,
} from "@/lib/play";
import { levelFromXp } from "@/lib/gamify";
import { HttpError, handle, requireStudent } from "@/lib/session";

/**
 * Whatever the student should see next — a stage's lesson, a question, or the
 * quest-complete state. The client renders `mode` rather than guessing.
 */
export async function GET() {
  return handle(async () => {
    const student = await requireStudent();
    const step = await nextStep(student);
    return { ...step, level: levelFromXp(student.xp), xp: student.xp, streakDays: student.streakDays };
  });
}

/** Generate a brand-new quest line at the student's current level. */
export async function PUT() {
  return handle(async () => {
    const student = await requireStudent();
    await startQuestLine(student);
    const step = await nextStep(student);
    return { ...step, level: levelFromXp(student.xp), xp: student.xp, streakDays: student.streakDays };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const student = await requireStudent();
    const body = (await req.json()) as { choiceIndex?: number; timeMs?: number; action?: string };

    // "I've read the lesson" — move the stage on to its questions.
    if (body.action === "lesson-done") {
      const questline = markLessonSeen(student);
      if (!questline) throw new HttpError(409, "No active quest line.");
      return { ok: true, questline };
    }

    if (!Number.isInteger(body.choiceIndex)) throw new HttpError(400, "Pick an answer.");

    const outcome = submitAnswer(student, body.choiceIndex as number, Number(body.timeMs ?? 0));
    if (!outcome) throw new HttpError(409, "That question has expired — fetch a new one.");
    return { ...outcome, questline: activeQuestLine(student.id) };
  });
}

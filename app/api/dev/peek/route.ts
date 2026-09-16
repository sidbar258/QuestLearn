import { takeStashedQuestion } from "@/lib/play";
import { handle, requireStudent } from "@/lib/session";

/**
 * Test-only: reveals the answer key for the question currently in front of this
 * student, so the end-to-end suite can play deliberately well or badly.
 *
 * Disabled unless QUESTLEARN_E2E=1 is set in the environment — it is a 404 in
 * every normal run, including production. Never enable it on a real deployment.
 */
export async function GET() {
  if (process.env.QUESTLEARN_E2E !== "1") {
    return new Response("Not found", { status: 404 });
  }
  return handle(async () => {
    const student = await requireStudent();
    const stashed = takeStashedQuestion(student.id);
    if (!stashed) return { answerIndex: null };
    return { answerIndex: stashed.question.answerIndex, questionId: stashed.question.id };
  });
}

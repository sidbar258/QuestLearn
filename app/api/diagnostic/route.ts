import { answerDiagnostic, nextDiagnosticQuestion, startDiagnostic } from "@/lib/diagnostic";
import { HttpError, handle, requireStudent } from "@/lib/session";

/** Next placement question. */
export async function GET() {
  return handle(async () => {
    const student = await requireStudent();
    return await nextDiagnosticQuestion(student);
  });
}

/** Begin (or restart) the placement quiz. */
export async function PUT() {
  return handle(async () => {
    const student = await requireStudent();
    startDiagnostic(student);
    return await nextDiagnosticQuestion(student);
  });
}

/** Grade the stashed question. */
export async function POST(req: Request) {
  return handle(async () => {
    const student = await requireStudent();
    const { choiceIndex } = (await req.json()) as { choiceIndex?: number };
    if (!Number.isInteger(choiceIndex)) throw new HttpError(400, "Pick an answer.");

    const result = answerDiagnostic(student, choiceIndex as number);
    if (!result) throw new HttpError(409, "That question has expired — fetch a new one.");
    return result;
  });
}

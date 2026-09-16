import Link from "next/link";
import { createStudentAction } from "../actions";
import { NewPlayerForm } from "./NewPlayerForm";
import { AVATARS, THEMES } from "@/lib/catalog";

export default async function NewPlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main id="main" className="flex-1 w-full max-w-2xl mx-auto px-5 py-8">
      <Link href="/" className="inline-flex items-center gap-2 font-black text-primary mb-6">
        <span aria-hidden>←</span> Back
      </Link>
      <h1 className="text-3xl font-black mb-1">Make your player</h1>
      <p className="text-ink-soft font-bold mb-6">Four quick taps and you&apos;re in.</p>

      {error && (
        <p role="alert" className="mb-5 rounded-2xl border-2 border-danger bg-danger-soft p-4 font-bold text-danger">
          Something was missing — please fill in every step.
        </p>
      )}

      <NewPlayerForm action={createStudentAction} avatars={AVATARS} themes={THEMES} />
    </main>
  );
}

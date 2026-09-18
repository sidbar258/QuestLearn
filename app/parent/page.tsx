"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PinGate } from "./PinGate";
import { StudentSummaryCard } from "./StudentSummaryCard";
import type { StudentSummary } from "@/lib/progress";

export default function ParentPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pinSet, setPinSet] = useState(false);
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummaries = useCallback(async () => {
    try {
      const res = await fetch("/api/parent");
      if (res.status === 403) {
        setSignedIn(false);
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load progress.");
      const data = (await res.json()) as { students: StudentSummary[] };
      setStudents(data.students);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/parent/status");
      const data = (await res.json()) as { pinSet: boolean; signedIn: boolean };
      setPinSet(data.pinSet);
      setSignedIn(data.signedIn);
      if (data.signedIn) await loadSummaries();
    })();
  }, [loadSummaries]);

  /**
   * Delete a student and refresh. The server re-checks the PIN session, so a
   * stale tab can't delete anything after sign-out.
   */
  const deleteStudent = async (studentId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/students/${studentId}`, { method: "DELETE" });
      if (res.status === 403) {
        setSignedIn(false);
        setStudents(null);
        return false;
      }
      if (!res.ok) return false;
      await loadSummaries();
      return true;
    } catch {
      return false;
    }
  };

  const signOut = async () => {
    await fetch("/api/parent", { method: "DELETE" });
    setSignedIn(false);
    setStudents(null);
  };

  if (signedIn === null) {
    return (
      <main id="main" className="flex-1 grid place-items-center p-6">
        <p className="font-bold text-ink-soft" role="status">Loading…</p>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <PinGate
        pinSet={pinSet}
        onSuccess={async () => {
          setSignedIn(true);
          setPinSet(true);
          await loadSummaries();
        }}
      />
    );
  }

  return (
    <main id="main" className="flex-1 w-full max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-center justify-between gap-4 mb-2">
        <Link href="/" className="font-black text-primary">
          <span aria-hidden>←</span> Back
        </Link>
        <button type="button" className="font-black text-ink-soft underline" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      <h1 className="text-3xl font-black mb-1">Progress</h1>
      <p className="font-bold text-ink-soft mb-7">
        A summary, not a spreadsheet. Anything that needs your attention is flagged.
      </p>

      {error && (
        <p role="alert" className="mb-5 rounded-2xl border-2 border-danger bg-danger-soft p-4 font-bold text-danger">
          {error}
        </p>
      )}

      {students?.length === 0 && (
        <div className="ql-card p-8 text-center">
          <p className="text-5xl mb-3" aria-hidden>🌱</p>
          <p className="font-black text-lg mb-1">No players yet</p>
          <p className="font-bold text-ink-soft mb-5">Set one up and their progress will show here.</p>
          <Link href="/new" className="ql-btn ql-btn-primary">Add a player</Link>
        </div>
      )}

      <div className="grid gap-6">
        {students?.map((s) => (
          <StudentSummaryCard key={s.student.id} summary={s} onDelete={deleteStudent} />
        ))}
      </div>

      <p className="mt-10 pt-6 border-t-2 border-line text-sm font-bold text-ink-faint leading-relaxed">
        <strong className="text-ink-soft">What we store:</strong> a display name, an age band, a chosen
        theme, and which questions were answered right or wrong. No email address, no birthday, no
        location, no third-party trackers. Everything lives in a single database file on this machine,
        and deleting a player deletes all of it.
      </p>
    </main>
  );
}

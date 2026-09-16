"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * The only real access control in the app. Students don't get a login — kids on
 * a shared phone would just bounce off it — but this view aggregates several
 * children's progress, so it gets a PIN.
 */
export function PinGate({ pinSet, onSuccess }: { pinSet: boolean; onSuccess: () => void | Promise<void> }) {
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "That didn't work.");
        setPin("");
        return;
      }
      await onSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="flex-1 w-full max-w-md mx-auto px-5 py-12">
      <Link href="/" className="font-black text-primary inline-block mb-8">
        <span aria-hidden>←</span> Back
      </Link>

      <div className="ql-card p-7">
        <p className="text-5xl mb-4 text-center" aria-hidden>{pinSet ? "🔒" : "🔑"}</p>
        <h1 className="text-2xl font-black text-center mb-2">
          {pinSet ? "Enter your PIN" : "Choose a PIN"}
        </h1>
        <p className="font-bold text-ink-soft text-center mb-6">
          {pinSet
            ? "This keeps the progress view for grown-ups."
            : "Pick 4–8 digits. You'll need it to see progress from now on."}
        </p>

        <form onSubmit={submit}>
          <label htmlFor="pin" className="sr-only">PIN</label>
          <input
            id="pin"
            type={show ? "text" : "password"}
            inputMode="numeric"
            pattern="\d*"
            autoComplete={pinSet ? "current-password" : "new-password"}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="w-full rounded-2xl border-line bg-surface px-4 py-4 text-center text-3xl font-black tracking-[0.5em]"
            style={{ borderWidth: 3, borderStyle: "solid", minHeight: 68 }}
            placeholder="••••"
            aria-describedby={error ? "pin-error pin-help" : "pin-help"}
            autoFocus
          />

          {/* Choosing a PIN you can't see is how you end up locked out of your
              own child's progress — especially on a phone keyboard. */}
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            className="ql-btn ql-btn-ghost w-full mt-3"
          >
            <span aria-hidden>{show ? "🙈" : "👁️"}</span>
            {show ? "Hide PIN" : "Show PIN"}
          </button>
          <p id="pin-help" className="sr-only">
            Digits only, 4 to 8 long. Use the show PIN button to check what you have typed.
          </p>
          {error && (
            <p id="pin-error" role="alert" className="mt-3 font-bold text-danger text-center">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="ql-btn ql-btn-primary w-full mt-5"
            disabled={pin.length < 4 || busy}
          >
            {busy ? "Checking…" : pinSet ? "Unlock" : "Set PIN"}
          </button>
        </form>
      </div>
    </main>
  );
}

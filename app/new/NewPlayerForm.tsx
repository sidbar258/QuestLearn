"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { AgeBand, Theme } from "@/lib/types";

const AGE_BANDS: { id: AgeBand; label: string }[] = [
  { id: "8-9", label: "8–9" },
  { id: "10-11", label: "10–11" },
  { id: "12-14", label: "12–14" },
];

export function NewPlayerForm({
  action,
  avatars,
  themes,
}: {
  action: (formData: FormData) => void;
  avatars: string[];
  themes: Theme[];
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(avatars[0]);
  const [ageBand, setAgeBand] = useState<AgeBand>("10-11");
  const [theme, setTheme] = useState(themes[0].id);

  const ready = name.trim().length > 0;

  return (
    <form action={action} className="grid gap-7">
      <input type="hidden" name="avatar" value={avatar} />
      <input type="hidden" name="ageBand" value={ageBand} />
      <input type="hidden" name="theme" value={theme} />

      <fieldset>
        <legend className="text-xl font-black mb-3">1. Pick your look</legend>
        <div className="grid grid-cols-6 gap-2">
          {avatars.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              aria-label={`Avatar ${a}`}
              aria-pressed={avatar === a}
              className={`aspect-square rounded-2xl text-3xl transition-colors ${
                avatar === a ? "border-primary bg-primary-soft" : "border-line bg-surface"
              }`}
              style={{ borderWidth: 3, borderStyle: "solid", minHeight: 56 }}
            >
              <span aria-hidden>{a}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="name" className="block text-xl font-black mb-3">2. What should we call you?</label>
        <input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          autoComplete="off"
          placeholder="First name or nickname"
          className="w-full rounded-2xl border-line bg-surface px-4 py-4 text-xl font-bold placeholder:text-ink-faint placeholder:font-medium"
          style={{ borderWidth: 3, borderStyle: "solid", minHeight: 60 }}
        />
        <p className="mt-2 text-sm font-bold text-ink-faint">
          A nickname is fine — we don&apos;t need your real name.
        </p>
      </div>

      <fieldset>
        <legend className="text-xl font-black mb-3">3. How old are you?</legend>
        <div className="grid grid-cols-3 gap-3">
          {AGE_BANDS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setAgeBand(b.id)}
              aria-pressed={ageBand === b.id}
              className={`ql-btn ${ageBand === b.id ? "ql-btn-primary" : "ql-btn-ghost"}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-black mb-1">4. What are you into?</legend>
        <p className="text-ink-soft font-bold mb-3">Your questions get built around this.</p>
        <div className="grid grid-cols-2 gap-3">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={`ql-card p-4 text-left transition-colors ${
                theme === t.id ? "border-primary bg-primary-soft" : ""
              }`}
            >
              <span className="text-3xl block mb-1" aria-hidden>{t.emoji}</span>
              <span className="font-black">{t.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <Submit disabled={!ready} />
    </form>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ql-btn ql-btn-primary w-full text-lg" disabled={disabled || pending}>
      {pending ? "Building your quest…" : "Let's go!"} <span aria-hidden>→</span>
    </button>
  );
}

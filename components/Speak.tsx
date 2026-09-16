"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Read-aloud button (Web Speech API). Listed in the brief as a stretch goal, and
 * it's the difference between usable and unusable for a struggling reader — so
 * it ships. Renders nothing at all where the browser has no speech support.
 *
 * Rendered under a key that changes per question, so a new question remounts it
 * and any narration in flight is cancelled by the unmount cleanup.
 */
export function Speak({ text, label = "Read this out loud" }: { text: string; label?: string }) {
  const supported = useSpeechSupport();
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  if (!supported) return null;

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={speaking ? "Stop reading" : label}
      className="flex-none grid place-items-center rounded-xl border-2 border-line bg-surface-alt text-2xl"
      style={{ width: 52, height: 52 }}
    >
      <span aria-hidden>{speaking ? "⏹️" : "🔊"}</span>
    </button>
  );
}

/**
 * Speech support is a browser fact, not React state — reading it through
 * useSyncExternalStore keeps the server render (false) and the client render
 * consistent without a setState-in-effect.
 */
function useSpeechSupport(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => false,
  );
}

// Access control. Two very different bars on purpose:
//
//   Students pick a profile from a list — no password. These are kids on a
//   shared phone; a login wall is the thing that stops them coming back, and
//   the profile holds nothing sensitive.
//
//   The parent/teacher dashboard is PIN-gated, because it aggregates several
//   children's progress. The PIN is stored as a scrypt hash, never in clear.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, nowIso } from "./db";

const PIN_KEY = "parent_pin";
const SESSION_PREFIX = "session:";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export const PARENT_COOKIE = "ql_parent";
export const STUDENT_COOKIE = "ql_student";

function setting(key: string): string | null {
  const r = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return r?.value ?? null;
}

function putSetting(key: string, value: string) {
  db().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export function isPinSet(): boolean {
  return setting(PIN_KEY) !== null;
}

function hashPin(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin.normalize("NFKC"), salt, 32);
}

export function setPin(pin: string): { ok: true } | { ok: false; error: string } {
  const clean = pin.trim();
  if (!/^\d{4,8}$/.test(clean)) return { ok: false, error: "PIN must be 4–8 digits." };
  const salt = randomBytes(16);
  putSetting(PIN_KEY, `${salt.toString("hex")}:${hashPin(clean, salt).toString("hex")}`);
  return { ok: true };
}

export function verifyPin(pin: string): boolean {
  const stored = setting(PIN_KEY);
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = hashPin(pin.trim().normalize("NFKC"), Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- sessions ----------------------------------------------------------------

export function createParentSession(): string {
  const token = randomBytes(24).toString("base64url");
  putSetting(`${SESSION_PREFIX}${fingerprint(token)}`, String(Date.now() + SESSION_TTL_MS));
  return token;
}

export function isValidParentSession(token: string | undefined): boolean {
  if (!token) return false;
  const key = `${SESSION_PREFIX}${fingerprint(token)}`;
  const expiry = setting(key);
  if (!expiry) return false;
  if (Number(expiry) < Date.now()) {
    db().prepare("DELETE FROM settings WHERE key = ?").run(key);
    return false;
  }
  return true;
}

export function destroyParentSession(token: string | undefined) {
  if (!token) return;
  db().prepare("DELETE FROM settings WHERE key = ?").run(`${SESSION_PREFIX}${fingerprint(token)}`);
}

/** Store a keyed digest, not the token itself, so the DB never holds a live credential. */
function fingerprint(token: string): string {
  return createHmac("sha256", serverSecret()).update(token).digest("hex");
}

function serverSecret(): string {
  const fromEnv = process.env.QUESTLEARN_SECRET;
  if (fromEnv) return fromEnv;
  let s = setting("server_secret");
  if (!s) {
    s = randomBytes(32).toString("hex");
    putSetting("server_secret", s);
    putSetting("server_secret_created", nowIso());
  }
  return s;
}

/** Cookie options shared by both cookies. `secure` off on http://localhost. */
export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    secure: process.env.NODE_ENV === "production",
  };
}

export const PARENT_SESSION_SECONDS = SESSION_TTL_MS / 1000;

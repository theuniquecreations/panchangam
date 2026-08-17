// Client for the generic item service, following the same contract the temple
// app uses: rows are stamped with a `type` and read back via itemsbytype.
//
//   GET  {SERVICE_URL}/{ORG_CODE}/itemsbytype/{type}
//   GET  {SERVICE_URL}/{ORG_CODE}/filter/{col1}/{val1}/{col2}/{val2}
//   POST {SERVICE_URL}/{ORG_CODE}/items

import {
  SERVICE_URL,
  ORG_CODE,
  ITEM_TYPE_USER,
  BACKEND_READY,
} from "./config";
import { getSession } from "./session";

const BASE = `${SERVICE_URL.replace(/\/$/, "")}/${ORG_CODE}`;

/** Thrown when the backend org is not provisioned yet, so callers can show a
 * useful message instead of surfacing a raw 400. */
export class BackendNotReadyError extends Error {
  constructor() {
    super("Profile service is not connected yet.");
    this.name = "BackendNotReadyError";
  }
}

/** Attaches the bearer token from the current session, when there is one.
 * Reads are public where the backend allows it; writes need a logged-in user. */
async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const session = getSession();
  if (session?.token) headers.set("Authorization", `Bearer ${session.token}`);

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    // Surface the server's own message — it is far more useful than the status
    // text (e.g. "No active organisation found for orgCode=panchangam").
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${options.method || "GET"} ${path} failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  return res.status === 204 ? null : res.json();
}

/** Retries transient failures. Auth errors are never retried — they will not
 * fix themselves and retrying just delays the redirect to login. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("401") || msg.includes("403")) throw err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

export type UserProfile = {
  id?: string;
  type: typeof ITEM_TYPE_USER;
  email: string;
  name?: string;
  gender?: string;
  /** ISO date, YYYY-MM-DD */
  birthDate?: string;
  /** 24h local time at birth, HH:MM */
  birthTime?: string;
  birthPlace?: string;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  gothram?: string;
  rasi?: string;
  nakshatra?: string;
  /** ISO timestamp when the free trial began. */
  trialStartedAt?: string;
  subscribedUntil?: string;
  biometricEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const newUserId = () =>
  `user-panchangam-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** All profile rows. Stamped `type: user-panchangam` so this filters cleanly. */
export async function getUsers(): Promise<UserProfile[]> {
  if (!BACKEND_READY) throw new BackendNotReadyError();
  const rows = await withRetry(() =>
    request(`/itemsbytype/${ITEM_TYPE_USER}`),
  );
  return Array.isArray(rows) ? rows : [];
}

/** Look up a single profile by email. Falls back to scanning the type list when
 * the backend has no filter route, so this works either way. */
export async function getUserByEmail(
  email: string,
): Promise<UserProfile | null> {
  if (!BACKEND_READY) throw new BackendNotReadyError();
  const needle = email.trim().toLowerCase();

  try {
    const rows = await request(
      `/filter/type/${ITEM_TYPE_USER}/email/${encodeURIComponent(needle)}`,
    );
    if (Array.isArray(rows) && rows.length) return pickProfile(rows);
  } catch {
    // Filter route unavailable — fall through to the type listing.
  }

  const all = await getUsers();
  const matches = all.filter((u) => u.email?.trim().toLowerCase() === needle);
  return matches.length ? pickProfile(matches) : null;
}

/** When one email somehow maps to several rows, always resolve the same one —
 * the oldest — so a user's data never appears to move between sessions. */
function pickProfile(rows: UserProfile[]): UserProfile {
  return [...rows].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || ""),
  )[0];
}

/** Create or update a profile. Every payload is stamped with the item type. */
export async function saveUser(profile: Partial<UserProfile>): Promise<UserProfile> {
  if (!BACKEND_READY) throw new BackendNotReadyError();
  const now = new Date().toISOString();

  const payload: UserProfile = {
    ...profile,
    id: profile.id || newUserId(),
    type: ITEM_TYPE_USER,
    email: (profile.email || "").trim().toLowerCase(),
    createdAt: profile.createdAt || now,
    updatedAt: now,
  } as UserProfile;

  await withRetry(() =>
    request("/items", { method: "POST", body: JSON.stringify(payload) }),
  );
  return payload;
}

/** Sends the OTP email through our own route handler.
 *
 * It cannot go direct: the email service returns no Access-Control-Allow-Origin
 * header, so the browser blocks the call before it leaves the page ("Failed to
 * fetch"). /api/send-email forwards it server-side, where CORS does not apply,
 * and pins the sender address. */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: to, subject, body }),
  });

  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d?.error || d?.detail || "")
      .catch(() => "");
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
}

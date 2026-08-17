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
  requireConfig,
} from "./config";
import { getSession, clearSession } from "./session";

/** Built per call rather than at module load: these come from the environment
 * with no fallback, and a missing one should surface as a clear error where the
 * request is made, not crash the module on import. */
const baseUrl = () =>
  `${requireConfig("SERVICE_URL", SERVICE_URL).replace(/\/$/, "")}/${requireConfig(
    "ORG_CODE",
    ORG_CODE,
  )}`;

/** Thrown when the backend org is not provisioned yet, so callers can show a
 * useful message instead of surfacing a raw 400. */
export class BackendNotReadyError extends Error {
  constructor() {
    super("Profile service is not connected yet.");
    this.name = "BackendNotReadyError";
  }
}

/** Thrown when the session carries no usable token — either it expired, or it
 * predates the server-side login that issues one. Without this the backend
 * answers a bare `401 {"message":"Unauthorized"}`, which reads like a bug
 * rather than "sign in again". */
export class SessionExpiredError extends Error {
  constructor() {
    super("Your session has expired. Please sign in again.");
    this.name = "SessionExpiredError";
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
  // Fail fast rather than making a call that can only 401. A session with no
  // token is one issued before login moved server-side, or a restored mirror
  // of one.
  if (!session?.token) {
    clearSession();
    throw new SessionExpiredError();
  }
  headers.set("Authorization", `Bearer ${session.token}`);

  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  // A rejected token is not worth retrying, and leaving it in place would make
  // every later call fail the same way.
  if (res.status === 401 || res.status === 403) {
    clearSession();
    throw new SessionExpiredError();
  }

  if (!res.ok) {
    // Surface the server's own message — it is far more useful than the status
    // text (e.g. "No active organisation found for orgCode=panchangam").
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${options.method || "GET"} ${path} failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  if (res.status === 204) return null;

  // Not every successful route answers with JSON. Writes are queued onto SQS
  // and come back as an XML <SendMessageResponse>, so blindly calling
  // res.json() threw `Unexpected token '<', "<?xml vers"...` on every save.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    const text = await res.text().catch(() => "");
    return text || null;
  }

  return res.json();
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
  /** Required in the body on writes — see saveUser. */
  orgCode?: string;
  /** The backend expects a date on every row; it defaults to today on save. */
  date?: string;
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

/** Filters rows on two columns — the backend's filter2column route.
 * POST, not a path-based GET, matching the temple app. */
export async function filterItems(
  column1: string,
  value1: string,
  column2: string,
  value2: string,
): Promise<UserProfile[]> {
  if (!value1 || !value2) return [];
  const rows = await withRetry(() =>
    request("/items/filter2column", {
      method: "POST",
      body: JSON.stringify({
        column1,
        value1,
        column2,
        value2,
        orgCode: ORG_CODE,
      }),
    }),
  );
  return Array.isArray(rows) ? rows : [];
}

/** Look up a single profile by email, filtering on type + email so only this
 * app's rows are considered. Falls back to scanning the type listing if the
 * filter route is unavailable. */
export async function getUserByEmail(
  email: string,
): Promise<UserProfile | null> {
  if (!BACKEND_READY) throw new BackendNotReadyError();
  const needle = email.trim().toLowerCase();

  try {
    const rows = await filterItems("type", ITEM_TYPE_USER, "email", needle);
    if (rows.length) return pickProfile(rows);
    // An empty result is authoritative: this is a new user, not a failure.
    return null;
  } catch (err) {
    if (err instanceof Error && /401|403/.test(err.message)) throw err;
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

/** Create or update a profile. Every payload is stamped with the item type.
 *
 * The write is queued: the backend answers 200 with an SQS SendMessageResponse
 * and persists afterwards. So a 200 means "accepted", not "stored", and an
 * immediate read-back may not see the row yet. The saved object is returned
 * from here rather than re-fetched, so the UI stays correct regardless.
 *
 * `orgCode` MUST be in the body. The org in the URL path is not enough — the
 * queue consumer drops rows without it, and because SQS has already ack'd the
 * message the call still returns 200. Verified: an otherwise identical payload
 * without orgCode returns 200 and never appears; with it, the row persists.
 * `date` is likewise expected on every row, defaulted here as the temple app
 * does. */
export async function saveUser(profile: Partial<UserProfile>): Promise<UserProfile> {
  if (!BACKEND_READY) throw new BackendNotReadyError();
  const now = new Date().toISOString();

  const payload: UserProfile = {
    ...profile,
    id: profile.id || newUserId(),
    type: ITEM_TYPE_USER,
    orgCode: ORG_CODE,
    date: profile.date || new Date().toLocaleDateString("en-CA"),
    email: (profile.email || "").trim().toLowerCase(),
    createdAt: profile.createdAt || now,
    updatedAt: now,
  } as UserProfile;

  await withRetry(() =>
    request("/items", { method: "POST", body: JSON.stringify(payload) }),
  );
  return payload;
}

/** Removes a profile row. Irreversible — callers must confirm first. */
export async function deleteUser(id: string): Promise<void> {
  if (!BACKEND_READY) throw new BackendNotReadyError();
  if (!id) throw new Error("A row id is required to delete.");
  await request(`/removeitem/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------ *
 * Auth — the OTP is issued and verified server-side, which is also what
 * produces the bearer token the item service requires.
 * ------------------------------------------------------------------ */

async function postAuth(payload: Record<string, unknown>) {
  const res = await fetch("/api/auth/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
  return data;
}

/** Emails a code and returns the signed challenge to hand back on verify. */
export async function requestOtp(email: string): Promise<string> {
  const data = await postAuth({ action: "send", email });
  return data.otpToken as string;
}

/** Exchanges a correct code for the session token. */
export async function verifyOtp(
  email: string,
  otp: string,
  otpToken: string,
): Promise<{ token: string }> {
  const data = await postAuth({ action: "verify", email, otp, otpToken });
  return { token: data.token as string };
}

/** Sends a general email through our own route handler.
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

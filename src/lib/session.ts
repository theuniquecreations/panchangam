// Session handling.
//
// The session is written to two places on purpose:
//   1. sessionStorage — the working copy. Cleared when the tab (or the RN
//      WebView) closes, which is the behaviour we want for a signed-in state.
//   2. react-secure-storage — an encrypted mirror in localStorage, so a user
//      returning in a new tab is restored instead of being asked to sign in
//      again. Nothing readable is left in plain localStorage.
//
// Components read this through `useSession()`, which subscribes via
// useSyncExternalStore. Browser storage is an external store, so that is both
// the correct primitive and what keeps SSR/hydration honest — the server
// snapshot is always null and the real value arrives on the client.

"use client";

import { useSyncExternalStore, useMemo } from "react";
import secureLocalStorage from "react-secure-storage";
import { SESSION_KEY, TRIAL_DAYS } from "./config";

export type Session = {
  email: string;
  /** Profile row id, once the user has saved one. */
  profileId?: string;
  name?: string;
  token?: string;
  /** ISO timestamp — when this user's free trial started. */
  trialStartedAt?: string;
  subscribedUntil?: string;
  loggedInAt: string;
};

const isClient = () => typeof window !== "undefined";

/* ------------------------------------------------------------------ *
 * External store plumbing
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Snapshots must be referentially stable or useSyncExternalStore will loop, so
// the raw JSON string is the snapshot and parsing happens in a useMemo.
function getRawSnapshot(): string | null {
  if (!isClient()) return null;
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

const getServerSnapshot = (): string | null => null;

/** Restores the encrypted mirror into sessionStorage. Runs once, when the first
 * component subscribes, so a user returning in a fresh tab stays signed in. */
let hydrated = false;
function hydrateFromSecureStore() {
  if (hydrated || !isClient()) return;
  hydrated = true;

  try {
    if (sessionStorage.getItem(SESSION_KEY)) return; // this tab already has it
    const stored = secureLocalStorage.getItem(SESSION_KEY);
    if (!stored) return;
    const raw = typeof stored === "string" ? stored : JSON.stringify(stored);
    sessionStorage.setItem(SESSION_KEY, raw);
    notify();
  } catch {
    // Encrypted store unavailable (private mode, rotated keys) — treat as
    // logged out rather than breaking the page.
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  hydrateFromSecureStore();
  // Keep other tabs in step when the mirror changes.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Imperative read, for non-React callers such as the API client. */
export function getSession(): Session | null {
  if (!isClient()) return null;
  hydrateFromSecureStore();
  const raw = getRawSnapshot();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** Subscribes a component to the session. Returns null while server-rendering
 * and on the first client render, then the real value — so markup matches. */
export function useSession(): Session | null {
  const raw = useSyncExternalStore(subscribe, getRawSnapshot, getServerSnapshot);
  return useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }, [raw]);
}

/** True once the store has been read on the client, so a component can tell
 * "not signed in" apart from "not known yet" and avoid flashing the wrong UI. */
export function useSessionReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function setSession(session: Session): void {
  if (!isClient()) return;
  const raw = JSON.stringify(session);
  try {
    sessionStorage.setItem(SESSION_KEY, raw);
  } catch {
    // Storage full or blocked; the encrypted mirror below may still succeed.
  }
  try {
    secureLocalStorage.setItem(SESSION_KEY, raw);
  } catch {
    // Non-fatal: the user stays signed in for this tab only.
  }
  notify();
}

export function clearSession(): void {
  if (!isClient()) return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    secureLocalStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export const isLoggedIn = (): boolean => getSession() !== null;

/* ------------------------------------------------------------------ *
 * Trial / subscription entitlement
 * ------------------------------------------------------------------ */

export type Entitlement = {
  status: "subscribed" | "trial" | "expired" | "anonymous";
  /** Whole days left in the trial; 0 once it has run out. */
  daysLeft: number;
  active: boolean;
};

/** Resolves what the current user is entitled to. The public panchangam never
 * consults this — it gates the personalised features only. */
export function getEntitlement(session: Session | null): Entitlement {
  if (!session) return { status: "anonymous", daysLeft: 0, active: false };

  const now = Date.now();

  if (session.subscribedUntil) {
    const until = Date.parse(session.subscribedUntil);
    if (!Number.isNaN(until) && until > now) {
      return {
        status: "subscribed",
        daysLeft: Math.ceil((until - now) / 86_400_000),
        active: true,
      };
    }
  }

  if (session.trialStartedAt) {
    const started = Date.parse(session.trialStartedAt);
    if (!Number.isNaN(started)) {
      const ends = started + TRIAL_DAYS * 86_400_000;
      if (ends > now) {
        return {
          status: "trial",
          daysLeft: Math.ceil((ends - now) / 86_400_000),
          active: true,
        };
      }
    }
  }

  return { status: "expired", daysLeft: 0, active: false };
}

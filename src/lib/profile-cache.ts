// Read-your-own-writes for a queued backend.
//
// POST /{org}/items returns 200 with an SQS <SendMessageResponse>: the write is
// accepted, then persisted asynchronously. So saving, navigating away and
// coming back can re-read the *previous* row and show a stale name — the save
// looks like it was lost when it is simply still in flight.
//
// This keeps the last profile saved on this device and prefers it over a
// fetched row that is older. Once the queue catches up, the fetched row wins on
// its own and the cache stops mattering.

"use client";

import { PROFILE_CACHE_KEY } from "./config";
import type { UserProfile } from "./api";

const isClient = () => typeof window !== "undefined";

export function cacheProfile(profile: UserProfile): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Non-fatal: without the cache the user may briefly see the older row.
  }
}

export function readCachedProfile(email: string): UserProfile | null {
  if (!isClient()) return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as UserProfile;
    // Only ever apply it to the account it was saved for.
    return cached?.email?.toLowerCase() === email.trim().toLowerCase()
      ? cached
      : null;
  } catch {
    return null;
  }
}

export function clearCachedProfile(): void {
  if (!isClient()) return;
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Picks whichever of the two is newer by updatedAt. The fetched row wins ties
 * and wins outright once the queue has caught up, so this self-heals. */
export function withPendingWrite(
  fetched: UserProfile | null,
  email: string,
): UserProfile | null {
  const cached = readCachedProfile(email);
  if (!cached) return fetched;
  if (!fetched) return cached;

  const fetchedAt = Date.parse(fetched.updatedAt || "") || 0;
  const cachedAt = Date.parse(cached.updatedAt || "") || 0;

  if (cachedAt > fetchedAt) return cached;

  // The backend has caught up; drop the cache so it cannot go stale.
  clearCachedProfile();
  return fetched;
}

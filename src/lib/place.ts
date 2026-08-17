// The visitor's preferred location for panchangam calculation.
//
// Cached in plain localStorage (a city and its coordinates are not sensitive)
// so the home tile can render the right place immediately, before — or without
// — a profile fetch. Exposed as an external store for the same
// hydration-safety reasons as the session.

"use client";

import { useSyncExternalStore, useMemo } from "react";
import { PLACE_KEY } from "./config";

export type Place = {
  label: string;
  latitude: number;
  longitude: number;
  timeZone?: string;
};

const isClient = () => typeof window !== "undefined";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function getRawSnapshot(): string | null {
  if (!isClient()) return null;
  try {
    return localStorage.getItem(PLACE_KEY);
  } catch {
    return null;
  }
}

const getServerSnapshot = (): string | null => null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The saved place, or null when the visitor has not set one. */
export function useSavedPlace(): Place | null {
  const raw = useSyncExternalStore(subscribe, getRawSnapshot, getServerSnapshot);
  return useMemo(() => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Place;
      // Guard against a stale or hand-edited entry producing NaN coordinates,
      // which would surface as a broken panchangam rather than a clear error.
      return Number.isFinite(parsed?.latitude) && Number.isFinite(parsed?.longitude)
        ? parsed
        : null;
    } catch {
      return null;
    }
  }, [raw]);
}

export function savePlace(place: Place): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(place));
    notify();
  } catch {
    // Non-fatal — the tile falls back to the configured default location.
  }
}

export function clearPlace(): void {
  if (!isClient()) return;
  try {
    localStorage.removeItem(PLACE_KEY);
    notify();
  } catch {
    /* ignore */
  }
}

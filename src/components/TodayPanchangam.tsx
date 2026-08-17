"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import { MapPin, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getPanchangam,
  getTimeZoneOffsetHours,
  type PanchangamData,
} from "@/lib/panchangam";
import { DEFAULT_LOCATION, REVERSE_GEOCODE_URL } from "@/lib/config";
import type { Place } from "@/lib/place";

// The wall clock as an external store. Ticking via useSyncExternalStore rather
// than a setState-in-effect keeps the snapshot a stable primitive (whole
// seconds) and renders 0 on the server, so hydration matches.
const subscribeToClock = (onTick: () => void) => {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
};

function useClockSeconds(): number {
  return useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );
}

/** Local calendar date as YYYY-MM-DD. Built from local parts rather than
 * toISOString(), which would shift the day for anyone behind UTC. */
function toDateInput(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Parses YYYY-MM-DD as a *local* midnight. `new Date("2026-08-17")` parses as
 * UTC and lands on the previous day in western time zones. */
function fromDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const shiftDays = (value: string, delta: number): string => {
  const d = fromDateInput(value);
  d.setDate(d.getDate() + delta);
  return toDateInput(d);
};

// Computes and renders the panchangam for a place and a chosen day.
// Self-contained: owns the calendar filter, the live clock and the
// "use my location" toggle.
//
// `place` lets a signed-in user's saved location override the default; when it
// is absent the tile falls back to the configured reference location. Either
// way the panchangam is public — no login is required to read it.
export default function TodayPanchangam({
  place,
  render,
}: {
  place?: Place | null;
  render: (args: {
    panchang: PanchangamData | null;
    header: React.ReactNode;
    onPrev: () => void;
    onNext: () => void;
  }) => React.ReactNode;
}) {
  const clockSeconds = useClockSeconds();
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [myPlace, setMyPlace] = useState<Place | null>(null);
  const [locLabel, setLocLabel] = useState("");
  const [locLoading, setLocLoading] = useState(false);

  // null means "follow today". Only an explicit pick pins the date, so the
  // default needs no effect and stays correct across midnight.
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  const base: Place = place || DEFAULT_LOCATION;
  const active: Place = useMyLocation && myPlace ? myPlace : base;

  // "" while server-rendering (clock snapshot is 0), real date once mounted.
  const todayValue = clockSeconds
    ? toDateInput(new Date(clockSeconds * 1000))
    : "";
  const selectedDate = pickedDate ?? todayValue;
  const isToday = !!selectedDate && selectedDate === todayValue;

  // The panchangam is a pure function of (place, date), so it is derived during
  // render rather than pushed into state from an effect. The engine is
  // synchronous and takes a couple of milliseconds.
  const panchang = useMemo<PanchangamData | null>(() => {
    if (!selectedDate) return null;
    try {
      // Anchor to local noon: the engine works from local midnight, and noon
      // keeps the intended calendar day on either side of a DST shift.
      const date = fromDateInput(selectedDate);
      date.setHours(12, 0, 0, 0);
      const tz = active.timeZone
        ? getTimeZoneOffsetHours(date, active.timeZone)
        : -date.getTimezoneOffset() / 60;
      return getPanchangam(date, active.latitude, active.longitude, tz);
    } catch (e) {
      console.error("Failed to compute Panchangam:", e);
      return null;
    }
  }, [selectedDate, active.latitude, active.longitude, active.timeZone]);

  const handleToggleLocation = () => {
    if (useMyLocation) {
      setUseMyLocation(false);
      setLocLabel("");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocLabel("Location is not available on this device");
      return;
    }

    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocLoading(false);
        const { latitude, longitude } = pos.coords;
        setMyPlace({ label: "Your current location", latitude, longitude });
        setUseMyLocation(true);
        setLocLabel("Your current location");

        // Resolve a human-readable place name in the background; the panchangam
        // is already correct without it.
        (async () => {
          try {
            const res = await fetch(
              `${REVERSE_GEOCODE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
            );
            const d = await res.json();
            const city = d.city || d.locality || d.principalSubdivision || "";
            const region = d.principalSubdivision || "";
            const label = [city, region].filter(Boolean).join(", ");
            if (label) setLocLabel(label);
          } catch {
            // Keep the generic label.
          }
        })();
      },
      (err) => {
        setLocLoading(false);
        setLocLabel(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied"
            : "Could not determine your location",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  // 0 is the server snapshot; skip rendering the clock until the client ticks.
  const liveClock = (() => {
    if (!clockSeconds) return "";
    const d = new Date(clockSeconds * 1000);
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  })();

  const header = (
    <>
      <div className="panchangam-header-row">
        <span>
          {useMyLocation ? locLabel || "Your current location" : base.label}
          {panchang ? ` · ${panchang.date}` : ""}
        </span>
        {liveClock && isToday && <span className="live-clock">{liveClock}</span>}
      </div>
      <button
        type="button"
        onClick={handleToggleLocation}
        className={`panchangam-loc-toggle ${useMyLocation ? "active" : ""}`}
        disabled={locLoading}
      >
        <MapPin size={12} />
        <span>
          {locLoading
            ? "Locating…"
            : useMyLocation
              ? `Using your location · switch to ${base.label}`
              : "Use my current location"}
        </span>
      </button>
      {!useMyLocation && locLabel && (
        <span className="panchangam-loc-error">{locLabel}</span>
      )}
    </>
  );

  return (
    <>
      {/* Calendar filter — pick any date and the panchangam below follows. */}
      <div className="date-bar">
        <button
          type="button"
          className="date-bar-nav"
          onClick={() => setPickedDate(shiftDays(selectedDate, -1))}
          aria-label="Previous day"
          disabled={!selectedDate}
        >
          <ChevronLeft size={18} />
        </button>

        {/* Tapping anywhere on the field opens the native calendar. Typing is
            blocked so the only way to change the date is through the picker. */}
        <label
          className="date-bar-field"
          onClick={(e) => {
            const input = e.currentTarget.querySelector("input");
            // showPicker throws if the browser blocks it outside a user
            // gesture; the click handler is one, but guard anyway.
            try {
              input?.showPicker?.();
            } catch {
              /* fall back to the browser's own indicator */
            }
          }}
        >
          <CalendarDays size={16} className="date-bar-icon" />
          <input
            type="date"
            className="date-bar-input"
            value={selectedDate}
            onChange={(e) => setPickedDate(e.target.value)}
            onKeyDown={(e) => e.preventDefault()}
            aria-label="Show panchangam for date"
          />
        </label>

        <button
          type="button"
          className="date-bar-nav"
          onClick={() => setPickedDate(shiftDays(selectedDate, 1))}
          aria-label="Next day"
          disabled={!selectedDate}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {!isToday && todayValue && (
        <button
          type="button"
          className="date-bar-today"
          onClick={() => setPickedDate(null)}
        >
          Back to today
        </button>
      )}

      {render({
        panchang,
        header,
        onPrev: () => setPickedDate(shiftDays(selectedDate, -1)),
        onNext: () => setPickedDate(shiftDays(selectedDate, 1)),
      })}
    </>
  );
}

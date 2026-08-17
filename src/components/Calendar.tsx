"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Local calendar date as YYYY-MM-DD, built from local parts. toISOString()
 * would shift the day for anyone behind UTC. */
export function toDateValue(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Parses YYYY-MM-DD as *local* midnight. `new Date("2026-08-17")` parses as
 * UTC and lands on the previous day in western time zones. */
export function fromDateValue(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const shiftDays = (value: string, delta: number): string => {
  const d = fromDateValue(value);
  d.setDate(d.getDate() + delta);
  return toDateValue(d);
};

/** The days to render for a month, padded with blanks so the 1st lands on its
 * real weekday. */
function buildGrid(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

// A calendar in the app's own theme, replacing the browser's native date
// picker. The native control cannot be styled beyond its box — its popup is
// drawn by the OS — so the whole thing is rendered here instead.
export default function Calendar({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromDateValue(value) : null;

  // Which month the grid is showing; follows the selection when it changes.
  const [viewYear, setViewYear] = useState(() =>
    selected ? selected.getFullYear() : new Date().getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(() =>
    selected ? selected.getMonth() : new Date().getMonth(),
  );

  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, the two things people expect from a
  // popup like this.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const openPicker = () => {
    // Always open on the selected month, even after browsing elsewhere and
    // dismissing without choosing.
    if (selected) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
    setOpen(true);
  };

  const stepMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const label = selected
    ? selected.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Select a date";

  return (
    <div className="cal-wrap" ref={wrapRef}>
      <button
        type="button"
        className="cal-trigger"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={16} className="cal-trigger-icon" />
        <span className="cal-trigger-label">{label}</span>
      </button>

      {open && (
        <div className="cal-popup" role="dialog" aria-label="Choose a date">
          <div className="cal-head">
            <button
              type="button"
              className="cal-head-nav"
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft size={17} />
            </button>
            <span className="cal-head-title">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              className="cal-head-nav"
              onClick={() => stepMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="cal-grid cal-weekdays">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="cal-weekday">
                {d}
              </span>
            ))}
          </div>

          <div className="cal-grid">
            {cells.map((day, i) => {
              if (day === null) return <span key={`pad-${i}`} />;
              const dayValue = toDateValue(new Date(viewYear, viewMonth, day));
              const isSelected = dayValue === value;
              const isToday = dayValue === today;
              return (
                <button
                  key={dayValue}
                  type="button"
                  className={`cal-day${isSelected ? " selected" : ""}${
                    isToday ? " today" : ""
                  }`}
                  onClick={() => {
                    onChange(dayValue);
                    setOpen(false);
                  }}
                  aria-current={isToday ? "date" : undefined}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="cal-today-btn"
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}

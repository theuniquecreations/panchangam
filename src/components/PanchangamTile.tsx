"use client";

import { useState, type ReactNode } from "react";
import {
  Moon,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PanchangamData } from "@/lib/panchangam";

// Values arrive as "Krishna Dashami until 03:28:46 PM". Split the name from the
// "until <time>" clause so long values wrap predictably in a narrow phone
// column instead of pushing the grid around.
function PanchangamValue({ value }: { value: string }) {
  const match = value.match(/^(.*) (until .+)$/);
  if (!match) return <span className="panchangam-value">{value}</span>;
  return (
    <span className="panchangam-value panchangam-value-split">
      <span>{match[1]}</span>
      <span>{match[2]}</span>
    </span>
  );
}

// Presentational panchangam tile. It renders a PanchangamData and nothing more;
// the owner supplies the computed data plus an optional header (location
// toggle, live clock) so the same tile serves the public home page and the
// personalised view without diverging.
export default function PanchangamTile({
  panchang,
  title = "Today's Panchangam",
  subtitle = "Based on NASA's JPL Ephemeris",
  header,
  defaultExpanded = false,
  fallback = "Computing Panchangam…",
  id,
  onPrev,
  onNext,
}: {
  panchang: PanchangamData | null;
  title?: string;
  subtitle?: string;
  header?: ReactNode;
  defaultExpanded?: boolean;
  fallback?: string;
  id?: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [isAlmanacOpen, setIsAlmanacOpen] = useState(defaultExpanded);

  return (
    <div className="info-tile" id={id}>
      <div className="info-tile-title-row">
        <Moon className="info-tile-icon" size={24} strokeWidth={1.5} />
        <div className="info-tile-heading">
          <h3 className="info-tile-title">{title}</h3>
          <div className="info-tile-subtitle">{subtitle}</div>
        </div>
        {(onPrev || onNext) && (
          <div className="info-tile-nav">
            <button
              type="button"
              className="info-tile-nav-btn"
              onClick={onPrev}
              aria-label="Previous day"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="info-tile-nav-btn"
              onClick={onNext}
              aria-label="Next day"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {panchang ? (
        <>
          {header && <div className="panchangam-header">{header}</div>}

          <div className="panchangam-grid">
            <div className="panchangam-field">
              <span className="panchangam-label">Tithi</span>
              <PanchangamValue value={panchang.tithi} />
            </div>
            <div className="panchangam-field">
              <span className="panchangam-label">Nakshatra</span>
              <PanchangamValue value={panchang.nakshatra} />
            </div>
            <div className="panchangam-field">
              <span className="panchangam-label">Yoga</span>
              <PanchangamValue value={panchang.yoga} />
            </div>
            <div className="panchangam-field">
              <span className="panchangam-label">Karana</span>
              <span className="panchangam-value">{panchang.karana}</span>
            </div>
            <div className="panchangam-field">
              <span className="panchangam-label">Vara</span>
              <span className="panchangam-value">{panchang.vara}</span>
            </div>
            <div className="panchangam-field">
              <span className="panchangam-label">Masa</span>
              <span className="panchangam-value">{panchang.masa}</span>
            </div>
            <div className="panchangam-field">
              <span className="panchangam-label">Sunrise</span>
              <span className="panchangam-value">{panchang.sunrise}</span>
            </div>
            <div className="panchangam-field">
              <span className="panchangam-label">Sunset</span>
              <span className="panchangam-value">{panchang.sunset}</span>
            </div>
          </div>

          <div className="panchangam-almanac-section">
            <button
              type="button"
              onClick={() => setIsAlmanacOpen(!isAlmanacOpen)}
              className="almanac-heading"
              aria-expanded={isAlmanacOpen}
            >
              <span>{isAlmanacOpen ? "View Less" : "View More"}</span>
              {isAlmanacOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {isAlmanacOpen && (
              <div style={{ marginTop: 12 }}>
                <div className="almanac-row">
                  <span className="almanac-label">Samvatsara</span>
                  <span className="almanac-value">{panchang.samvatsara}</span>
                </div>
                <div className="almanac-row">
                  <span className="almanac-label">Moonrise</span>
                  <span className="almanac-value">{panchang.moonrise}</span>
                </div>
                <div className="almanac-row">
                  <span className="almanac-label">Moonset</span>
                  <span className="almanac-value">{panchang.moonset}</span>
                </div>
                <div className="almanac-row">
                  <span className="almanac-label">Abhijit Muhurtham</span>
                  <span className="almanac-value auspicious">
                    {panchang.abhijitMuhurth}
                  </span>
                </div>
                <div className="almanac-row">
                  <span className="almanac-label">Amritkalam</span>
                  <span className="almanac-value auspicious">
                    {panchang.amritkalam}
                  </span>
                </div>
                <div className="almanac-row">
                  <span className="almanac-label">Rahu Kaal</span>
                  <span className="almanac-value inauspicious">
                    {panchang.rahuKaal}
                  </span>
                </div>
                <div className="almanac-row">
                  <span className="almanac-label">Yama Gandam</span>
                  <span className="almanac-value inauspicious">
                    {panchang.yamaGandam}
                  </span>
                </div>
                <div className="almanac-row">
                  <span className="almanac-label">Gulika Kaal</span>
                  <span className="almanac-value inauspicious">
                    {panchang.gulikaKaal}
                  </span>
                </div>
                <div className="almanac-row">
                  <span className="almanac-label">Varjyam</span>
                  <span className="almanac-value inauspicious">
                    {panchang.varjyam}
                  </span>
                </div>
                {panchang.durmuhurtam?.length > 0 && (
                  <div className="almanac-row" style={{ alignItems: "flex-start" }}>
                    <span className="almanac-label">Durmuhurtam</span>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        textAlign: "right",
                      }}
                    >
                      {panchang.durmuhurtam.map((t, i) => (
                        <span
                          key={i}
                          className="almanac-value inauspicious"
                          style={{ lineHeight: 1.2 }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="events-fallback">{fallback}</div>
      )}
    </div>
  );
}

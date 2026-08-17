"use client";

import Link from "next/link";
import { Sparkles, UserPlus } from "lucide-react";
import PanchangamTile from "@/components/PanchangamTile";
import TodayPanchangam from "@/components/TodayPanchangam";
import { useSession, useSessionReady, getEntitlement } from "@/lib/session";
import { useSavedPlace } from "@/lib/place";
import { SUBSCRIPTION_LABEL, TRIAL_DAYS } from "@/lib/config";

// Home. The panchangam here is fully public — no login, no gating. Signing in
// only personalises it (the saved location is used, and birth details unlock the
// personalised readings).
export default function Home() {
  const session = useSession();
  const ready = useSessionReady();
  const place = useSavedPlace();

  const entitlement = getEntitlement(session);

  return (
    <>
      {ready && session && entitlement.status === "trial" && (
        <div className="trial-banner">
          <Sparkles size={16} />
          <span>
            Free trial · {entitlement.daysLeft}{" "}
            {entitlement.daysLeft === 1 ? "day" : "days"} left, then{" "}
            {SUBSCRIPTION_LABEL}
          </span>
        </div>
      )}

      <TodayPanchangam
        place={place}
        render={({ panchang, header, onPrev, onNext }) => (
          <PanchangamTile
            id="todays-panchangam-tile"
            panchang={panchang}
            header={header}
            onPrev={onPrev}
            onNext={onNext}
          />
        )}
      />

      {ready && !session && (
        <>
          <div className="section-heading">Personalise</div>
          <div className="card">
            <h2 className="card-title">Get your own panchangam</h2>
            <p className="card-note">
              Sign in and add your birth details to see readings calculated for
              you — your nakshatra, rasi and the muhurtams that matter to you.
              Free for {TRIAL_DAYS} days, then {SUBSCRIPTION_LABEL}.
            </p>
            <Link
              href="/login"
              className="btn btn-primary"
              style={{ marginTop: 14 }}
            >
              <UserPlus size={16} />
              Sign in to personalise
            </Link>
          </div>
        </>
      )}

      {ready && session && (
        <>
          <div className="section-heading">Your details</div>
          <div className="card">
            <h2 className="card-title">
              {session.name ? `Namaste, ${session.name}` : "Your profile"}
            </h2>
            <p className="card-note">
              Keep your birth date, time and place up to date so your
              personalised panchangam stays accurate.
            </p>
            <Link
              href="/profile"
              className="btn btn-ghost"
              style={{ marginTop: 14 }}
            >
              Edit profile
            </Link>
          </div>
        </>
      )}
    </>
  );
}

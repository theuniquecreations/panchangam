"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, ScanFace, MapPin, Sparkles } from "lucide-react";
import {
  getUserByEmail,
  saveUser,
  BackendNotReadyError,
  type UserProfile,
} from "@/lib/api";
import {
  useSession,
  useSessionReady,
  setSession,
  getEntitlement,
  type Session,
} from "@/lib/session";
import { savePlace } from "@/lib/place";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
} from "@/lib/biometric";
import {
  SUBSCRIPTION_LABEL,
  TRIAL_DAYS,
  REVERSE_GEOCODE_URL,
} from "@/lib/config";

type FormState = {
  name: string;
  gender: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  latitude: string;
  longitude: string;
  gothram: string;
  rasi: string;
  nakshatra: string;
};

const EMPTY: FormState = {
  name: "",
  gender: "",
  birthDate: "",
  birthTime: "",
  birthPlace: "",
  latitude: "",
  longitude: "",
  gothram: "",
  rasi: "",
  nakshatra: "",
};

export default function ProfilePage() {
  const router = useRouter();
  const session = useSession();
  const sessionReady = useSessionReady();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [locating, setLocating] = useState(false);

  // Personalised details need an account; the public panchangam does not.
  // Wait for the session store to report in before redirecting, or a signed-in
  // user would be bounced to /login on the first render.
  useEffect(() => {
    if (!sessionReady) return;
    if (!session) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    (async () => {
      const available = await isBiometricAvailable();
      if (cancelled) return;
      setBioAvailable(available);
      setBioOn(isBiometricEnabled());

      try {
        const profile = await getUserByEmail(session.email);
        if (cancelled) return;
        if (profile) {
          setExisting(profile);
          setForm({
            name: profile.name || "",
            gender: profile.gender || "",
            birthDate: profile.birthDate || "",
            birthTime: profile.birthTime || "",
            birthPlace: profile.birthPlace || "",
            latitude: profile.latitude?.toString() || "",
            longitude: profile.longitude?.toString() || "",
            gothram: profile.gothram || "",
            rasi: profile.rasi || "",
            nakshatra: profile.nakshatra || "",
          });
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof BackendNotReadyError
            ? err.message
            : `Could not load your profile: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, session, sessionReady]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleUseLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm((f) => ({
          ...f,
          latitude: latitude.toFixed(4),
          longitude: longitude.toFixed(4),
        }));
        try {
          const res = await fetch(
            `${REVERSE_GEOCODE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
          );
          const d = await res.json();
          const label = [d.city || d.locality, d.principalSubdivision, d.countryName]
            .filter(Boolean)
            .join(", ");
          if (label) setForm((f) => ({ ...f, birthPlace: f.birthPlace || label }));
        } catch {
          // Coordinates are the part that matters; the label is a convenience.
        }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    setError("");
    setNotice("");

    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);

    try {
      const saved = await saveUser({
        ...existing,
        id: existing?.id,
        email: session.email,
        name: form.name.trim(),
        gender: form.gender,
        birthDate: form.birthDate,
        birthTime: form.birthTime,
        birthPlace: form.birthPlace.trim(),
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lng) ? lng : undefined,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        gothram: form.gothram.trim(),
        rasi: form.rasi.trim(),
        nakshatra: form.nakshatra.trim(),
        trialStartedAt: existing?.trialStartedAt || session.trialStartedAt,
        biometricEnabled: bioOn,
      });

      setExisting(saved);

      // Keep the session in step so the app bar and home page reflect the
      // change without a reload.
      const next: Session = {
        ...session,
        profileId: saved.id,
        name: saved.name,
        trialStartedAt: saved.trialStartedAt,
      };
      setSession(next);

      // Cache the location so the home tile can default to it before the
      // profile has loaded.
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        savePlace({
          label: form.birthPlace.trim() || "Your location",
          latitude: lat,
          longitude: lng,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }

      setNotice("Your details are saved.");
    } catch (err) {
      setError(
        err instanceof BackendNotReadyError
          ? err.message
          : `Could not save: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBiometric = async () => {
    if (!session) return;
    setError("");
    try {
      if (bioOn) {
        disableBiometric();
        setBioOn(false);
        setNotice("Face ID sign-in turned off for this device.");
      } else {
        await enableBiometric(session.email);
        setBioOn(true);
        setNotice("Face ID sign-in is on for this device.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Face ID.");
    }
  };

  if (!session) return null;

  const entitlement = getEntitlement(session);

  return (
    <>
      {entitlement.status === "trial" && (
        <div className="trial-banner">
          <Sparkles size={16} />
          <span>
            Free trial · {entitlement.daysLeft}{" "}
            {entitlement.daysLeft === 1 ? "day" : "days"} left, then{" "}
            {SUBSCRIPTION_LABEL}
          </span>
        </div>
      )}
      {entitlement.status === "expired" && (
        <div className="alert alert-info">
          Your {TRIAL_DAYS}-day trial has ended. Subscribe for{" "}
          {SUBSCRIPTION_LABEL} to keep your personalised panchangam.
        </div>
      )}

      <div className="section-heading">Your details</div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        {notice && !error && <div className="alert alert-success">{notice}</div>}

        <p className="card-note" style={{ marginBottom: 16 }}>
          Signed in as <strong>{session.email}</strong>. These details are used to
          calculate your personalised panchangam.
        </p>

        {loading ? (
          <p className="card-note">Loading your details…</p>
        ) : (
          <>
            <div className="field">
              <label className="field-label" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                className="field-input"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="gender">
                Gender
              </label>
              <select
                id="gender"
                className="field-input"
                value={form.gender}
                onChange={(e) => set("gender")(e.target.value)}
              >
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="birthDate">
                  Date of birth
                </label>
                <input
                  id="birthDate"
                  className="field-input"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => set("birthDate")(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="birthTime">
                  Time of birth
                </label>
                <input
                  id="birthTime"
                  className="field-input"
                  type="time"
                  value={form.birthTime}
                  onChange={(e) => set("birthTime")(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="birthPlace">
                Place of birth
              </label>
              <input
                id="birthPlace"
                className="field-input"
                value={form.birthPlace}
                onChange={(e) => set("birthPlace")(e.target.value)}
                placeholder="City, State, Country"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="latitude">
                  Latitude
                </label>
                <input
                  id="latitude"
                  className="field-input"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(e) => set("latitude")(e.target.value)}
                  placeholder="23.1765"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="longitude">
                  Longitude
                </label>
                <input
                  id="longitude"
                  className="field-input"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(e) => set("longitude")(e.target.value)}
                  placeholder="75.7885"
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleUseLocation}
              disabled={locating}
              style={{ marginBottom: 16 }}
            >
              <MapPin size={15} />
              {locating ? "Locating…" : "Use my current location"}
            </button>

            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="rasi">
                  Rasi
                </label>
                <input
                  id="rasi"
                  className="field-input"
                  value={form.rasi}
                  onChange={(e) => set("rasi")(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="nakshatra">
                  Nakshatra
                </label>
                <input
                  id="nakshatra"
                  className="field-input"
                  value={form.nakshatra}
                  onChange={(e) => set("nakshatra")(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="gothram">
                Gothram
              </label>
              <input
                id="gothram"
                className="field-input"
                value={form.gothram}
                onChange={(e) => set("gothram")(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={16} />
              {saving ? "Saving…" : "Save details"}
            </button>
          </>
        )}
      </div>

      {bioAvailable && (
        <>
          <div className="section-heading">Sign-in</div>
          <div className="card">
            <h2 className="card-title">Face ID</h2>
            <p className="card-note" style={{ marginBottom: 14 }}>
              {bioOn
                ? "Face ID sign-in is on for this device."
                : "Turn on Face ID so you can sign in on this device without waiting for a code."}
            </p>
            <button
              type="button"
              className={bioOn ? "btn btn-ghost" : "btn btn-secondary"}
              onClick={handleToggleBiometric}
            >
              <ScanFace size={17} />
              {bioOn ? "Turn off Face ID" : "Enable Face ID"}
            </button>
          </div>
        </>
      )}
    </>
  );
}

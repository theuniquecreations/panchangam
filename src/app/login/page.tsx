"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, KeyRound, ScanFace, ArrowLeft } from "lucide-react";
import { sendEmail, getUserByEmail, BackendNotReadyError } from "@/lib/api";
import { setSession, type Session } from "@/lib/session";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  signInWithBiometric,
} from "@/lib/biometric";
import {
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_S,
  BRAND_TITLE,
} from "@/lib/config";

// Where the pending OTP challenge is held between the two steps.
const OTP_CHALLENGE_KEY = "panchangam_otp_challenge";

type Challenge = { email: string; code: string; expiresAt: number };

// SECURITY NOTE — the OTP is generated in the browser and checked in the
// browser, because the only backend available is a generic "send this email"
// service with no verify endpoint. Anyone who opens devtools can read the code
// they were sent, so this proves *possession of the inbox* only loosely and
// must not be treated as strong authentication.
//
// The fix is a server-side pair — POST /otp/request and POST /otp/verify —
// issuing the code and returning a signed token. This module is deliberately
// shaped around that split (`requestOtp` / `verifyOtp`) so only their bodies
// need replacing, not the UI.
function createChallenge(email: string): Challenge {
  const digits = new Uint32Array(OTP_LENGTH);
  crypto.getRandomValues(digits);
  const code = Array.from(digits, (d) => d % 10).join("");
  return { email, code, expiresAt: Date.now() + OTP_TTL_MS };
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [canUseBiometric, setCanUseBiometric] = useState(false);

  useEffect(() => {
    (async () => {
      setCanUseBiometric((await isBiometricAvailable()) && isBiometricEnabled());
    })();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Signs the user in and lands them back on the panchangam. */
  const completeLogin = async (verifiedEmail: string) => {
    const now = new Date().toISOString();
    let session: Session = { email: verifiedEmail, loggedInAt: now };

    // Pull the existing profile so the trial clock and name survive re-logins.
    try {
      const profile = await getUserByEmail(verifiedEmail);
      if (profile) {
        session = {
          ...session,
          profileId: profile.id,
          name: profile.name,
          trialStartedAt: profile.trialStartedAt || now,
          subscribedUntil: profile.subscribedUntil,
        };
      } else {
        session.trialStartedAt = now;
      }
    } catch (err) {
      // A profile lookup failure must not block sign-in — the profile page
      // will surface the real problem and let them retry there.
      if (!(err instanceof BackendNotReadyError)) {
        console.warn("Profile lookup failed during login:", err);
      }
      session.trialStartedAt = now;
    }

    setSession(session);
    router.push("/profile");
  };

  const handleSendOtp = async () => {
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError("Enter a valid email address.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const challenge = createChallenge(addr);
      await sendEmail(
        addr,
        `Your ${BRAND_TITLE} sign-in code`,
        `<p>Your ${BRAND_TITLE} sign-in code is:</p>
         <p style="font-size:26px;font-weight:700;letter-spacing:5px">${challenge.code}</p>
         <p>It expires in ${Math.round(OTP_TTL_MS / 60000)} minutes. If you did not request it, you can ignore this email.</p>`,
      );

      sessionStorage.setItem(OTP_CHALLENGE_KEY, JSON.stringify(challenge));
      setStep("otp");
      setCooldown(OTP_RESEND_COOLDOWN_S);
      setNotice(`We sent a ${OTP_LENGTH}-digit code to ${addr}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not send the code: ${err.message}`
          : "Could not send the code.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    let challenge: Challenge | null = null;
    try {
      const raw = sessionStorage.getItem(OTP_CHALLENGE_KEY);
      challenge = raw ? (JSON.parse(raw) as Challenge) : null;
    } catch {
      challenge = null;
    }

    if (!challenge) {
      setError("That code has expired. Request a new one.");
      setStep("email");
      return;
    }
    if (Date.now() > challenge.expiresAt) {
      sessionStorage.removeItem(OTP_CHALLENGE_KEY);
      setError("That code has expired. Request a new one.");
      setStep("email");
      return;
    }
    if (code.trim() !== challenge.code) {
      setError("That code is not correct.");
      return;
    }

    setBusy(true);
    sessionStorage.removeItem(OTP_CHALLENGE_KEY);
    await completeLogin(challenge.email);
    setBusy(false);
  };

  const handleBiometric = async () => {
    setError("");
    setBusy(true);
    try {
      const verifiedEmail = await signInWithBiometric();
      if (verifiedEmail) {
        await completeLogin(verifiedEmail);
      } else {
        setError("Biometric sign-in was cancelled.");
      }
    } catch {
      setError("Biometric sign-in failed. Use your email instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="section-heading">Sign in</div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        {notice && !error && <div className="alert alert-success">{notice}</div>}

        {step === "email" ? (
          <>
            <h2 className="card-title">Sign in with your email</h2>
            <p className="card-note" style={{ marginBottom: 16 }}>
              We&apos;ll send you a one-time code. No password to remember.
            </p>

            <div className="field">
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="field-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSendOtp}
              disabled={busy}
            >
              <Mail size={16} />
              {busy ? "Sending…" : "Email me a code"}
            </button>

            {canUseBiometric && (
              <>
                <p
                  className="card-note"
                  style={{ textAlign: "center", margin: "16px 0 12px" }}
                >
                  or
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleBiometric}
                  disabled={busy}
                >
                  <ScanFace size={17} />
                  Sign in with Face ID
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <h2 className="card-title">Enter your code</h2>
            <p className="card-note" style={{ marginBottom: 16 }}>
              Sent to {email.trim().toLowerCase()}.
            </p>

            <div className="field">
              <label className="field-label" htmlFor="otp">
                {OTP_LENGTH}-digit code
              </label>
              <input
                id="otp"
                className="field-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                placeholder="000000"
                style={{ letterSpacing: "0.4em", fontSize: 20, fontWeight: 700 }}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleVerifyOtp}
              disabled={busy || code.length !== OTP_LENGTH}
            >
              <KeyRound size={16} />
              {busy ? "Verifying…" : "Verify and sign in"}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              onClick={handleSendOtp}
              disabled={busy || cooldown > 0}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
                setNotice("");
              }}
            >
              <ArrowLeft size={15} />
              Use a different email
            </button>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <p className="card-note">
          You don&apos;t need an account to read today&apos;s panchangam — signing
          in only adds your personalised readings.
        </p>
      </div>
    </>
  );
}

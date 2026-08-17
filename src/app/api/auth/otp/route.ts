// Server-side OTP: issue a code, then exchange it for a session token.
//
// This replaces the earlier browser-side OTP, which could not be trusted (the
// code was visible to whoever requested it) and, more practically, produced no
// token — so every item-service call came back
// `401 Unauthorized: Missing or invalid token`.
//
// The token is an HS256 JWT signed with JWT_SECRET, carrying
// {email, name, role, orgCode} — the same shape the temple app mints and the
// same secret the item service validates against. Using the `sbht` org means
// this app must share that org's JWT_SECRET.
//
// The pending challenge is itself a short-lived JWT handed back to the client
// rather than server state, so this stays stateless across lambda invocations.
// It carries a hash of the code, never the code itself.

import { NextResponse, type NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { sendEmailServer } from "@/lib/server/email";
import {
  ORG_CODE,
  OTP_LENGTH,
  OTP_TTL_MS,
  BRAND_TITLE,
} from "@/lib/config";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashOtp = (otp: string, email: string) =>
  createHash("sha256").update(`${email}:${otp}`).digest("hex");

/** Constant-time compare so a wrong code cannot be narrowed down by timing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    email?: string;
    otp?: string;
    otpToken?: string;
    name?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required" },
      { status: 400 },
    );
  }

  /* ---------------------------------------------------------------- *
   * send — generate a code, email it, return the signed challenge
   * ---------------------------------------------------------------- */
  if (body.action === "send") {
    // randomInt is drawn from the CSPRNG, unlike Math.random.
    const otp = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");

    try {
      const otpToken = await new SignJWT({
        // Only the hash travels to the client, so holding the challenge does
        // not reveal the code.
        otpHash: hashOtp(otp, email),
        email,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${Math.round(OTP_TTL_MS / 1000)}s`)
        .sign(getJwtSecret());

      await sendEmailServer(
        email,
        `Your ${BRAND_TITLE} sign-in code`,
        `<p>Your ${BRAND_TITLE} sign-in code is:</p>
         <p style="font-size:26px;font-weight:700;letter-spacing:5px">${otp}</p>
         <p>It expires in ${Math.round(OTP_TTL_MS / 60000)} minutes. If you did not request it, you can ignore this email.</p>`,
      );

      return NextResponse.json({ success: true, otpToken });
    } catch (err) {
      console.error("OTP send failed:", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error && err.message.includes("JWT_SECRET")
              ? "Server is missing JWT_SECRET."
              : "Could not send the code. Please try again.",
        },
        { status: 502 },
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * verify — check the code, mint the session token
   * ---------------------------------------------------------------- */
  if (body.action === "verify") {
    const { otp, otpToken } = body;
    if (!otp || !otpToken) {
      return NextResponse.json(
        { error: "Both the code and the challenge are required" },
        { status: 400 },
      );
    }

    let payload: { otpHash?: string; email?: string };
    try {
      ({ payload } = (await jwtVerify(otpToken, getJwtSecret())) as {
        payload: { otpHash?: string; email?: string };
      });
    } catch {
      // Covers both a tampered challenge and an expired one.
      return NextResponse.json(
        { error: "That code has expired. Request a new one." },
        { status: 401 },
      );
    }

    // The challenge is bound to the address it was issued for, so a code for
    // one inbox cannot be replayed against another.
    if (payload.email !== email) {
      return NextResponse.json(
        { error: "That code was issued for a different email." },
        { status: 401 },
      );
    }

    if (!payload.otpHash || !safeEqual(payload.otpHash, hashOtp(otp.trim(), email))) {
      return NextResponse.json({ error: "That code is not correct." }, { status: 401 });
    }

    try {
      const token = await new SignJWT({
        email,
        name: (body.name || "").trim(),
        role: "Devotee",
        orgCode: ORG_CODE,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(getJwtSecret());

      return NextResponse.json({ success: true, token, user: { email } });
    } catch (err) {
      console.error("Token signing failed:", err);
      return NextResponse.json({ error: "Could not complete sign-in." }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: "action must be 'send' or 'verify'" },
    { status: 400 },
  );
}

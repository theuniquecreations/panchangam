// FaceID / Touch ID sign-in via WebAuthn platform authenticators.
//
// SECURITY NOTE — read before extending this.
// There is no server-side WebAuthn verification yet, so this is *device-local*
// trust: after a user proves ownership of their email via OTP, they may bind a
// platform credential on this device. A later biometric unlock proves the same
// person holds the same device, and we restore the email they already verified.
// It is a convenience layer over a completed OTP login, never a replacement for
// one, and it cannot be used to log in as an email that has not been verified
// on this device.
//
// When the backend gains a WebAuthn endpoint, the challenge must be issued and
// the assertion signature verified server-side; the shape below already matches
// that flow so only the challenge/verify calls need swapping in.

"use client";

import secureLocalStorage from "react-secure-storage";
import { BIOMETRIC_KEY } from "./config";

const isClient = () => typeof window !== "undefined";

type BiometricRecord = {
  email: string;
  credentialId: string; // base64url
  enabledAt: string;
};

const toBase64Url = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// Backed by an explicit ArrayBuffer: WebAuthn's BufferSource will not accept a
// view over the wider ArrayBufferLike that Uint8Array.from infers.
const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const view = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return view;
};

/** True when this browser exposes a built-in authenticator (FaceID, Touch ID,
 * Windows Hello). Requires a secure context — https, or localhost in dev. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isClient() || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getBiometricRecord(): BiometricRecord | null {
  if (!isClient()) return null;
  try {
    const stored = secureLocalStorage.getItem(BIOMETRIC_KEY);
    if (!stored) return null;
    return typeof stored === "string"
      ? (JSON.parse(stored) as BiometricRecord)
      : (stored as BiometricRecord);
  } catch {
    return null;
  }
}

/** Whether this device already has biometric sign-in bound to an email. */
export const isBiometricEnabled = (): boolean => getBiometricRecord() !== null;

/** Binds a platform credential to an already-verified email. Call this only
 * after the user has completed an OTP login. */
export async function enableBiometric(email: string): Promise<void> {
  if (!(await isBiometricAvailable())) {
    throw new Error("This device does not offer FaceID or Touch ID.");
  }

  // Random challenge. Once the backend verifies assertions this must come from
  // the server instead, or the ceremony proves nothing to it.
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Panchangam", id: window.location.hostname },
      user: { id: userId, name: email, displayName: email },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Could not register this device.");

  const record: BiometricRecord = {
    email: email.trim().toLowerCase(),
    credentialId: toBase64Url(credential.rawId),
    enabledAt: new Date().toISOString(),
  };

  secureLocalStorage.setItem(BIOMETRIC_KEY, JSON.stringify(record));
}

/** Prompts for FaceID / Touch ID and, on success, returns the bound email.
 * Returns null when nothing is bound on this device. */
export async function signInWithBiometric(): Promise<string | null> {
  const record = getBiometricRecord();
  if (!record) return null;

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          type: "public-key",
          id: fromBase64Url(record.credentialId),
        },
      ],
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  // A null assertion means the ceremony was dismissed; a throw means it failed.
  // Either way the caller must not be signed in.
  if (!assertion) return null;

  return record.email;
}

export function disableBiometric(): void {
  if (!isClient()) return;
  try {
    secureLocalStorage.removeItem(BIOMETRIC_KEY);
  } catch {
    /* ignore */
  }
}

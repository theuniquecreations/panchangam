// Central configuration for the Panchangam app.
// Every environment-specific or tunable value lives here — nothing else in the
// app should hardcode a URL, key name, price or colour.

/* ------------------------------------------------------------------ *
 * Backend services
 *
 * Read from the environment with NO fallbacks — an unset variable resolves to
 * "" rather than a hardcoded endpoint, so no infrastructure address lives in
 * the repository and a misconfigured deploy cannot quietly talk to the wrong
 * backend. `requireConfig` below turns a missing value into a clear error at
 * the point of use instead of a malformed URL.
 *
 * Set them in .env.local locally and in the Amplify environment variables per
 * branch; see .env.example.
 *
 * SERVICE_URL, SEND_EMAIL_URL and ORG_CODE are mapped to the browser in
 * next.config.ts — Next only exposes NEXT_PUBLIC_* automatically, and client
 * code reads these. JWT_SECRET is deliberately absent from this file: it is a
 * secret, and anything imported here can end up in the client bundle. It is
 * read directly inside the OTP route handler instead.
 * ------------------------------------------------------------------ */

/** Trims and strips stray quotes, so `KEY = "value"` in a .env file resolves
 * the same as `KEY=value`. Returns "" when unset. */
const fromEnv = (value: string | undefined): string =>
  (value ?? "").trim().replace(/^["']|["']$/g, "");

// Generic item service. Routes are {SERVICE_URL}/{ORG_CODE}/<route>, e.g.
//   GET  {SERVICE_URL}/{ORG_CODE}/itemsbytype/user-panchangam
//   POST {SERVICE_URL}/{ORG_CODE}/items
export const SERVICE_URL = fromEnv(process.env.SERVICE_URL);

// OTP / transactional email service.
export const SEND_EMAIL_URL = fromEnv(process.env.SEND_EMAIL_URL);

// Which organisation the item rows belong to. Panchangam rows stay separable
// whatever this is set to, because every payload is stamped
// `type: user-panchangam`, so itemsbytype never mixes them with other data.
export const ORG_CODE = fromEnv(process.env.ORG_CODE);

/** Throws a named, actionable error when a required variable is missing, so a
 * misconfigured environment reports itself instead of producing requests to
 * URLs like "/sbht/items" or "undefined/sendemail". */
export function requireConfig(name: string, value: string): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local (see .env.example), or to the Amplify environment variables for this branch.`,
    );
  }
  return value;
}

// Guards profile calls so the UI can explain itself rather than surfacing raw
// backend errors. Set false if the org above stops resolving.
export const BACKEND_READY = true;

/* ------------------------------------------------------------------ *
 * Item types — every payload is stamped so rows filter cleanly via
 * itemsbytype/<type>.
 * ------------------------------------------------------------------ */

export const ITEM_TYPE_USER = "user-panchangam";

/* ------------------------------------------------------------------ *
 * Session / storage keys
 * ------------------------------------------------------------------ */

// Session lives in sessionStorage (cleared when the tab/webview closes) and is
// mirrored into encrypted storage so a returning user keeps their login.
export const SESSION_KEY = "panchangam_usersession";

// Per-email biometric credential handle for FaceID / Touch ID sign-in.
export const BIOMETRIC_KEY = "panchangam_biometric";

// Preferred calculation location. Plain localStorage — a city and its
// coordinates are not sensitive, and the tile needs it on first paint.
export const PLACE_KEY = "panchangam_place";

// Last profile this device saved. Writes are queued on the backend, so a read
// straight after a save can still return the previous row; this lets the app
// show what the user actually saved until the queue catches up.
export const PROFILE_CACHE_KEY = "panchangam_profile_cache";

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

// Accounts that may open /admin. Checked against the signed-in session email.
//
// NOTE: this is a UI-level gate only — it decides what the app shows, not what
// the backend permits. Any signed-in user's token can still call the item
// service directly. Real enforcement needs the role claim in the JWT checked
// server-side; the token already carries one.
export const ADMIN_EMAILS = [
  "vbalakumar.cse@gmail.com",
  "aroun.kesavaraj@gmail.com",
  "support@templehub.org",
];

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // OTP valid for 10 minutes
export const OTP_RESEND_COOLDOWN_S = 30;
export const FROM_EMAIL = "Panchangam <support@templehub.org>";

/* ------------------------------------------------------------------ *
 * Subscription — 1 week free trial, then $12/year.
 * Billing itself is handled by the native layer (RN in-app purchase) or a
 * future web checkout; the web app only tracks and gates on entitlement.
 * ------------------------------------------------------------------ */

export const TRIAL_DAYS = 7;
export const SUBSCRIPTION_PRICE_USD = 9.99;
export const SUBSCRIPTION_PERIOD = "year";
export const SUBSCRIPTION_PRODUCT_ID = "panchangamappyearly";
export const SUBSCRIPTION_LABEL = `$${SUBSCRIPTION_PRICE_USD}/${SUBSCRIPTION_PERIOD}`;

/* ------------------------------------------------------------------ *
 * Panchangam defaults
 * ------------------------------------------------------------------ */

// Fallback location used before the visitor shares theirs — Ujjain, the
// traditional reference meridian for Indian almanacs.
export const DEFAULT_LOCATION = {
  label: "Ujjain, India",
  latitude: 23.1765,
  longitude: 75.7885,
  timeZone: "Asia/Kolkata",
};

// Reverse geocoding for the "use my location" label. Keyless public endpoint.
export const REVERSE_GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

/* ------------------------------------------------------------------ *
 * Branding
 * ------------------------------------------------------------------ */

export const BRAND_TITLE = "Panchangam";
export const BRAND_TAGLINE = "Your daily Vedic almanac";
export const THEME_PRIMARY = "#541001"; // deep maroon
export const THEME_ACCENT = "#FFD86D"; // gold

// Central configuration for the Panchangam app.
// Every environment-specific or tunable value lives here — nothing else in the
// app should hardcode a URL, key name, price or colour.

/* ------------------------------------------------------------------ *
 * Backend services
 * ------------------------------------------------------------------ */

// Generic item service. Routes are {SERVICE_URL}/{ORG_CODE}/<route>, e.g.
//   GET  {SERVICE_URL}/{ORG_CODE}/itemsbytype/user-panchangam
//   POST {SERVICE_URL}/{ORG_CODE}/items
export const SERVICE_URL = "https://z7z4g52p2g.execute-api.ap-south-1.amazonaws.com";

// OTP / transactional email service.
export const SEND_EMAIL_URL = "https://yzcjrbt1x1.execute-api.us-east-1.amazonaws.com/";

// Borrowed from the temple app for now: "sbht" is an active organisation, while
// "panchangam" answers `400 No active organisation found`. Panchangam rows are
// still isolated because every payload is stamped `type: user-panchangam`, so
// itemsbytype never mixes them with temple data.
// TODO(backend): switch to a dedicated "panchangam" org once it is provisioned.
export const ORG_CODE = "sbht";

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

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

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

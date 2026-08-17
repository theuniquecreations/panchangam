import type { NextConfig } from "next";

// Next only exposes NEXT_PUBLIC_*-prefixed variables to the browser. The three
// values below are read by client code (the API client and the session layer),
// so they are mapped here — the `env` key inlines them into the client bundle
// at build time, which lets .env.local keep the plain names.
//
// NEVER add JWT_SECRET (or any other secret) to this map: everything listed
// here is compiled into JavaScript the browser downloads. JWT_SECRET is read
// only inside the route handler, where it stays server-side.
//
// Values must be strings; an undefined entry would inline as the literal
// "undefined", so each falls back to an empty string and config.ts supplies the
// real default.
const nextConfig: NextConfig = {
  env: {
    SERVICE_URL: process.env.SERVICE_URL ?? "",
    SEND_EMAIL_URL: process.env.SEND_EMAIL_URL ?? "",
    ORG_CODE: process.env.ORG_CODE ?? "",
  },
};

export default nextConfig;

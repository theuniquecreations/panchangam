// Server-side email sending. Never import this from a client component — it is
// the only place the upstream email service is called directly.
//
// The service returns no Access-Control-Allow-Origin header, so a browser call
// is blocked by CORS. Everything goes through a route handler instead.

import "server-only";
import { SEND_EMAIL_URL, FROM_EMAIL, requireConfig } from "@/lib/config";

export async function sendEmailServer(
  recipient: string,
  subject: string,
  body: string,
): Promise<void> {
  // No fallback URL, so an unset variable must report itself rather than
  // posting to "undefined/sendemail".
  const url = requireConfig("SEND_EMAIL_URL", SEND_EMAIL_URL);
  const base = url.endsWith("/") ? url : `${url}/`;

  const res = await fetch(`${base}sendemail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `cc` and `attachments` are omitted rather than sent empty: SES treats an
    // empty cc as an address and fails with
    // "InvalidParameterValue … Invalid email address .".
    body: JSON.stringify({ sender: FROM_EMAIL, recipient, subject, body }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Email service returned ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
    );
  }
}

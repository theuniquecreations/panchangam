// Server-side proxy for the transactional email service.
//
// The email API (yzcjrbt1x1…) returns no Access-Control-Allow-Origin header, so
// a browser call is blocked by CORS no matter which path it targets — that is
// the "Failed to fetch" seen on the login page. Server-to-server calls are not
// subject to CORS, so the page posts here and this route forwards it.
//
// The route deliberately does NOT pass the client's payload through verbatim:
// an open relay would let anyone send mail from our domain. The sender is
// pinned server-side and the rest is validated and length-capped.

import { SEND_EMAIL_URL, FROM_EMAIL } from "@/lib/config";

const MAX_SUBJECT = 200;
const MAX_BODY = 20_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let payload: { recipient?: string; subject?: string; body?: string };

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipient = (payload.recipient || "").trim().toLowerCase();
  const subject = (payload.subject || "").slice(0, MAX_SUBJECT);
  const body = (payload.body || "").slice(0, MAX_BODY);

  // Exactly one well-formed address — no comma-separated lists, which would
  // turn this into a bulk sender.
  if (!EMAIL_RE.test(recipient)) {
    return Response.json({ error: "A valid recipient is required" }, { status: 400 });
  }
  if (!subject || !body) {
    return Response.json({ error: "Subject and body are required" }, { status: 400 });
  }

  const base = SEND_EMAIL_URL.endsWith("/") ? SEND_EMAIL_URL : `${SEND_EMAIL_URL}/`;

  try {
    const upstream = await fetch(`${base}sendemail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `cc` and `attachments` are omitted rather than sent empty: SES treats
      // an empty cc as an address and fails the whole send with
      // "InvalidParameterValue … Invalid email address .".
      body: JSON.stringify({
        // Pinned here, never taken from the client.
        sender: FROM_EMAIL,
        recipient,
        subject,
        body,
      }),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error("Email service rejected the request:", upstream.status, text);
      return Response.json(
        { error: `Email service returned ${upstream.status}`, detail: text.slice(0, 300) },
        { status: 502 },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Could not reach the email service:", err);
    return Response.json({ error: "Could not reach the email service" }, { status: 502 });
  }
}

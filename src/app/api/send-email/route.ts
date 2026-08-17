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

import { sendEmailServer } from "@/lib/server/email";

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

  try {
    // Shared with the OTP route: it pins the sender, omits the empty cc that
    // SES rejects, and reports a missing SEND_EMAIL_URL clearly.
    await sendEmailServer(recipient, subject, body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Could not reach the email service:", err);
    return Response.json({ error: "Could not reach the email service" }, { status: 502 });
  }
}

import "server-only";

/**
 * Sends a plain-text email through the Resend HTTP API (no SDK, no dependency).
 * Without RESEND_API_KEY it only logs the message, so local development works without an account;
 * in production a missing key is an error, never a silent drop.
 */
export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set");
    }
    console.log(`[email, not sent] to ${message.to}\n${message.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "TaskFlow <onboarding@resend.dev>",
      ...message,
    }),
  });
  if (!res.ok) throw new Error(`Email provider answered ${res.status}`);
}

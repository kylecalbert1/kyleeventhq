import { createHmac, timingSafeEqual } from "crypto";
import { publicSiteUrl } from "@/lib/unsubscribe.server";

/**
 * Signed click-to-confirm tokens for the "Confirm speaking date" email.
 * Same pattern as the unsubscribe links: no login, but a token can only ever
 * confirm the exact speaker + event it was minted for.
 */

function secret() {
  const s =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_DB_URL ||
    process.env.LOVABLE_API_KEY;
  if (!s) throw new Error("No server secret available for confirmation tokens");
  return s;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function attendanceToken(speakerId: string, eventId: string) {
  const payload = `${speakerId}:${eventId}`;
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest()).slice(0, 24);
  return `${b64url(Buffer.from(payload, "utf-8"))}.${sig}`;
}

export function verifyAttendanceToken(
  token: string,
): { speakerId: string; eventId: string } | null {
  const [encoded, sig] = (token ?? "").split(".");
  if (!encoded || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf-8",
    );
  } catch {
    return null;
  }
  const [speakerId, eventId] = payload.split(":");
  if (!speakerId || !eventId) return null;
  const expected = attendanceToken(speakerId, eventId).split(".")[1]!;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { speakerId, eventId };
}

export function attendanceConfirmUrl(speakerId: string, eventId: string) {
  return `${publicSiteUrl()}/api/public/confirm-attendance?t=${encodeURIComponent(
    attendanceToken(speakerId, eventId),
  )}`;
}

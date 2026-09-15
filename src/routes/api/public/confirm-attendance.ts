import { createFileRoute } from "@tanstack/react-router";
import { verifyAttendanceToken } from "@/lib/attendance-token.server";

/** Branded confirmation page, matching the email wrapper's visual language. */
function page(title: string, message: string, status = 200) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#f5f4f1;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:620px;margin:12vh auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden">
<div style="background:#6d28d9;color:#ffffff;padding:14px 24px;font:700 14px/1.4 Arial,Helvetica,sans-serif">Event Ops</div>
<div style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px">${title}</h1>
<p style="margin:0;font-size:15px;line-height:1.65;color:#44403c">${message}</p>
</div></div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/confirm-attendance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = verifyAttendanceToken(url.searchParams.get("t") ?? "");
        if (!parsed) {
          return page(
            "Link not recognised",
            "This confirmation link is invalid or incomplete. Please reply to the email you received and we'll confirm you manually.",
            400,
          );
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: speaker } = await supabaseAdmin
            .from("speakers")
            .select("id, name, attendance_confirmed_at")
            .eq("id", parsed.speakerId)
            .eq("event_id", parsed.eventId)
            .maybeSingle();
          if (!speaker) {
            return page(
              "Link not recognised",
              "We couldn't find this booking. Please reply to the email you received and we'll confirm you manually.",
              404,
            );
          }
          const { data: event } = await supabaseAdmin
            .from("events")
            .select("name, event_date")
            .eq("id", parsed.eventId)
            .maybeSingle();

          if (!speaker.attendance_confirmed_at) {
            const now = new Date().toISOString();
            const { error } = await supabaseAdmin
              .from("speakers")
              .update({ attendance_confirmed_at: now, status: "confirmed" })
              .eq("id", parsed.speakerId);
            if (error) throw new Error(error.message);
          }

          const eventName = event?.name ?? "the event";
          return page(
            "You're confirmed, thanks!",
            `Thanks${speaker.name ? ` ${speaker.name.split(/\s+/)[0]}` : ""} — we've noted that you're still speaking at <strong>${eventName}</strong>. We'll send your exact session time closer to the date.`,
          );
        } catch (e) {
          console.error("Attendance confirmation failed:", e);
          return page(
            "Something went wrong",
            "We couldn't record that right now. Please reply to the email and we'll confirm you manually.",
            500,
          );
        }
      },
    },
  },
});

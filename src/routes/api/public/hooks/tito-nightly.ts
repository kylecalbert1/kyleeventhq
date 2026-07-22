import { createFileRoute } from "@tanstack/react-router";

// Nightly full Tito reconcile. Re-syncs releases + tickets for every mapped
// event, catching anything the webhook missed.
//
// Called by pg_cron at 03:00 UTC with header:
//   apikey: <SUPABASE_PUBLISHABLE_KEY>

export const Route = createFileRoute("/api/public/hooks/tito-nightly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const token = process.env.TITO_API_TOKEN;
        if (!token) {
          return Response.json(
            { ok: false, error: "TITO_API_TOKEN not set" },
            { status: 500 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncSingleEventBySlug } = await import("@/lib/tito.functions");

        const { data: events, error } = await supabaseAdmin
          .from("events")
          .select("id, tito_slug")
          .not("tito_slug", "is", null);

        if (error) {
          await stampHealth(supabaseAdmin, "tito_full", false, error.message);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: Array<{ slug: string; ok: boolean; error?: string }> = [];
        for (const e of events ?? []) {
          const slug = (e as any).tito_slug as string;
          if (!slug) continue;
          try {
            await syncSingleEventBySlug(supabaseAdmin as any, token, slug);
            results.push({ slug, ok: true });
          } catch (err: any) {
            console.error("[tito-nightly] failed", slug, err);
            results.push({ slug, ok: false, error: err?.message ?? String(err) });
          }
        }

        const failures = results.filter((r) => !r.ok);
        await stampHealth(
          supabaseAdmin,
          "tito_full",
          failures.length === 0,
          `${results.length - failures.length}/${results.length} ok` +
            (failures.length ? ` — first fail: ${failures[0].slug}: ${failures[0].error}` : ""),
        );

        return Response.json({ ok: true, results });
      },
    },
  },
});

async function stampHealth(
  admin: any,
  kind: string,
  ok: boolean,
  note: string,
) {
  await admin.from("sync_health").upsert(
    { kind, last_run_at: new Date().toISOString(), ok, note, updated_at: new Date().toISOString() },
    { onConflict: "kind" },
  );
}

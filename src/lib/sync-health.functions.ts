import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Read the sync_health table + a few adjacent freshness signals for the
// Settings page. Also exposes "Run now" wrappers for manual reconciliation
// and a boolean map showing which integration secrets are configured
// (values are never returned).

export const getSyncHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [health, tito] = await Promise.all([
      context.supabase.from("sync_health").select("kind, last_run_at, ok, note"),
      context.supabase
        .from("tito_events")
        .select("last_webhook_at")
        .not("last_webhook_at", "is", null)
        .order("last_webhook_at", { ascending: false })
        .limit(1),
    ]);

    const rows = (health.data ?? []) as Array<{
      kind: string;
      last_run_at: string;
      ok: boolean;
      note: string | null;
    }>;
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    const lastWebhookAt = (tito.data ?? [])[0]?.last_webhook_at ?? null;

    const secrets = {
      TITO_API_TOKEN: !!process.env.TITO_API_TOKEN,
      TITO_WEBHOOK_SECRET: !!process.env.TITO_WEBHOOK_SECRET,
      ASANA_PAT: !!process.env.ASANA_PAT,
      GOLDCAST_API_TOKEN: !!process.env.GOLDCAST_API_TOKEN,
    };

    return {
      health: byKind,
      lastWebhookAt,
      secrets,
    };
  });

export const runTitoNightlyNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = process.env.TITO_API_TOKEN;
    if (!token) throw new Error("TITO_API_TOKEN not set");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncSingleEventBySlug } = await import("@/lib/tito.functions");

    const { data: events } = await supabaseAdmin
      .from("events")
      .select("tito_slug")
      .not("tito_slug", "is", null);

    let ok = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (const e of events ?? []) {
      const slug = (e as any).tito_slug as string;
      try {
        await syncSingleEventBySlug(supabaseAdmin as any, token, slug);
        ok++;
      } catch (err: any) {
        failed++;
        if (!firstError) firstError = `${slug}: ${err?.message ?? err}`;
      }
    }
    const note = `${ok}/${ok + failed} ok${firstError ? ` — ${firstError}` : ""}`;
    await supabaseAdmin.from("sync_health").upsert(
      { kind: "tito_full", last_run_at: new Date().toISOString(), ok: failed === 0, note, updated_at: new Date().toISOString() },
      { onConflict: "kind" },
    );
    return { ok, failed, note };
  });

export const runAsanaNightlyNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const pat = process.env.ASANA_PAT;
    if (!pat) throw new Error("ASANA_PAT not set. Add it in Project Settings → Secrets.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runAsanaSync } = await import("@/routes/api/public/hooks/asana-nightly");
    const res = await runAsanaSync(supabaseAdmin, pat);
    const note = `${res.updated} events updated, ${res.checked} checked, ${res.failures} failed`;
    await supabaseAdmin.from("sync_health").upsert(
      { kind: "asana", last_run_at: new Date().toISOString(), ok: res.failures === 0, note, updated_at: new Date().toISOString() },
      { onConflict: "kind" },
    );
    return { ...res, note };
  });

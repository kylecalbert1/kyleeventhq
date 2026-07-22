import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Settings as SettingsIcon,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  getSyncHealth,
  runTitoNightlyNow,
  runAsanaNightlyNow,
} from "@/lib/sync-health.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings · Event Command Centre" },
      {
        name: "description",
        content:
          "Sync health, webhook configuration, and integration secret status for Tito, Asana, and Goldcast.",
      },
    ],
  }),
});

const WEBHOOK_URL =
  "https://project--1b69743f-dcda-484f-a3af-afd5b0f775a7.lovable.app/api/public/hooks/tito-webhook";

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["sync-health"],
    queryFn: () => getSyncHealth(),
    refetchInterval: 30_000,
  });

  const runTito = useMutation({
    mutationFn: () => runTitoNightlyNow(),
    onSuccess: (r) => {
      toast.success(`Tito full reconcile: ${r.note}`);
      qc.invalidateQueries({ queryKey: ["sync-health"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const runAsana = useMutation({
    mutationFn: () => runAsanaNightlyNow(),
    onSuccess: (r) => {
      toast.success(`Asana sync: ${r.note}`);
      qc.invalidateQueries({ queryKey: ["sync-health"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const [copied, setCopied] = useState(false);
  function copyWebhook() {
    navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const health = q.data?.health ?? {};
  const lastWebhookAt = q.data?.lastWebhookAt ?? null;
  const secrets = q.data?.secrets ?? {
    TITO_API_TOKEN: false,
    TITO_WEBHOOK_SECRET: false,
    ASANA_CONNECTED: false,
    GOLDCAST_API_TOKEN: false,
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <div className="accent-bar mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sync health and integration configuration. Background jobs run without
          anyone's laptop being open.
        </p>
      </div>

      {/* Sync health */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-4">Sync health</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <HealthTile
            label="Tito webhook"
            hint="Live events from Tito. No manual run — verify Tito is posting to the URL below."
            lastAt={lastWebhookAt}
          />
          <HealthTile
            label="Tito full reconcile"
            hint="Nightly at 03:00 UTC. Catches anything the webhook missed."
            lastAt={health.tito_full?.last_run_at ?? null}
            ok={health.tito_full?.ok ?? undefined}
            note={health.tito_full?.note ?? undefined}
            onRun={() => runTito.mutate()}
            running={runTito.isPending}
          />
          <HealthTile
            label="Asana milestones"
            hint={
              secrets.ASANA_CONNECTED
                ? "Connected via Kyle's Asana. Nightly at 07:00 UTC — updates kickoff & launch dates from each event's Asana project."
                : "Not connected. Link the Asana connector in workspace Connectors."
            }
            lastAt={health.asana?.last_run_at ?? null}
            ok={health.asana?.ok ?? undefined}
            note={health.asana?.note ?? undefined}
            onRun={() => runAsana.mutate()}
            running={runAsana.isPending}
            extraAction={
              <Button
                size="sm"
                variant="outline"
                onClick={() => testAsana.mutate()}
                disabled={testAsana.isPending || !secrets.ASANA_CONNECTED}
              >
                <ShieldCheck className={`h-3.5 w-3.5 mr-1 ${testAsana.isPending ? "animate-pulse" : ""}`} />
                Test connection
              </Button>
            }
          />
          <HealthTile
            label="Goldcast"
            hint="Not yet scheduled."
            lastAt={health.goldcast?.last_run_at ?? null}
            ok={health.goldcast?.ok ?? undefined}
            note={health.goldcast?.note ?? undefined}
          />
        </div>
      </Card>

      {/* Tito webhook */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" /> Tito webhook
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Paste this URL into Tito → Settings → Webhooks, and subscribe to
          <code className="mx-1 px-1 rounded bg-slate-100">ticket.created</code>,
          <code className="mx-1 px-1 rounded bg-slate-100">ticket.updated</code>,
          <code className="mx-1 px-1 rounded bg-slate-100">ticket.completed</code>, and
          <code className="mx-1 px-1 rounded bg-slate-100">registration.finished</code>.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate text-xs bg-slate-50 border border-slate-200 rounded px-3 py-2 font-mono">
            {WEBHOOK_URL}
          </code>
          <Button size="sm" variant="outline" onClick={copyWebhook}>
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Optional: set a signing secret in Tito, then store the exact same
          value in Project Settings → Secrets as
          <code className="mx-1 px-1 rounded bg-slate-100">TITO_WEBHOOK_SECRET</code>.
          Once set, only signed requests are accepted.
        </p>
        <div className="mt-3 text-xs text-muted-foreground">
          Last webhook received:{" "}
          <span className="font-medium text-foreground">
            {lastWebhookAt ? formatRelative(lastWebhookAt) : "never"}
          </span>
        </div>
      </Card>

      {/* Secrets status */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-1">Integration secrets</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Managed in Project Settings → Secrets. Values are never shown here — only
          whether they exist.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <SecretRow name="TITO_API_TOKEN" present={secrets.TITO_API_TOKEN} required />
          <SecretRow
            name="TITO_WEBHOOK_SECRET"
            present={secrets.TITO_WEBHOOK_SECRET}
            required={false}
            hint="Optional but recommended"
          />
          <SecretRow
            name="Asana connector"
            present={secrets.ASANA_CONNECTED}
            required
            hint="Managed via workspace Connectors → Kyle's Asana. No secret needed here."
          />
          <SecretRow
            name="GOLDCAST_API_TOKEN"
            present={secrets.GOLDCAST_API_TOKEN}
            required={false}
          />
        </div>
      </Card>
    </div>
  );
}

function HealthTile({
  label,
  hint,
  lastAt,
  ok,
  note,
  onRun,
  running,
}: {
  label: string;
  hint: string;
  lastAt: string | null;
  ok?: boolean;
  note?: string;
  onRun?: () => void;
  running?: boolean;
}) {
  const tone = staleness(lastAt, ok);
  const wrap = {
    green: "bg-emerald-50 ring-emerald-200",
    amber: "bg-amber-50 ring-amber-200",
    red: "bg-rose-50 ring-rose-200",
    grey: "bg-slate-50 ring-slate-200",
  }[tone];
  const dotClass = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-rose-500",
    grey: "bg-slate-400",
  }[tone];
  return (
    <div className={`rounded-xl ring-1 p-4 ${wrap}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
            <div className="text-sm font-semibold text-slate-900">{label}</div>
          </div>
          <div className="mt-1 text-xs text-slate-600">{hint}</div>
          <div className="mt-2 text-xs text-slate-700">
            Last run:{" "}
            <span className="font-medium">
              {lastAt ? formatRelative(lastAt) : "never"}
            </span>
          </div>
          {note && <div className="mt-1 text-[11px] text-slate-500 truncate">{note}</div>}
        </div>
        {onRun && (
          <Button size="sm" variant="outline" onClick={onRun} disabled={running}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${running ? "animate-spin" : ""}`} />
            Run now
          </Button>
        )}
      </div>
    </div>
  );
}

function SecretRow({
  name,
  present,
  required,
  hint,
}: {
  name: string;
  present: boolean;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs font-mono font-medium">{name}</div>
        {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
      </div>
      {present ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
          <ShieldCheck className="h-3.5 w-3.5" /> Set
        </span>
      ) : (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            required ? "text-rose-700" : "text-slate-500"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          {required ? "Missing" : "Not set"}
        </span>
      )}
    </div>
  );
}

function staleness(iso: string | null, ok?: boolean): "green" | "amber" | "red" | "grey" {
  if (!iso) return "grey";
  if (ok === false) return "red";
  const ageH = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageH > 48) return "red";
  if (ageH > 24) return "amber";
  return "green";
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// Static export for the dashboard banner to consume without duplicating logic.
export const _staleness = staleness;

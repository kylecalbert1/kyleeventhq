import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bold,
  Italic,
  Link2,
  Loader2,
  RotateCcw,
  Send,
  Eye,
  X,
  Users2,
  AtSign,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  speakersQuery,
  emailTemplatesQuery,
  eventTitoLinksQuery,
  eventQuery,
  pastSpeakersQuery,
} from "@/lib/queries";
import { sendGmailEmail } from "@/lib/email.functions";
import { logEmailSend } from "@/lib/email-sends.functions";
import { SendHistoryPanel } from "@/components/SendHistoryPanel";

// ---------- Recipient shape ----------
type Recipient = {
  email: string;
  name: string;
  first_name: string;
  company: string | null;
  job_title: string | null;
  session_title: string | null;
  speaker_id: string | null;
  release_title: string | null; // Tito pass title (Speaker Pass, Guest…)
  past_event_name: string | null;
};

type AudienceMode = "group" | "paste";
type GroupKey =
  | "prospective"
  | "current_confirmed"
  | "past_speakers"
  | "confirmed_not_registered";

function firstName(full: string): string {
  const p = (full ?? "").trim().split(/\s+/)[0] ?? "";
  return p;
}

// ---------- Placeholder resolution ----------
type Ctx = {
  eventName: string;
  eventDate: string;
  venue: string;
  speakerPassLink: string;
  guestPassLink: string;
};
function resolvePlaceholders(text: string, r: Recipient, ctx: Ctx): string {
  const map: Record<string, string> = {
    first_name: r.first_name || "there",
    company: r.company ?? "",
    job_title: r.job_title ?? "",
    event_name: ctx.eventName,
    event_date: ctx.eventDate,
    venue: ctx.venue,
    session_title: r.session_title ?? "",
    speaker_pass_link: ctx.speakerPassLink,
    guest_pass_link: ctx.guestPassLink,
    past_event_name: r.past_event_name ?? "",
  };
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => map[k.toLowerCase()] ?? `{{${k}}}`);
}

// Convert lightweight HTML from the rich-text editor to plain text with links
// preserved as "text (url)". Kept intentionally small: Gmail send API here
// still transmits text/plain, so we normalise before sending.
function htmlToPlain(html: string): string {
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li)>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "- ");
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**");
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "_$2_");
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)");
  s = s.replace(/<[^>]+>/g, "");
  // decode a handful of common entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

const PLACEHOLDERS: Array<{ key: string; label: string }> = [
  { key: "first_name", label: "First name" },
  { key: "company", label: "Company" },
  { key: "job_title", label: "Job title" },
  { key: "event_name", label: "Event name" },
  { key: "event_date", label: "Event date" },
  { key: "venue", label: "Venue" },
  { key: "session_title", label: "Session title" },
  { key: "speaker_pass_link", label: "Speaker pass link" },
  { key: "guest_pass_link", label: "Guest pass link" },
  { key: "past_event_name", label: "Past event name" },
];

// ==================================================================
export function SendMessageDialog({
  open,
  onOpenChange,
  eventId,
  seedRecipientEmails,
  seedGroup,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  /** When opened from a section-level button, pre-select recipients. */
  seedRecipientEmails?: string[];
  seedGroup?: GroupKey;
}) {
  const evQ = useQuery(eventQuery(eventId));
  const speakersQ = useQuery(speakersQuery(eventId));
  const templatesQ = useQuery(emailTemplatesQuery);
  const titoLinksQ = useQuery(eventTitoLinksQuery(eventId));
  const pastQ = useQuery(pastSpeakersQuery(false));

  const [audienceMode, setAudienceMode] = useState<AudienceMode>("group");
  const [group, setGroup] = useState<GroupKey>(seedGroup ?? "current_confirmed");
  const [pasteText, setPasteText] = useState("");
  const [passFilter, setPassFilter] = useState<string>("__all"); // "__all" or a release title
  const [manualDeselect, setManualDeselect] = useState<Set<string>>(new Set());

  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyHtml, setBodyHtml] = useState<string>("");
  const [originalSubject, setOriginalSubject] = useState<string>("");
  const [originalBody, setOriginalBody] = useState<string>("");

  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const sendEmail = useServerFn(sendGmailEmail);
  const logSend = useServerFn(logEmailSend);
  const qc = useQueryClient();

  // Reset on open
  useEffect(() => {
    if (open) {
      setAudienceMode(seedRecipientEmails && seedRecipientEmails.length ? "paste" : "group");
      if (seedRecipientEmails && seedRecipientEmails.length) {
        setPasteText(seedRecipientEmails.join(", "));
      } else {
        setPasteText("");
      }
      setGroup(seedGroup ?? "current_confirmed");
      setPassFilter("__all");
      setManualDeselect(new Set());
      setShowPreview(false);
      setSendError(null);
      setSendProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---------- Build candidate recipients ----------
  const speakers = speakersQ.data ?? [];
  const past = pastQ.data ?? [];
  const eventName = evQ.data ? `${evQ.data.code} — ${evQ.data.name}` : "";
  const eventDate = evQ.data?.event_date
    ? new Date(evQ.data.event_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const venue = evQ.data?.venue ?? "";
  const speakerPassLink = titoLinksQ.data?.speaker_pass_url ?? "";
  const guestPassLink = titoLinksQ.data?.guest_pass_url ?? "";

  const speakerRecipients = useMemo<Recipient[]>(() => {
    return speakers
      .filter((s) => !!s.email)
      .map((s) => ({
        email: s.email!.toLowerCase(),
        name: s.name,
        first_name: firstName(s.name),
        company: s.company ?? null,
        job_title: s.title ?? null,
        session_title: s.session_title ?? null,
        speaker_id: s.id,
        release_title: null,
        past_event_name: null,
      }));
  }, [speakers]);

  const pastRecipients = useMemo<Recipient[]>(() => {
    return past
      .filter((p) => p.is_past_speaker && p.email)
      .map((p) => {
        const speakerRel = p.appearances.find((a) => a.is_speaker_role)?.release_title ?? null;
        return {
          email: p.email.toLowerCase(),
          name: p.name,
          first_name: firstName(p.name),
          company: p.company ?? null,
          job_title: p.job_title ?? null,
          session_title: null,
          speaker_id: null,
          release_title: speakerRel,
          past_event_name: p.most_recent_past_speaker_event ?? null,
        };
      });
  }, [past]);

  // Group audience
  const groupRecipients = useMemo<Recipient[]>(() => {
    if (group === "past_speakers") return pastRecipients;
    if (group === "prospective") {
      return speakerRecipients.filter((r) => {
        const s = speakers.find((x) => x.id === r.speaker_id)!;
        return s.status === "new" || s.status === "contacted" || s.status === "responded";
      });
    }
    if (group === "current_confirmed") {
      return speakerRecipients.filter((r) => {
        const s = speakers.find((x) => x.id === r.speaker_id)!;
        return s.status === "confirmed";
      });
    }
    // confirmed_not_registered: confirmed speakers whose email is NOT in tito tickets for this event
    // We can't tell here without a dedicated query, so approximate via speakers with source != 'directory'/'tito'
    // and rely on reconciliation panel for the authoritative view; still useful as a message audience.
    return speakerRecipients.filter((r) => {
      const s = speakers.find((x) => x.id === r.speaker_id)!;
      return s.status === "confirmed" && (s.source ?? "") !== "tito";
    });
  }, [group, speakerRecipients, pastRecipients, speakers]);

  const pasteRecipients = useMemo<Recipient[]>(() => {
    const set = new Set<string>();
    const emails = pasteText
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /.+@.+\..+/.test(s));
    for (const e of emails) set.add(e);
    return Array.from(set).map((email) => {
      // Try to enrich from known speakers/past first
      const s = speakerRecipients.find((x) => x.email === email);
      if (s) return s;
      const p = pastRecipients.find((x) => x.email === email);
      if (p) return p;
      return {
        email,
        name: email,
        first_name: firstName(email.split("@")[0].replace(/[._-]+/g, " ")),
        company: null,
        job_title: null,
        session_title: null,
        speaker_id: null,
        release_title: null,
        past_event_name: null,
      };
    });
  }, [pasteText, speakerRecipients, pastRecipients]);

  const audienceRecipients = audienceMode === "group" ? groupRecipients : pasteRecipients;

  // Pass type counts (Tito release titles) for the "past speakers" audience mainly
  const passOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of audienceRecipients) {
      const k = r.release_title ?? "";
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [audienceRecipients]);

  const filteredRecipients = useMemo(() => {
    const passFiltered =
      passFilter === "__all"
        ? audienceRecipients
        : audienceRecipients.filter((r) => (r.release_title ?? "") === passFilter);
    return passFiltered.filter((r) => !manualDeselect.has(r.email));
  }, [audienceRecipients, passFilter, manualDeselect]);

  // ---------- Template loading ----------
  const templates = templatesQ.data ?? [];
  useEffect(() => {
    if (!templateId && templates.length) {
      // Pick a sensible default per group
      const seedByGroup: Partial<Record<GroupKey, string>> = {
        prospective: "future_event_invite",
        current_confirmed: "speaker_confirmation",
        past_speakers: "future_event_invite",
        confirmed_not_registered: "speaker_pass_reminder",
      };
      const preferred = templates.find((t) => t.slug === seedByGroup[group]);
      const first = preferred ?? templates[0];
      if (first) applyTemplate(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.length, group]);

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setSubject(t.subject);
    setBodyHtml(escapeToInitialHtml(t.body));
    setOriginalSubject(t.subject);
    setOriginalBody(t.body);
    // Push into contenteditable
    if (bodyRef.current) bodyRef.current.innerHTML = escapeToInitialHtml(t.body);
  }

  function reloadOriginal() {
    setSubject(originalSubject);
    setBodyHtml(escapeToInitialHtml(originalBody));
    if (bodyRef.current) bodyRef.current.innerHTML = escapeToInitialHtml(originalBody);
  }

  function insertPlaceholder(key: string) {
    if (!bodyRef.current) return;
    bodyRef.current.focus();
    document.execCommand("insertText", false, `{{${key}}}`);
    setBodyHtml(bodyRef.current.innerHTML);
  }
  function exec(cmd: "bold" | "italic") {
    if (!bodyRef.current) return;
    bodyRef.current.focus();
    document.execCommand(cmd);
    setBodyHtml(bodyRef.current.innerHTML);
  }
  function insertLink() {
    const url = window.prompt("Link URL");
    if (!url) return;
    bodyRef.current?.focus();
    document.execCommand("createLink", false, url);
    setBodyHtml(bodyRef.current?.innerHTML ?? "");
  }

  const total = filteredRecipients.length;
  const zeroWarn = total === 0;

  // ---------- Send ----------
  async function handleSend() {
    if (total === 0) return;
    setSending(true);
    setSendError(null);
    setSendProgress({ done: 0, total });
    const plainBody = htmlToPlain(bodyHtml);
    const ctx: Ctx = { eventName, eventDate, venue, speakerPassLink, guestPassLink };
    const successful: Array<{ email: string; name: string; speaker_id: string | null }> = [];
    try {
      for (let i = 0; i < filteredRecipients.length; i++) {
        const r = filteredRecipients[i];
        const s = resolvePlaceholders(subject, r, ctx);
        const b = resolvePlaceholders(plainBody, r, ctx);
        try {
          await sendEmail({ data: { to: r.email, subject: s, body: b } });
          successful.push({ email: r.email, name: r.name, speaker_id: r.speaker_id });
        } catch (err: any) {
          console.error("send failed", r.email, err);
          setSendError(`${r.email}: ${err?.message ?? "send failed"}`);
        }
        setSendProgress({ done: i + 1, total });
      }
      if (successful.length) {
        const tpl = templates.find((t) => t.id === templateId);
        await logSend({
          data: {
            event_id: eventId,
            template_type: (tpl?.slug ?? "custom") as any,
            subject,
            body: htmlToPlain(bodyHtml),
            recipients: successful.map((r) => ({
              speaker_id: r.speaker_id,
              email: r.email,
              name: r.name,
            })),
          },
        });
      }
      qc.invalidateQueries({ queryKey: ["emailSends"] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["contactHistory"] });
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  const groupLabels: Record<GroupKey, string> = {
    prospective: "Prospective speakers",
    current_confirmed: "Current confirmed",
    past_speakers: "Past speakers",
    confirmed_not_registered: "Confirmed but not registered in Tito",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Send message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Send history */}
          <SendHistoryPanel eventId={eventId} defaultOpen={false} title="Recent sends" />

          {/* Audience */}
          <section className="rounded-2xl border border-slate-200/70 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users2 className="h-4 w-4" /> Audience
            </div>
            <div className="flex gap-2">
              <ModeChip active={audienceMode === "group"} onClick={() => setAudienceMode("group")} icon={<Users2 className="h-3.5 w-3.5" />} label="Group filter" />
              <ModeChip active={audienceMode === "paste"} onClick={() => setAudienceMode("paste")} icon={<AtSign className="h-3.5 w-3.5" />} label="Type emails / test" />
            </div>
            {audienceMode === "group" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(groupLabels) as GroupKey[]).map((k) => {
                  const count =
                    k === "past_speakers"
                      ? pastRecipients.length
                      : speakerRecipients.filter((r) => {
                          const s = speakers.find((x) => x.id === r.speaker_id)!;
                          if (k === "prospective") return ["new", "contacted", "responded"].includes(s.status);
                          if (k === "current_confirmed") return s.status === "confirmed";
                          return s.status === "confirmed" && (s.source ?? "") !== "tito";
                        }).length;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setGroup(k)}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-3 py-2 text-sm text-left transition",
                        group === k
                          ? "border-primary/50 bg-primary/5 text-primary"
                          : "border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <span>{groupLabels[k]}</span>
                      <span className="text-xs text-muted-foreground">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste addresses separated by comma, semicolon, or newline"
                className="min-h-[80px]"
              />
            )}

            {passOptions.length > 0 && (
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pass type
                </Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <FilterChip
                    active={passFilter === "__all"}
                    onClick={() => setPassFilter("__all")}
                    label={`All (${audienceRecipients.length})`}
                  />
                  {passOptions.map(([title, n]) => (
                    <FilterChip
                      key={title}
                      active={passFilter === title}
                      onClick={() => setPassFilter(title)}
                      label={`${title} (${n})`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div
              className={cn(
                "text-sm rounded-lg px-3 py-2",
                zeroWarn
                  ? "bg-amber-50 text-amber-900 border border-amber-200"
                  : "bg-emerald-50 text-emerald-900 border border-emerald-200",
              )}
            >
              {zeroWarn
                ? "No recipients match these filters."
                : `${total} recipient${total === 1 ? "" : "s"} will receive this message.`}
            </div>
          </section>

          {/* Template picker */}
          <section className="rounded-2xl border border-slate-200/70 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Email type</Label>
              <Button variant="ghost" size="sm" onClick={reloadOriginal} className="text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reload original
              </Button>
            </div>
            <div className="relative">
              <select
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-2 text-sm"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Body</Label>
              <div className="mt-1 rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
                  <ToolbarBtn onClick={() => exec("bold")} title="Bold"><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
                  <ToolbarBtn onClick={() => exec("italic")} title="Italic"><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
                  <ToolbarBtn onClick={insertLink} title="Link"><Link2 className="h-3.5 w-3.5" /></ToolbarBtn>
                </div>
                <div
                  ref={bodyRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setBodyHtml((e.target as HTMLDivElement).innerHTML)}
                  className="min-h-[220px] px-3 py-2 text-sm outline-none whitespace-pre-wrap"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => insertPlaceholder(p.key)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {showPreview && filteredRecipients[0] && (
            <section className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Preview (first recipient)</div>
                <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              {(() => {
                const r = filteredRecipients[0];
                const ctx: Ctx = { eventName, eventDate, venue, speakerPassLink, guestPassLink };
                const s = resolvePlaceholders(subject, r, ctx);
                const b = resolvePlaceholders(htmlToPlain(bodyHtml), r, ctx);
                return (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      To: {r.name} &lt;{r.email}&gt;
                    </div>
                    <div className="rounded-lg bg-white border border-slate-200 p-3">
                      <div className="text-sm font-semibold mb-2">{s}</div>
                      <pre className="whitespace-pre-wrap text-sm font-sans text-slate-700">{b}</pre>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Full recipient list: {filteredRecipients.map((x) => x.email).join(", ")}
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {sendError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {sendError}
            </div>
          )}
          {sendProgress && (
            <div className="text-xs text-muted-foreground">
              Sending… {sendProgress.done} / {sendProgress.total}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => setShowPreview((v) => !v)} disabled={sending}>
            <Eye className="h-4 w-4 mr-1" /> Preview email
          </Button>
          <Button onClick={handleSend} disabled={sending || total === 0}>
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Send to {total}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Convert seed template plain-text body to HTML for the editor
function escapeToInitialHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br>");
}

function ToolbarBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className="h-7 w-7 grid place-items-center rounded hover:bg-slate-100 text-slate-600"
    >
      {children}
    </button>
  );
}

function ModeChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-slate-200 text-slate-600 hover:bg-slate-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-slate-200 text-slate-600 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );
}

// Suppress unused-import warnings for icons kept for future use
void Badge;

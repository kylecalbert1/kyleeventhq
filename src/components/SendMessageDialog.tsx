import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Link2,
  Loader2,
  Send,
  Eye,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Mail,
  Sparkles,
  Users,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

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
import { cn } from "@/lib/utils";
import {
  speakersQuery,
  emailTemplatesQuery,
  eventTitoLinksQuery,
  eventQuery,
  pastSpeakersQuery,
  userSettingsQuery,
  brandingQuery,
  confirmAttendanceLinksQuery,
} from "@/lib/queries";
import { sendGmailEmail } from "@/lib/email.functions";
import { logEmailSend } from "@/lib/email-sends.functions";
import { SendHistoryPanel } from "@/components/SendHistoryPanel";
import { formatEventDateRange } from "@/lib/message-render";
import { AiComposeEmailDialog } from "@/components/AiComposeEmailDialog";
import type { AiEmailDraft } from "@/lib/email-ai.functions";
import { containsHtml } from "@/lib/email-format";
import { brandingLogoSrc } from "@/lib/branding.functions";
import {
  renderBrandedEmail,
  brandedHeaderHtml,
  brandedInfoCardHtml,
  brandedCtaHtml,
  brandedFooterHtml,
  type TemplateKind,
} from "@/lib/branded-email";




// ---------- Recipient shape ----------
type Recipient = {
  email: string;
  name: string;
  first_name: string;
  company: string | null;
  job_title: string | null;
  session_title: string | null;
  speaker_id: string | null;
  release_title: string | null;
  past_event_name: string | null;
};

type AudienceMode = "group" | "paste";
type GroupKey =
  | "prospective"
  | "current_confirmed"
  | "past_speakers"
  | "confirmed_not_registered";

const GROUP_LABELS: Record<GroupKey, string> = {
  prospective: "Prospective speakers",
  current_confirmed: "Current confirmed",
  past_speakers: "Past speakers",
  confirmed_not_registered: "Confirmed but not in Tito",
};

// Resolve a greeting first name from a stored contact name only.
// Never derive from an email address: doing so produced greetings like
// "Hi rayotero323," when Tito registrants left the name field blank.
function firstName(full: string | null | undefined, email?: string | null): string {
  const raw = (full ?? "").trim();
  if (!raw) return "";
  if (/^unnamed(\s+attendee)?$/i.test(raw)) return "";
  if (email) {
    const lowerRaw = raw.toLowerCase();
    const lowerEmail = email.toLowerCase();
    if (lowerRaw === lowerEmail) return "";
    const local = lowerEmail.split("@")[0] ?? "";
    const norm = (s: string) => s.replace(/[\s._\-+]+/g, "");
    if (!raw.includes(" ") && local && norm(lowerRaw) === norm(local)) return "";
  }
  return raw.split(/\s+/)[0] ?? "";
}

type Ctx = {
  eventName: string;
  eventDate: string;
  venue: string;
  speakerPassLink: string;
  guestPassLink: string;
  salesContactName: string;
  salesContactEmail: string;
  salesContactBookingLink: string;
  /** Per-speaker signed confirm-your-speaking-date links. */
  confirmLinks?: { byId: Record<string, string>; byEmail: Record<string, string> };
};
function confirmLinkFor(r: Recipient, ctx: Ctx): string {
  const m = ctx.confirmLinks;
  if (!m) return "";
  return (
    (r.speaker_id ? m.byId[r.speaker_id] : "") || m.byEmail[r.email.toLowerCase()] || ""
  );
}
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
    sales_contact_name: ctx.salesContactName,
    sales_contact_email: ctx.salesContactEmail,
    sales_contact_booking_link: ctx.salesContactBookingLink,
    confirm_attendance_link: confirmLinkFor(r, ctx),
  };

  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => map[k.toLowerCase()] ?? `{{${k}}}`);
}

function htmlToPlain(html: string): string {
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li)>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "- ");
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**");
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "_$2_");
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function escapeToInitialHtml(body: string): string {
  const escaped = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br>");
}

/**
 * Seed the editable body. Templates saved from the rich-text editor are already
 * real HTML — escaping those turns their `<br/>` tags into visible text. Only
 * plain-text sources get the newline-to-<br> conversion.
 */
function seedBodyHtml(body: string): string {
  return containsHtml(body ?? "") ? body : escapeToInitialHtml(body ?? "");
}

/** Greeting prefix that matches the source flavour (HTML vs plain text). */
function withGreeting(body: string): string {
  if (/^\s*(<[^>]+>\s*)*(hi|hello|dear)\b/i.test(body)) return body;
  return containsHtml(body)
    ? `<div>Hi {{first_name}},</div><div><br></div>${body}`
    : `Hi {{first_name}},\n\n${body}`;
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
  { key: "sales_contact_name", label: "Sales contact name" },
  { key: "sales_contact_email", label: "Sales contact email" },
  { key: "sales_contact_booking_link", label: "Sales contact booking link" },
  { key: "confirm_attendance_link", label: "Confirm speaking date link" },

];

// ---------- Small building blocks ----------
function FieldLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <Label className="text-[13px] font-bold tracking-tight text-foreground">{children}</Label>
      {right}
    </div>
  );
}
function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{children}</p>;
}
function LabeledSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border-2 border-border bg-card px-3.5 py-2.5 pr-9 text-[13px] font-semibold text-foreground hover:border-ring/40 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {children}
      </select>
      <ChevronDown className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </div>
  );
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
      className="h-6 w-6 grid place-items-center rounded hover:bg-accent text-muted-foreground"
    >
      {children}
    </button>
  );
}

// ==================================================================
export function SendMessageDialog({
  open,
  onOpenChange,
  eventId,
  seedRecipientEmails,
  seedGroup,
  seedTemplateSlug,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  seedRecipientEmails?: string[];
  seedGroup?: GroupKey;
  seedTemplateSlug?: string;
}) {
  const evQ = useQuery(eventQuery(eventId));
  const speakersQ = useQuery(speakersQuery(eventId));
  const templatesQ = useQuery(emailTemplatesQuery);
  const titoLinksQ = useQuery(eventTitoLinksQuery(eventId));
  const pastQ = useQuery(pastSpeakersQuery(false));
  const settingsQ = useQuery(userSettingsQuery);
  const brandingQ = useQuery(brandingQuery);
  const confirmLinksQ = useQuery(confirmAttendanceLinksQuery(eventId));


  const [audienceMode, setAudienceMode] = useState<AudienceMode>("group");
  const [group, setGroup] = useState<GroupKey>(seedGroup ?? "current_confirmed");
  const [pasteText, setPasteText] = useState("");
  const [passFilter, setPassFilter] = useState<string>("__all");

  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyHtml, setBodyHtml] = useState<string>("");
  const [originalSubject, setOriginalSubject] = useState<string>("");
  const [originalBody, setOriginalBody] = useState<string>("");
  const [aiOpen, setAiOpen] = useState(false);


  const [reviewOpen, setReviewOpen] = useState(false);
  const [excludedEmails, setExcludedEmails] = useState<Set<string>>(new Set());

  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const sendEmail = useServerFn(sendGmailEmail);
  const logSend = useServerFn(logEmailSend);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setAudienceMode(seedRecipientEmails && seedRecipientEmails.length ? "paste" : "group");
      setPasteText(seedRecipientEmails?.length ? seedRecipientEmails.join(", ") : "");
      setGroup(seedGroup ?? "current_confirmed");
      setPassFilter("__all");
      setPreviewing(false);
      setSendError(null);
      setSendProgress(null);
      setReviewOpen(false);
      setExcludedEmails(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Restore editable body innerHTML when returning from Preview (the div unmounts
  // during preview, so React state is our source of truth), and when a template
  // was seeded before the editor was mounted.
  useEffect(() => {
    if (!previewing && bodyRef.current && bodyRef.current.innerHTML !== bodyHtml) {
      bodyRef.current.innerHTML = bodyHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing, bodyHtml]);

  const speakers = speakersQ.data ?? [];
  const past = pastQ.data ?? [];
  // Use the plain event name in the header banner (no code prefix).
  const eventName = evQ.data?.name ?? "";
  const eventDate = formatEventDateRange(
    evQ.data?.event_date,
    (evQ.data as { event_end_date?: string | null } | undefined)?.event_end_date,
  );

  const venue = evQ.data?.venue ?? "";
  const salesContactName = evQ.data?.sales_contact_name ?? "";
  const salesContactEmail = evQ.data?.sales_contact_email ?? "";
  const salesContactBookingLink = evQ.data?.sales_contact_booking_link ?? "";
  const speakerPassLink = titoLinksQ.data?.speaker_pass_link ?? "";
  const guestPassLink = titoLinksQ.data?.guest_pass_link ?? "";
  const signatureHtml = settingsQ.data?.email_signature_html ?? "";

  // Branding: per-event logo override wins, otherwise the business line logo.
  const brandingBase = brandingQ.data?.publicBaseUrl ?? "";
  const lineLogo =
    brandingQ.data?.lines.find((l) => l.business_line === evQ.data?.business_line)?.logo_url ?? null;
  const logoUrl = brandingLogoSrc(
    brandingBase,
    (evQ.data as { logo_url?: string | null } | undefined)?.logo_url || lineLogo,
  );
  const confirmLinks = confirmLinksQ.data;


  const speakerRecipients = useMemo<Recipient[]>(() => {
    return speakers
      .filter((s) => !!s.email)
      .map((s) => ({
        email: s.email!.toLowerCase(),
        name: s.name,
        first_name: firstName(s.name, s.email),
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
      .map((p) => ({
        email: p.email.toLowerCase(),
        name: p.name,
        first_name: firstName(p.name, p.email),
        company: p.company ?? null,
        job_title: p.job_title ?? null,
        session_title: null,
        speaker_id: null,
        release_title: p.appearances.find((a) => a.is_speaker_role)?.release_title ?? null,
        past_event_name: p.most_recent_past_speaker_event ?? null,
      }));
  }, [past]);

  const groupRecipients = useMemo<Recipient[]>(() => {
    if (group === "past_speakers") return pastRecipients;
    return speakerRecipients.filter((r) => {
      const s = speakers.find((x) => x.id === r.speaker_id)!;
      if (group === "prospective") return ["prospective", "new", "contacted", "responded"].includes(s.status);
      if (group === "current_confirmed") return s.status === "confirmed";
      return s.status === "confirmed" && (s.source ?? "") !== "tito";
    });
  }, [group, speakerRecipients, pastRecipients, speakers]);

  const pasteRecipients = useMemo<Recipient[]>(() => {
    const emails = Array.from(
      new Set(
        pasteText
          .split(/[\s,;]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => /.+@.+\..+/.test(s)),
      ),
    );
    return emails.map((email) => {
      const s = speakerRecipients.find((x) => x.email === email);
      if (s) return s;
      const p = pastRecipients.find((x) => x.email === email);
      if (p) return p;
      return {
        email,
        // No known name: keep name blank so downstream UIs show the email,
        // and greeting placeholders fall back to the neutral "there".
        name: "",
        first_name: "",
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
    if (passFilter === "__all") return audienceRecipients;
    return audienceRecipients.filter((r) => (r.release_title ?? "") === passFilter);
  }, [audienceRecipients, passFilter]);

  // Clear any manual exclusions whenever the audience definition changes, so
  // stale unticks never silently carry over to a new recipient list.
  useEffect(() => {
    setExcludedEmails(new Set());
  }, [audienceMode, group, passFilter, pasteText]);

  const recipientsToSend = useMemo(
    () => filteredRecipients.filter((r) => !excludedEmails.has(r.email)),
    [filteredRecipients, excludedEmails],
  );

  function toggleExcluded(email: string, checked: boolean) {
    setExcludedEmails((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  const groupCounts = useMemo(() => {
    const map: Record<GroupKey, number> = {
      prospective: 0,
      current_confirmed: 0,
      past_speakers: pastRecipients.length,
      confirmed_not_registered: 0,
    };
    for (const r of speakerRecipients) {
      const s = speakers.find((x) => x.id === r.speaker_id)!;
      if (["prospective", "new", "contacted", "responded"].includes(s.status)) map.prospective++;
      if (s.status === "confirmed") map.current_confirmed++;
      if (s.status === "confirmed" && (s.source ?? "") !== "tito") map.confirmed_not_registered++;
    }
    return map;
  }, [speakerRecipients, pastRecipients, speakers]);

  const templates = templatesQ.data ?? [];
  const activeTemplate = templates.find((t) => t.id === templateId);
  const activeKind: TemplateKind = activeTemplate?.kind ?? null;
  const activeCta =
    activeTemplate?.cta_label && activeTemplate?.cta_url
      ? { label: activeTemplate.cta_label, url: activeTemplate.cta_url }
      : null;

  useEffect(() => {
    if (!templateId && templates.length) {
      const seedByGroup: Partial<Record<GroupKey, string>> = {
        prospective: "future_event_invite",
        current_confirmed: "speaker_confirmation",
        past_speakers: "future_event_invite",
        confirmed_not_registered: "speaker_pass_reminder",
      };
      const seeded = seedTemplateSlug
        ? templates.find((t) => t.slug === seedTemplateSlug)
        : undefined;
      const preferred = seeded ?? templates.find((t) => t.slug === seedByGroup[group]);
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
    // Make the greeting part of the editable body so it can be removed or reworded.
    const bodyWithGreeting = withGreeting(t.body);
    const html = seedBodyHtml(bodyWithGreeting);
    setBodyHtml(html);
    setOriginalSubject(t.subject);
    setOriginalBody(bodyWithGreeting);
    if (bodyRef.current) bodyRef.current.innerHTML = html;
  }

  function applyAiDraft(draft: AiEmailDraft) {
    // Same path as applyTemplate, but not backed by a saved template.
    setTemplateId("");
    setSubject(draft.subject);
    const bodyWithGreeting = withGreeting(draft.body);
    const html = seedBodyHtml(bodyWithGreeting);
    setBodyHtml(html);
    setOriginalSubject(draft.subject);
    setOriginalBody(bodyWithGreeting);
    if (bodyRef.current) bodyRef.current.innerHTML = html;
  }



  function resetToTemplate() {
    setSubject(originalSubject);
    const html = seedBodyHtml(originalBody);
    setBodyHtml(html);
    if (bodyRef.current) bodyRef.current.innerHTML = html;
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

  const total = recipientsToSend.length;
  const zeroWarn = total === 0;

  async function handleSend() {
    if (total === 0) return;
    setSending(true);
    setSendError(null);
    setSendProgress({ done: 0, total });
    const ctx: Ctx = { eventName, eventDate, venue, speakerPassLink, guestPassLink, salesContactName, salesContactEmail, salesContactBookingLink, confirmLinks };
    const successful: Array<{ email: string; name: string; speaker_id: string | null }> = [];
    try {
      for (let i = 0; i < recipientsToSend.length; i++) {
        const r = recipientsToSend[i];
        const s = resolvePlaceholders(subject, r, ctx);
        // Same wrapper the preview renders, so what Kyle saw is what goes out.
        const b = resolvePlaceholders(
          renderBrandedEmail({
            eventName,
            eventDate,
            venue,
            logoUrl,
            bodyHtml,
            signatureHtml,
            kind: activeKind,
            cta: activeCta,
          }),
          r,
          ctx,
        );
        try {
          await sendEmail({ data: { to: r.email, subject: s, body: b, isHtml: true } });
          successful.push({ email: r.email, name: r.name, speaker_id: r.speaker_id });

        } catch (err: any) {
          console.error("send failed", r.email, err);
          setSendError(`${r.email}: ${err?.message ?? "send failed"}`);
        }
        setSendProgress({ done: i + 1, total });
      }
      if (successful.length) {
        const tpl = templates.find((t) => t.id === templateId);
        try {
          await logSend({
            data: {
              event_id: eventId,
              template_type: tpl?.slug ?? "custom",
              subject,
              body: htmlToPlain(signatureHtml ? `${bodyHtml}<br><br>${signatureHtml}` : bodyHtml),
              recipients: successful.map((r) => ({
                speaker_id: r.speaker_id,
                email: r.email,
                name: r.name,
              })),
            },
          });
          toast.success(
            `Sent ${successful.length} message${
              successful.length === 1 ? "" : "s"
            } · logged to Send history`,
          );
        } catch (err) {
          console.error("Failed to log message send:", err);
          const msg = err instanceof Error ? err.message : "unknown error";
          setSendError(`Sent ${successful.length} message(s), but saving to Send history failed: ${msg}`);
          toast.error(
            `Sent ${successful.length} message(s), but saving them to Send history failed: ${msg}`,
            { duration: 12000 },
          );
        }
      } else {
        toast.error("No messages were sent.");
      }
      qc.invalidateQueries({ queryKey: ["emailSends"] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["contactHistory"] });
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  const firstR = recipientsToSend[0];
  const ctx: Ctx = { eventName, eventDate, venue, speakerPassLink, guestPassLink, salesContactName, salesContactEmail, salesContactBookingLink, confirmLinks };
  const previewSubject = firstR ? resolvePlaceholders(subject, firstR, ctx) : subject;
  const previewFullHtml = renderBrandedEmail({
    eventName,
    eventDate,
    venue,
    logoUrl,
    bodyHtml,
    signatureHtml,
    kind: activeKind,
    cta: activeCta,
  });
  const previewBodyPlain = firstR ? resolvePlaceholders(htmlToPlain(previewFullHtml), firstR, ctx) : "";
  const previewBodyHtml = firstR ? resolvePlaceholders(previewFullHtml, firstR, ctx) : previewFullHtml;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0 bg-background">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-[20px] font-bold leading-tight text-foreground">
            <Mail className="h-4 w-4" />
            Send message
          </DialogTitle>
          <div className="mt-2 flex items-center gap-2.5 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
                total > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {total} recipient{total === 1 ? "" : "s"}
            </span>
            <p className="text-[13px] text-muted-foreground">
              Pick an audience, tweak the copy, preview before it goes out.
            </p>
          </div>

        </DialogHeader>

        {previewing ? (
          <PreviewPane
            subject={previewSubject}
            bodyHtml={previewBodyHtml}
            bodyPlain={previewBodyPlain}
            firstRecipient={firstR}
            recipients={filteredRecipients}
          />
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* 2. Collapsible send history strip */}
            <SendHistoryPanel eventId={eventId} defaultOpen={false} title="Send history" />

            {/* 3. Warning banner — only when 0 recipients */}
            {zeroWarn && (
              <div className="rounded-xl bg-[oklch(0.975_0.055_95)] border-2 border-[oklch(0.86_0.10_85)] px-3 py-2 text-xs font-medium text-[oklch(0.42_0.14_75)]">
                Current filters match 0 recipients. Adjust the audience above.
              </div>
            )}

            {/* 4. Audience toggle */}
            <section className="surface-card p-5 space-y-3">
              <FieldLabel>Audience</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <ToggleBtn
                  active={audienceMode === "group"}
                  onClick={() => setAudienceMode("group")}
                  label="Group filter"
                />
                <ToggleBtn
                  active={audienceMode === "paste"}
                  onClick={() => setAudienceMode("paste")}
                  label="Type emails / test"
                />
              </div>
              <HelpText>
                {audienceMode === "group"
                  ? "Send to a saved audience segment for this event."
                  : "Paste any addresses (comma, semicolon or newline). Useful for tests and one-offs."}
              </HelpText>

              {audienceMode === "paste" && (
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="alice@company.com, bob@company.com"
                  className="min-h-[96px] text-[13px] font-normal rounded-xl border-2"
                />
              )}
            </section>

            {/* 5. Email type (template) */}
            <section className="surface-card p-5 space-y-2">
              <FieldLabel
                right={
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => setAiOpen(true)}
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    Describe a message
                  </Button>
                }
              >
                Email type
              </FieldLabel>
              <LabeledSelect value={templateId} onChange={applyTemplate}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </LabeledSelect>
              <HelpText>Loads the subject and body below — you can still edit both.</HelpText>
            </section>


            {/* 6. Send to (audience segments) — only in group mode */}
            {audienceMode === "group" && (
              <section className="surface-card p-5 space-y-2">
                <FieldLabel>Send to</FieldLabel>
                <LabeledSelect value={group} onChange={(v) => setGroup(v as GroupKey)}>
                  {(Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => (
                    <option key={k} value={k}>
                      {GROUP_LABELS[k]} ({groupCounts[k]})
                    </option>
                  ))}
                </LabeledSelect>
                <HelpText>Counts update live as speakers change status.</HelpText>
              </section>
            )}

            {/* 7. Pass type (optional) */}
            {passOptions.length > 0 && (
              <section className="surface-card p-5 space-y-2">
                <FieldLabel>Pass type (optional)</FieldLabel>
                <LabeledSelect value={passFilter} onChange={setPassFilter}>
                  <option value="__all">All pass types ({audienceRecipients.length})</option>
                  {passOptions.map(([title, n]) => (
                    <option key={title} value={title}>
                      {title} ({n})
                    </option>
                  ))}
                </LabeledSelect>
                <HelpText>
                  Narrow to holders of a specific Tito release, e.g. Speaker Pass or Guest Pass.
                </HelpText>
              </section>
            )}

            {/* 8. Subject */}
            <section className="surface-card p-5 space-y-2">
              <FieldLabel
                right={
                  <button
                    type="button"
                    onClick={resetToTemplate}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Reset to template
                  </button>
                }
              >
                Subject
              </FieldLabel>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-[13px] h-11 rounded-xl border-2 font-medium"
              />
              <HelpText>Placeholders like {"{{first_name}}"} resolve per recipient.</HelpText>
            </section>

            {/* 9. Email body — branded editable preview */}
            <section className="surface-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-bold tracking-tight text-foreground">Email body</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 rounded-lg border-2 border-border bg-card px-1 py-0.5">
                    <ToolbarBtn onClick={() => exec("bold")} title="Bold">
                      <Bold className="h-3 w-3" />
                    </ToolbarBtn>
                    <ToolbarBtn onClick={() => exec("italic")} title="Italic">
                      <Italic className="h-3 w-3" />
                    </ToolbarBtn>
                    <ToolbarBtn onClick={insertLink} title="Insert link">
                      <Link2 className="h-3 w-3" />
                    </ToolbarBtn>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Select text, then click 🔗
                  </span>
                </div>
              </div>

              {/* Branded inline email preview (directly editable) — same wrapper
                  markup the recipient gets, with the body area editable. */}
              <div className="rounded-xl overflow-hidden border-2 border-border bg-[#f5f4f1] p-3">
                <div className="bg-white rounded-xl overflow-hidden border border-[#e7e5e4]">
                  <div dangerouslySetInnerHTML={{ __html: brandedHeaderHtml({ eventName, logoUrl }) }} />
                  <div
                    ref={bodyRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => setBodyHtml((e.target as HTMLDivElement).innerHTML)}
                    className="bg-white px-6 pt-5 pb-1 text-[15px] leading-relaxed text-[#1c1917] outline-none min-h-[220px] [&_a]:text-primary [&_a]:underline"
                  />
                  {signatureHtml ? (
                    <div
                      className="bg-white px-6 pb-4 mt-3 pt-3 text-[15px] leading-relaxed text-[#1c1917] border-t border-dashed border-border [&_a]:text-primary [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: signatureHtml }}
                      title="Signature (edit in Settings)"
                    />
                  ) : (
                    <div className="bg-white px-6 pb-3 text-[11px] text-muted-foreground italic">
                      No signature set. Add one in Settings → Email signature.
                    </div>
                  )}
                  <div
                    dangerouslySetInnerHTML={{
                      __html:
                        brandedInfoCardHtml({ eventName, eventDate, venue }) +
                        brandedCtaHtml(activeCta, activeKind) +
                        brandedFooterHtml({ eventName, eventDate, venue }),
                    }}
                  />
                </div>
              </div>


              {/* 10. Placeholder chips */}
              <div className="pt-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Insert placeholder
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => insertPlaceholder(p.key)}
                      className="chip chip-slate hover:bg-accent"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {sendError && (
              <div className="rounded-xl border-2 border-[oklch(0.86_0.10_25)] bg-[oklch(0.97_0.03_25)] px-3 py-2 text-[11px] text-[oklch(0.45_0.18_25)]">
                {sendError}
              </div>
            )}
          </div>
        )}

        {/* 11. Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border gap-2 bg-background">
          {previewing ? (
            <>
              <Button variant="outline" onClick={() => setPreviewing(false)} disabled={sending}>
                <ArrowLeft className="h-3 w-3" /> Back to edit
              </Button>
              <Button size="lg" className="rounded-xl font-semibold" onClick={handleSend} disabled={sending || total === 0}>
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                {sending && sendProgress
                  ? `Sending ${sendProgress.done}/${sendProgress.total}`
                  : `Send to ${total}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancel
              </Button>
              <Button size="lg" className="rounded-xl font-semibold" onClick={() => setPreviewing(true)} disabled={total === 0}>
                <Eye className="h-3 w-3" /> Preview email
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      <AiComposeEmailDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        eventId={eventId}
        group={group}
        onDraft={applyAiDraft}
      />
    </Dialog>
  );

}

function ToggleBtn({
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
        "rounded-xl border-2 px-4 py-3 text-[13px] font-semibold transition-colors text-left",
        active
          ? "bg-primary border-primary text-primary-foreground shadow-sm"
          : "bg-card border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

function PreviewPane({
  subject,
  bodyHtml,
  bodyPlain,
  firstRecipient,
  recipients,
}: {
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  firstRecipient: Recipient | undefined;
  recipients: Recipient[];
}) {
  return (
    <div className="px-6 py-5 space-y-5">
      <div className="surface-card p-5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Preview (first recipient)
        </div>
        {firstRecipient && (
          <div className="text-xs text-muted-foreground mb-3">
            To: {firstRecipient.name} &lt;{firstRecipient.email}&gt;
          </div>
        )}
        <div className="rounded-xl border-2 border-border overflow-hidden">
          <div className="bg-muted px-4 py-2.5 text-xs font-semibold text-foreground">
            Subject: {subject}
          </div>
          <div
            className="text-[13px] font-sans [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </div>

        <details className="mt-2 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Plain-text fallback</summary>
          <pre className="mt-1 whitespace-pre-wrap font-sans">{bodyPlain}</pre>
        </details>
      </div>

      <div className="surface-card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
          Recipients ({recipients.length})
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {recipients.map((r) => (
            <span key={r.email} className="chip chip-slate" title={r.email}>
              {r.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

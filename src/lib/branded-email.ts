/**
 * One shared branded HTML email wrapper.
 *
 * Every send path (SendMessageDialog, BulkEmailDialog / ConfirmSendEmailDialog)
 * composes and previews through these functions, so the live preview and the
 * HTML that actually leaves Gmail are the same markup.
 *
 * Deliberately plain, inline-styled, table-free HTML: Gmail strips <style>
 * blocks and classes, so all styling has to be inline.
 */

export type TemplateKind =
  | "confirm"
  | "confirm_speaking_date"
  | "reminder"
  | "info"
  | string
  | null
  | undefined;

/** Fallback brand colour when a template has no kind set. */
export const BRAND_COLOR = "#4f46e5";
const HEADER_BG = "#4f46e5";

const KIND_COLORS: Record<string, string> = {
  confirm: "#6d28d9",
  reconfirm: "#6d28d9",
  confirm_speaking_date: "#6d28d9",
  reminder: "#ea580c",
  urgent: "#ea580c",
  info: "#0d9488",
  dietary: "#0d9488",
};

export function ctaColor(kind: TemplateKind): string {
  if (!kind) return BRAND_COLOR;
  return KIND_COLORS[kind] ?? BRAND_COLOR;
}

export type BrandedEmailInput = {
  eventName: string;
  eventDate: string;
  venue: string;
  /** Business-line logo, or the event's override. Empty means plain colour bar. */
  logoUrl?: string | null;
  /** Editable message content (already HTML). */
  bodyHtml: string;
  signatureHtml?: string | null;
  kind?: TemplateKind;
  cta?: { label: string; url: string } | null;
};

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Header bar: logo on a light background, else a solid colour bar with the event name. */
export function brandedHeaderHtml(p: Pick<BrandedEmailInput, "eventName" | "logoUrl">): string {
  const logo = (p.logoUrl ?? "").trim();
  if (logo) {
    return `<div style="background:#ffffff;border-bottom:1px solid #e7e5e4;padding:18px 24px;text-align:left">
<img src="${esc(logo)}" alt="${esc(p.eventName)}" style="max-height:44px;max-width:220px;display:block;border:0" />
</div>`;
  }
  return `<div style="background:${HEADER_BG};color:#ffffff;padding:14px 24px;font:700 14px/1.4 Arial,Helvetica,sans-serif">
${esc(p.eventName || "Event Ops")}
</div>`;
}

/** Light grey rounded card with event name, long date and venue. */
export function brandedInfoCardHtml(
  p: Pick<BrandedEmailInput, "eventName" | "eventDate" | "venue">,
): string {
  if (!p.eventName && !p.eventDate && !p.venue) return "";
  const lines = [
    p.eventName
      ? `<div style="font:700 15px/1.5 Arial,Helvetica,sans-serif;color:#1c1917">${esc(p.eventName)}</div>`
      : "",
    p.eventDate
      ? `<div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#44403c">${esc(p.eventDate)}</div>`
      : "",
    p.venue
      ? `<div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#44403c">${esc(p.venue)}</div>`
      : "",
  ].join("");
  return `<div style="margin:20px 24px;padding:16px 18px;background:#f5f5f4;border:1px solid #e7e5e4;border-radius:12px">${lines}</div>`;
}

/** Centered rounded CTA button, coloured by template kind. */
export function brandedCtaHtml(
  cta: { label: string; url: string } | null | undefined,
  kind?: TemplateKind,
): string {
  if (!cta || !cta.label?.trim() || !cta.url?.trim()) return "";
  const color = ctaColor(kind);
  return `<div style="text-align:center;padding:8px 24px 24px">
<a href="${esc(cta.url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font:700 15px/1 Arial,Helvetica,sans-serif;padding:14px 28px;border-radius:999px">${esc(cta.label)}</a>
</div>`;
}

/** Small muted footer line: event name, date, venue. */
export function brandedFooterHtml(
  p: Pick<BrandedEmailInput, "eventName" | "eventDate" | "venue">,
): string {
  const bits = [p.eventName, p.eventDate, p.venue].filter(Boolean).map(esc).join(" · ");
  if (!bits) return "";
  return `<div style="border-top:1px solid #e7e5e4;padding:14px 24px;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#78716c">${bits}</div>`;
}

export function brandedBodyHtml(bodyHtml: string, signatureHtml?: string | null): string {
  const sig = (signatureHtml ?? "").trim()
    ? `<div style="margin-top:20px;padding-top:14px;border-top:1px dashed #e7e5e4">${signatureHtml}</div>`
    : "";
  return `<div style="padding:22px 24px 4px;font:400 15px/1.65 Arial,Helvetica,sans-serif;color:#1c1917">${bodyHtml}${sig}</div>`;
}

/** Full branded email: header, body, info card, CTA, footer. */
export function renderBrandedEmail(p: BrandedEmailInput): string {
  return [
    '<div style="background:#f5f4f1;padding:24px 0;font-family:Arial,Helvetica,sans-serif">',
    '<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden">',
    brandedHeaderHtml(p),
    brandedBodyHtml(p.bodyHtml, p.signatureHtml),
    brandedInfoCardHtml(p),
    brandedCtaHtml(p.cta, p.kind),
    brandedFooterHtml(p),
    "</div></div>",
  ].join("");
}

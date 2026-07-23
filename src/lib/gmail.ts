// Open Gmail web compose in a genuine new browser tab instead of the native mail client.
export function gmailComposeUrl(opts: {
  to?: string | null;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
}) {
  const params = new URLSearchParams();
  params.set("view", "cm");
  params.set("fs", "1");
  if (opts.to) params.set("to", opts.to);
  if (opts.subject) params.set("su", opts.subject);
  if (opts.body) params.set("body", opts.body);
  if (opts.cc) params.set("cc", opts.cc);
  if (opts.bcc) params.set("bcc", opts.bcc);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function openGmailCompose(opts: Parameters<typeof gmailComposeUrl>[0]) {
  const a = document.createElement("a");
  a.href = gmailComposeUrl(opts);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}

export function gmailThreadUrl(threadId: string) {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

// Force a genuine top-level new tab (breaks out of Lovable preview iframe).
export function openGmailThread(threadId: string) {
  const url = gmailThreadUrl(threadId);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) {
    try { (win as Window).opener = null; } catch {}
    return;
  }
  // Popup blocked - fall back to top-level navigation via a synthetic anchor.
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
}

// Resolve a greeting first name from a stored contact name.
// Priority: real stored name → "there". Never derive from an email address.
// Rejects blank, placeholder ("Unnamed"), or names that are just the email /
// email local-part (a legacy fallback that produced greetings like
// "Hi rayotero323,"). Pass the email so we can detect and neutralize those.
export function firstNameOf(
  fullName: string | null | undefined,
  email?: string | null,
): string {
  const raw = (fullName ?? "").trim();
  if (!raw) return "there";
  if (/^unnamed(\s+attendee)?$/i.test(raw)) return "there";
  if (email) {
    const lowerRaw = raw.toLowerCase();
    const lowerEmail = email.toLowerCase();
    if (lowerRaw === lowerEmail) return "there";
    const local = lowerEmail.split("@")[0] ?? "";
    const norm = (s: string) => s.replace(/[\s._\-+]+/g, "");
    if (local && norm(lowerRaw) === norm(local)) return "there";
  }
  const first = raw.split(/\s+/)[0] ?? "";
  return first || "there";
}

export function initialsOf(fullName: string | null | undefined) {
  if (!fullName) return "?";
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

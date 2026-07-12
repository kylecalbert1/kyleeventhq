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

export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
}

export function firstNameOf(fullName: string | null | undefined) {
  if (!fullName) return "there";
  return fullName.trim().split(/\s+/)[0] ?? "there";
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

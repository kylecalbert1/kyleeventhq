/**
 * Build a Gmail web compose URL. Used instead of `mailto:` links so composing
 * opens Gmail in the browser rather than the OS mail client.
 */
export function gmailComposeUrl(
  to: string | null | undefined,
  subject?: string | null,
  body?: string | null,
): string {
  const params = new URLSearchParams({ view: "cm", fs: "1" });
  if (to) params.set("to", to);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/** Opens the Gmail compose window in a new tab. */
export function openGmailCompose(
  to: string | null | undefined,
  subject?: string | null,
  body?: string | null,
): void {
  window.open(gmailComposeUrl(to, subject, body), "_blank", "noopener,noreferrer");
}

/** Status implied by a board column kind. Custom columns (kind null) imply nothing. */
export function statusForKind(kind: string | null | undefined): string | null {
  switch (kind) {
    case "interest":
      return "new";
    case "in_conversation":
      return "in_conversation";
    case "confirmed":
    case "registered":
      return "confirmed";
    case "declined":
      return "declined";
    default:
      return null;
  }
}

export function normalizeColumnName(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Word roots per kind. Matched as substrings so variants ("confirmation",
 * "confirming", "declines") resolve to the right kind automatically.
 * Order matters: declined is checked before confirmed etc. in inferColumnKind.
 */
export const KIND_STEMS: Record<string, string[]> = {
  declined: ["declin", "reject", "passed", "not interested", "no thank", "lost", " no go", "nogo"],
  registered: ["registr", "register", "ticketed", "on site", "onsite"],
  confirmed: ["confirm", "signed", "sign off", "agreed", "booked", "locked in", "complete", "done"],
  in_conversation: [
    "conversation",
    "in progress",
    "talking",
    "outreach",
    "contact",
    "discussion",
    "negotiat",
    "pitch",
    "follow up",
    "chasing",
  ],
  interest: ["interest", "prospect", "lead", "new", "backlog", "to do", "todo", "target", "ideas"],
};

const KIND_ORDER = ["declined", "registered", "confirmed", "in_conversation", "interest"] as const;

/** Best-guess semantic kind for a column name, or null when nothing matches. */
export function inferColumnKind(name: string | null | undefined): string | null {
  const n = normalizeColumnName(name);
  if (!n) return null;
  for (const kind of KIND_ORDER) {
    if (KIND_STEMS[kind].some((stem) => n.includes(stem.trim()))) return kind;
  }
  return null;
}

/** Kind to use for a column: explicit kind wins, else inferred from the name. */
export function effectiveColumnKind(
  kind: string | null | undefined,
  name: string | null | undefined,
): string | null {
  return kind ?? inferColumnKind(name);
}

export type ReleaseGroupKey = "speakers" | "sponsors" | "members" | "other" | "delegates";

/** Classify a Tito release by its name. Case-insensitive, first match wins. */
export function classifyRelease(title: string | null | undefined): ReleaseGroupKey {
  const t = (title ?? "").toLowerCase();
  if (t.includes("speaker")) return "speakers";
  if (t.includes("sponsor") || t.includes("client")) return "sponsors";
  if (t.includes("member")) return "members";
  if (t.includes("vendor") || t.includes("vip")) return "other";
  return "delegates";
}

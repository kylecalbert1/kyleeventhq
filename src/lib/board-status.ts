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

import { useQuery } from "@tanstack/react-query";
import { Blocks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { messageBlocksQuery } from "@/lib/queries";

/**
 * Drops a reusable content block's markdown into a textarea at the caret.
 * Pass the textarea ref and the current value, get the new value back.
 */
export function InsertBlockMenu({
  textareaRef,
  value,
  onChange,
  disabled,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const blocks = useQuery(messageBlocksQuery);

  function insert(markdown: string) {
    const el = textareaRef.current;
    const at = el ? (el.selectionStart ?? value.length) : value.length;
    const before = value.slice(0, at);
    const after = value.slice(at);
    const sep = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const tail = after && !after.startsWith("\n") ? "\n\n" : "";
    const next = `${before}${sep}${markdown}${tail}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      const pos = (before + sep + markdown).length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={disabled}>
          <Blocks className="mr-1.5 h-3.5 w-3.5" />
          Insert block
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        {(blocks.data ?? []).map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => insert(b.body_markdown)}>
            {b.name}
          </DropdownMenuItem>
        ))}
        {(blocks.data ?? []).length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            No blocks yet. Add them on the Message templates page.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

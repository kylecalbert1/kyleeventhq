import { useEffect, useRef } from "react";
import { Bold, Italic, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared contentEditable email body editor with a Bold / Italic / Link
 * toolbar. Value is HTML. Callers pass HTML in and receive HTML out — use
 * `toEmailHtml()` from `@/lib/email-format` to coerce stored plain-text
 * templates into HTML before passing them in.
 */
export function RichTextEmailEditor({
  value,
  onChange,
  minRows = 10,
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (html: string) => void;
  minRows?: number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Only overwrite innerHTML when the incoming `value` differs from what's
  // already rendered. Skipping this while the user types preserves caret
  // position; syncing when the parent resets `value` (template switch,
  // preview toggle) keeps the DOM in step.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value ?? "";
    }
  }, [value]);

  function exec(cmd: "bold" | "italic") {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(cmd);
    onChange(ref.current?.innerHTML ?? "");
  }
  function insertLink() {
    if (disabled) return;
    const url = window.prompt("Link URL");
    if (!url) return;
    ref.current?.focus();
    document.execCommand("createLink", false, url);
    onChange(ref.current?.innerHTML ?? "");
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background overflow-hidden",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1">
        <ToolbarButton onClick={() => exec("bold")} title="Bold (Ctrl/Cmd+B)">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} title="Italic (Ctrl/Cmd+I)">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={insertLink} title="Insert link">
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-label={ariaLabel ?? "Email body"}
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        className="px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring [&_a]:text-primary [&_a]:underline"
        style={{ minHeight: `${minRows * 1.5}rem` }}
      />
    </div>
  );
}

function ToolbarButton({
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
      title={title}
      onMouseDown={(e) => {
        // Prevent the editor from losing focus / selection before execCommand runs.
        e.preventDefault();
        onClick();
      }}
      className="h-6 w-6 grid place-items-center rounded hover:bg-accent text-muted-foreground"
    >
      {children}
    </button>
  );
}

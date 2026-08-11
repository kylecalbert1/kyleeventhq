import { useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { toEmailHtml } from "@/lib/email-format";

/** Strip tags for a short plain-text snippet of the sent body. */
export function snippetOf(html: string, max = 180): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function SentMessagePanel({ subject, body }: { subject: string; body: string }) {
  const [show, setShow] = useState(false);
  const html = toEmailHtml(body ?? "");
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;padding:12px;background:#fff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#0f172a;word-wrap:break-word;}
    img{max-width:100%;height:auto}a{color:#4f46e5}
  </style></head><body>${html}</body></html>`;

  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200/70 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        Message sent
      </div>
      <div className="text-xs text-slate-900">
        <span className="text-slate-500">Subject:</span>{" "}
        <span className="font-medium">{subject}</span>
      </div>
      {!show && (
        <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{snippetOf(html)}</p>
      )}
      {show && (
        <iframe
          title="Sent message"
          sandbox=""
          srcDoc={srcDoc}
          className="mt-2 w-full h-[420px] rounded-md border border-slate-200 bg-white"
        />
      )}
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
      >
        {show ? (
          <>
            <ChevronDown className="h-3 w-3" /> Hide full message
          </>
        ) : (
          <>
            <ChevronRight className="h-3 w-3" /> View full message
          </>
        )}
      </button>
    </div>
  );
}

export function RecipientsPanel({
  recipients,
}: {
  recipients: Array<{ id: string; recipient_name: string | null; recipient_email: string | null }>;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
          <Users className="h-3.5 w-3.5 text-slate-500" />
          {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
        </span>
        {recipients.length > 0 && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            {show ? "Hide recipients" : "Show recipients"}
          </button>
        )}
      </div>
      {show && (
        <ul className="mt-2 max-h-56 overflow-y-auto space-y-0.5">
          {recipients.map((r) => (
            <li key={r.id} className="text-[11px] text-slate-600">
              {r.recipient_name ?? "Unknown"}
              {r.recipient_email ? (
                <span className="text-slate-400"> · {r.recipient_email}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

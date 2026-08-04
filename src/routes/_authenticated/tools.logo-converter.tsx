import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FolderOpen, Wand2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { convertLogo, VARIANTS, supportsDirectoryPicker } from "@/lib/logo-convert";

export const Route = createFileRoute("/_authenticated/tools/logo-converter")({
  head: () => ({
    meta: [
      { title: "Logo Converter — Event Ops" },
      { name: "description", content: "Convert logos to black, white and transparent colour PNGs in the browser." },
      { property: "og:title", content: "Logo Converter — Event Ops" },
      { property: "og:description", content: "Convert logos to black, white and transparent colour PNGs in the browser." },
    ],
  }),
  component: LogoConverterPage,
});

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
type Status = "queued" | "working" | "done" | "error";
type Row = { file: File; url: string; status: Status; message?: string };

function LogoConverterPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [dirName, setDirName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canPickDir = supportsDirectoryPicker();

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Row[] = [];
    for (const file of Array.from(list)) {
      if (!ACCEPT.includes(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) continue;
      next.push({ file, url: URL.createObjectURL(file), status: "queued" });
    }
    if (!next.length) {
      toast.error("No supported images (png, jpg, jpeg, webp, gif)");
      return;
    }
    setRows((prev) => [...prev, ...next]);
  }

  async function chooseFolder() {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setDirHandle(handle);
      setDirName(handle.name);
    } catch {
      /* cancelled */
    }
  }

  function setStatus(i: number, status: Status, message?: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status, message } : r)));
  }

  async function convert() {
    if (!rows.length) return;
    setRunning(true);
    try {
      const zipEntries: { path: string; blob: Blob }[] = [];
      let dirs: Record<string, any> = {};
      if (dirHandle) {
        for (const v of VARIANTS) dirs[v] = await dirHandle.getDirectoryHandle(v, { create: true });
      }

      for (let i = 0; i < rows.length; i++) {
        if (rows[i].status === "done") continue;
        setStatus(i, "working");
        try {
          const result = await convertLogo(rows[i].file);
          for (const v of VARIANTS) {
            if (dirHandle) {
              const fh = await dirs[v].getFileHandle(result.name, { create: true });
              const ws = await fh.createWritable();
              await ws.write(result.blobs[v]);
              await ws.close();
            } else {
              zipEntries.push({ path: `${v}/${result.name}`, blob: result.blobs[v] });
            }
          }
          setStatus(i, "done");
        } catch (err: any) {
          setStatus(i, "error", err?.message ?? "Failed");
        }
      }

      if (!dirHandle && zipEntries.length) {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const e of zipEntries) zip.file(e.path, e.blob);
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "logos.zip";
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(dirHandle ? "Written to your folder" : "Zip downloaded");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Logo converter</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Makes black, white and transparent colour PNGs from any logo. Runs entirely in your browser — nothing is uploaded.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
          }`}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium text-foreground">Drop logo files here</div>
          <div className="text-xs text-muted-foreground">or click to select — png, jpg, jpeg, webp, gif</div>
          <Input
            ref={inputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.gif"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canPickDir ? (
            <Button variant="outline" size="sm" onClick={chooseFolder}>
              <FolderOpen className="mr-2 h-4 w-4" />
              {dirName ? `Output: ${dirName}` : "Choose output folder"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Your browser doesn't support direct folder writes — you'll get a zip instead.
            </span>
          )}
          <Button size="sm" onClick={convert} disabled={running || !rows.length || (canPickDir && !dirHandle)}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Convert {rows.length ? `(${rows.length})` : ""}
          </Button>
          {rows.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setRows([])} disabled={running}>
              Clear
            </Button>
          )}
        </div>
        {canPickDir && !dirHandle && rows.length > 0 && (
          <p className="text-xs text-muted-foreground">Pick an output folder to enable conversion.</p>
        )}
      </Card>

      {rows.length > 0 && (
        <Card className="divide-y divide-border">
          {rows.map((r, i) => (
            <div key={`${r.file.name}-${i}`} className="flex items-center gap-3 p-3">
              <img
                src={r.url}
                alt={r.file.name}
                className="h-10 w-10 shrink-0 rounded border border-border bg-white object-contain"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground">{r.file.name}</div>
                {r.message && <div className="truncate text-xs text-rose-600">{r.message}</div>}
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">
                {r.status === "queued" && "Queued"}
                {r.status === "working" && <Loader2 className="h-4 w-4 animate-spin" />}
                {r.status === "done" && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Check className="h-4 w-4" /> Done
                  </span>
                )}
                {r.status === "error" && (
                  <span className="flex items-center gap-1 text-rose-600">
                    <X className="h-4 w-4" /> Error
                  </span>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

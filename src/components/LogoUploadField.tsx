import { useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { brandingQuery } from "@/lib/queries";
import { brandingLogoSrc } from "@/lib/branding.functions";

/**
 * Upload / remove a logo used in the branded email header.
 * Stores the storage path; emails load it through /api/public/branding-logo.
 */
export function LogoUploadField({
  label,
  value,
  onChange,
  folder,
  help,
}: {
  label: string;
  /** Stored storage path (or null). */
  value: string | null;
  onChange: (path: string | null) => void | Promise<void>;
  /** Folder inside the branding bucket, e.g. "AIAI" or an event id. */
  folder: string;
  help?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const brandingQ = useQuery(brandingQuery);
  const src = brandingLogoSrc(brandingQ.data?.publicBaseUrl ?? "", value);

  async function handleFile(file: File) {
    if (!/^image\//.test(file.type)) {
      toast.error("Please choose an image file.");
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("branding")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw new Error(error.message);
      await onChange(path);
      toast.success("Logo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-3">
        <div className="h-14 w-40 rounded-md border border-border bg-muted/40 grid place-items-center overflow-hidden">
          {src ? (
            <img src={src} alt={label} className="max-h-12 max-w-[9rem] object-contain" />
          ) : (
            <span className="text-[11px] text-muted-foreground">No logo</span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <ImageUp className="h-3.5 w-3.5 mr-1.5" />
          )}
          {value ? "Replace" : "Upload"}
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void onChange(null)}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Remove
          </Button>
        )}
      </div>
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
    </div>
  );
}

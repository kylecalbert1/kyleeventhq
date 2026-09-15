import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BrandingRow = { business_line: string; logo_url: string | null };

export type BrandingBundle = {
  /** Absolute base URL used to build image links that work inside emails. */
  publicBaseUrl: string;
  lines: BrandingRow[];
};

/** Build the absolute, login-free URL for a stored branding asset path. */
export function brandingLogoSrc(baseUrl: string, path: string | null | undefined): string {
  const p = (path ?? "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return `${baseUrl}/api/public/branding-logo?p=${encodeURIComponent(p)}`;
}

export const getBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { publicSiteUrl } = await import("@/lib/unsubscribe.server");
    const { data, error } = await context.supabase
      .from("business_line_branding")
      .select("business_line, logo_url");
    if (error) throw new Error(error.message);
    return {
      publicBaseUrl: publicSiteUrl(),
      lines: (data ?? []) as BrandingRow[],
    } satisfies BrandingBundle;
  });

export const setBusinessLineLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        business_line: z.enum(["AIAI", "CSC"]),
        logo_url: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("business_line_branding")
      .upsert(
        { business_line: data.business_line, logo_url: data.logo_url, updated_at: new Date().toISOString() },
        { onConflict: "business_line" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EmailTemplate = {
  id: string;
  slug: string;
  name: string;
  subject: string;
  body: string;
  is_seed: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_templates")
      .select("*")
      .eq("is_archived", false)
      .order("is_seed", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as EmailTemplate[];
  });

const TemplateInput = z.object({
  name: z.string().min(1),
  subject: z.string(),
  body: z.string(),
});

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || `template_${Date.now()}`
  );
}

export const createEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const base = slugify(data.name);
    // Ensure uniqueness by suffixing with a counter if collision.
    let slug = base;
    let attempt = 0;
    while (attempt < 20) {
      const { data: existing } = await context.supabase
        .from("email_templates")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slug = `${base}_${attempt + 1}`;
    }
    const { data: row, error } = await context.supabase
      .from("email_templates")
      .insert({ slug, name: data.name, subject: data.subject, body: data.body, is_seed: false })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as EmailTemplate;
  });

export const updateEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: TemplateInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("email_templates")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as EmailTemplate;
  });

export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Seed templates get archived (so history stays valid); user templates hard-delete.
    const { data: t } = await context.supabase
      .from("email_templates")
      .select("is_seed")
      .eq("id", data.id)
      .maybeSingle();
    if (t?.is_seed) {
      const { error } = await context.supabase
        .from("email_templates")
        .update({ is_archived: true })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("email_templates").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const duplicateEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("email_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!src) throw new Error("Template not found");
    const base = slugify(`${src.name} copy`);
    let slug = base;
    let attempt = 0;
    while (attempt < 20) {
      const { data: existing } = await context.supabase
        .from("email_templates")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slug = `${base}_${attempt + 1}`;
    }
    const { data: row, error } = await context.supabase
      .from("email_templates")
      .insert({
        slug,
        name: `${src.name} (copy)`,
        subject: src.subject,
        body: src.body,
        is_seed: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as EmailTemplate;
  });

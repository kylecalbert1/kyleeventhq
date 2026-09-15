import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves a branding asset from the private `branding` bucket over a stable,
 * login-free URL so email clients can load the logo.
 */
export const Route = createFileRoute("/api/public/branding-logo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = (url.searchParams.get("p") ?? "").replace(/^\/+/, "");
        // Only ever read inside the branding bucket.
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("branding").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        const buf = await data.arrayBuffer();
        return new Response(buf, {
          headers: {
            "Content-Type": data.type || "image/png",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});

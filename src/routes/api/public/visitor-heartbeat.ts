import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  visitorId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  path: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9/_.,-]*$/),
});

export const Route = createFileRoute("/api/public/visitor-heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const { visitorId, path } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error } = await supabaseAdmin
          .from("site_visits")
          .upsert(
            { visitor_id: visitorId, path, last_seen: new Date().toISOString() },
            { onConflict: "visitor_id" },
          );
        if (error) {
          console.error("[visitor-heartbeat] upsert failed:", error.message);
          return Response.json({ ok: false, live: 0 });
        }

        // ২৪ ঘণ্টার পুরনো রেকর্ড পরিষ্কার
        const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await supabaseAdmin.from("site_visits").delete().lt("last_seen", dayCutoff);

        // শেষ ২ মিনিটে সক্রিয় ভিজিটর
        const liveCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("site_visits")
          .select("id", { count: "exact", head: true })
          .gt("last_seen", liveCutoff);

        return Response.json({ ok: true, live: count ?? 0 });
      },
    },
  },
});

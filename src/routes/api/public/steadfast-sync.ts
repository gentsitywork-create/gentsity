import { createFileRoute } from "@tanstack/react-router";

// নির্দিষ্ট সময় পরপর (cron) কুরিয়ার স্ট্যাটাস সিঙ্ক — শুধু Steadfast থেকে সত্য স্ট্যাটাস পড়ে, কোনো ডেটা ফেরত দেয় না।
export const Route = createFileRoute("/api/public/steadfast-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncSteadfastStatuses } = await import("@/lib/steadfast.server");
        try {
          const r = await syncSteadfastStatuses(supabaseAdmin);
          return Response.json({ ok: true, ...r });
        } catch {
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});

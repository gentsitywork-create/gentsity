import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  notification_type: z.string().optional(),
  consignment_id: z.union([z.string(), z.number()]).optional(),
  invoice: z.union([z.string(), z.number()]).optional(),
  status: z.string().max(100).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/public/steadfast-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: setting } = await supabaseAdmin
          .from("settings")
          .select("value")
          .eq("key", "steadfast_webhook_token")
          .maybeSingle();
        const expected = setting?.value ?? "";
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!expected || expected.length < 12 || token !== expected) {
          return json({ status: "error", message: "Unauthorized" }, 401);
        }
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ status: "error", message: "Invalid payload" }, 400);
        const p = parsed.data;
        if (p.notification_type && p.notification_type !== "delivery_status") {
          return json({ status: "success", message: "Ignored" });
        }
        if (!p.status) return json({ status: "success", message: "No status" });
        const { applyCourierStatus } = await import("@/lib/steadfast.server");
        await applyCourierStatus(
          supabaseAdmin,
          {
            consignment_id: p.consignment_id != null ? String(p.consignment_id) : undefined,
            invoice: p.invoice != null ? String(p.invoice) : undefined,
          },
          p.status,
        );
        return json({ status: "success", message: "Webhook received successfully." });
      },
    },
  },
});

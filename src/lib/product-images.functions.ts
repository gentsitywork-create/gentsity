import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Only catalog image folders may be minted into view URLs. */
const PATH_ALLOWED = /^(?:M|L|XL|XXL|pajama|sneakers|sweatshirt|sweatshirt-combo|hoodie-combo|site)\//;

const schema = z.array(z.string().min(1).max(300)).max(300);

/**
 * Mint short-lived view URLs for product images on the server. The bucket
 * stays private: visitors and admins never receive blanket read access, this
 * function only signs whitelisted catalog paths.
 */
export const getProductImageUrls = createServerFn({ method: "POST" })
  .validator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<Record<string, string>> => {
    const paths = data.filter((p) => PATH_ALLOWED.test(p));
    if (paths.length === 0) return {};
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.storage
      .from("products")
      .createSignedUrls(paths, 3600);
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    (rows ?? []).forEach((row) => {
      if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
    });
    return map;
  });

import { supabase } from "@/integrations/supabase/client";

/**
 * Product images live in the public "products" bucket and are served by
 * permanent public URLs instead of short-lived signed URLs. Mapping is
 * synchronous; paths that are empty are skipped.
 */
export function productImageUrls(paths: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const path of paths) {
    if (!path) continue;
    map[path] = supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
  }
  return map;
}

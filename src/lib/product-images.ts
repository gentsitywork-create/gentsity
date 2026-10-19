import { getProductImageUrls } from "@/lib/product-images.functions";

/**
 * Browser helper: returns a map of storage path -> view URL for product
 * images. The "products" bucket is private; URLs are minted server-side by
 * getProductImageUrls, so no broad storage read access is needed.
 */
export async function productImageUrls(paths: string[]): Promise<Record<string, string>> {
  const usable = paths.filter((p): p is string => Boolean(p));
  if (usable.length === 0) return {};
  return getProductImageUrls({ data: usable });
}

// ============= Full file contents =============

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Sweatshirt (and pajama) products share one `pajama_products` table distinguished by the `page` column (`'pajama'` | `'sweatshirt'`); per-size stock lives in `pajama_product_stock`. Product images live in the private `products` storage bucket; image view URLs are minted server-side by `getProductImageUrls` (`src/lib/product-images.functions.ts`, whitelist: polo size folders, per-page `products/` folders, `site/`) and consumed via `productImageUrls` (`src/lib/product-images.ts`). There is no blanket anon/authenticated SELECT policy on `storage.objects` — adding one reintroduces the security finding; when adding a new product page, extend the whitelist prefix. Why: one catalog schema powers all pages, and the private bucket keeps storage access audit-tight.
- Sweatshirt combo uses its own `sweatshirt_combo` catalog page and order type in the existing catalog/stock tables; shared offer validation lives in a browser-safe rules module. Why: independent uploads and stock preserve the other offers.
- Mount the bilingual Bangladesh-time clock once in the root layout after hydration. Why: every page displays consistent time without server/client rendering mismatches.
- Ad-source tracking: landing with `?utm_source=...` stores a `gt_src` cookie (src/lib/traffic-source.ts, captured in root layout); order server functions read that cookie (fallback: referrer) into `orders.source` — never trust a client-sent `source` field. Why: lets the admin attribute each order to Facebook/TikTok/YouTube without per-page payload changes.
- Admin orders load lightweight history for global filters/counts and fetch full order items only for the visible page or explicit export/print actions. Why: avoid rendering and repeatedly downloading the full detailed history while preserving complete totals and bulk operations.
- Scope admin palette tokens and presentation rules under `.admin-shell` in the global stylesheet. Why: admin appearance can evolve without changing storefront colors or order logic.

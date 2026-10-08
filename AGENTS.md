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

- Sweatshirt (and pajama) products share one `pajama_products` table distinguished by the `page` column (`'pajama'` | `'sweatshirt'`); per-size stock lives in `pajama_product_stock`. Product images are served from the `products` storage bucket under `sweatshirt/products/...` via signed URLs. Why: one catalog schema powers both pages' product grid, stock, and admin stock pages.

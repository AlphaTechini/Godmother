# shop

Product page reading and currency conversion.

**Decisions and tradeoffs:** Reads standard page metadata instead of per-shop scrapers, so it works widely but some shops give no price.

## Files

- [fx.ts](fx.ts): Currency conversion for shopping prices.
- [product.ts](product.ts): Fetches a product page and reads its image and price.

## Where to look

To find the fx logic visit [fx.ts](fx.ts).

To find the product logic visit [product.ts](product.ts).

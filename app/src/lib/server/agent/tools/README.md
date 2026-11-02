# tools

The agent's 15 tools.

**Decisions and tradeoffs:** Tools validate their input and enforce the rules in code, so a wrong model call fails safely instead of spending units.

## Files

- [event.ts](event.ts): Event and location tools.
- [finishing.ts](finishing.ts): analyze_face, list_hairstyles, finish_look.
- [index.ts](index.ts): The tool registry.
- [looks.ts](looks.ts): propose_looks, revise_look, decide.
- [portrait-crop.ts](portrait-crop.ts): The face panel's backup.
- [products.ts](products.ts): search_products and design_garment.
- [schemas.ts](schemas.ts): JSON-schema fragments shared by the tool definitions (strict shape.
- [shopping.ts](shopping.ts): build_shopping_list.
- [types.ts](types.ts): Shared shapes for tool definitions, plus the small validation toolkit the tools use.
- [wardrobe.ts](wardrobe.ts): request_photos, catalog_wardrobe, suggest_replies.
- [youcam-errors.ts](youcam-errors.ts): Turns YouCam errors into messages for the agent and small asset helpers.

## Where to look

To find the event logic visit [event.ts](event.ts).

To find the finishing logic visit [finishing.ts](finishing.ts).

To find the index logic visit [index.ts](index.ts).

To find the looks logic visit [looks.ts](looks.ts).

To find the portrait-crop logic visit [portrait-crop.ts](portrait-crop.ts).

To find the products logic visit [products.ts](products.ts).

To find the schemas logic visit [schemas.ts](schemas.ts).

To find the shopping logic visit [shopping.ts](shopping.ts).

To find the types logic visit [types.ts](types.ts).

To find the wardrobe logic visit [wardrobe.ts](wardrobe.ts).

To find the youcam-errors logic visit [youcam-errors.ts](youcam-errors.ts).

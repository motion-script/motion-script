// Minimal ESM resolve hook so `node` can run the TypeScript build scripts in
// `lib/` without a bundler. The data-layer modules (lib/docs.ts, lib/api.ts, …)
// use extensionless relative imports (the TS / Next convention), which Node's
// ESM resolver rejects. This hook appends `.ts` to bare relative specifiers that
// have no extension, then falls back to default resolution.
//
// Preloaded via `node --import ./scripts/ts-resolve.mjs` together with Node's
// built-in type stripping (default on Node 24). No npm dependency required.

import { register } from "node:module"
import { pathToFileURL } from "node:url"

register(
  // Inline data: module exporting the resolve hook, registered against this file.
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if ((specifier.startsWith('./') || specifier.startsWith('../')) &&
            !/\\.[a-zA-Z0-9]+$/.test(specifier)) {
          try {
            return await next(specifier + '.ts', context)
          } catch {
            // fall through to default resolution below
          }
        }
        return next(specifier, context)
      }
    `),
  pathToFileURL("./"),
)

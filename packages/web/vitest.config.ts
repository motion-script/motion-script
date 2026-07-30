import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
    resolve: {
        // Mirror the tsconfig `@/* -> ./src/*` path mapping (resolved by
        // tsc-alias at build time) so tests can import via the `@` alias too.
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    // @motion-script/canvaskit ships a UMD/CommonJS bundle. Force vite to
    // pre-bundle it (it isn't auto-discovered because it's a symlinked
    // workspace package) so esbuild synthesizes the ESM default export the
    // source imports as `CanvasKitInit`.
    //
    // `three` is here for a different reason: the 3D backend reaches it through a
    // bare `import("three")` so 2D-only consumers never bundle it, which means
    // Vite can't see the dependency until a test actually loads it. It would then
    // re-optimize mid-run and reload the page, failing the in-flight dynamic
    // import with a 504. (The dev server hits the same problem — see
    // `optimizeDeps.include` in vite-plugin.)
    //
    // Note `three` is a runtime dependency of @motion-script/skia-render, not of
    // this package — but it is a *devDependency* here, because pre-bundling it
    // requires resolving it from this package's own root and pnpm's non-hoisted
    // layout won't reach a nested package's dependency. Without that devDep this
    // entry fails with "Failed to resolve dependency: three".
    // `mediabunny` is here for the same reason as `three`, one level removed: it's
    // a real dependency of `storage-adapter.ts`, but no test imported that module
    // until the video-window suite did, so Vite discovered it mid-run and reloaded
    // the page ("Vite unexpectedly reloaded a test").
    optimizeDeps: {
        include: ["@motion-script/canvaskit", "three", "mediabunny"],
    },
    test: {
        include: ["test/**/*.test.ts"],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
        },
        testTimeout: 30_000,
    },
});

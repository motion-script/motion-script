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
    optimizeDeps: {
        include: ["@motion-script/canvaskit"],
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

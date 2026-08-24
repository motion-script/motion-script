// eslint.config.js
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { defineConfig, globalIgnores } from "eslint/config";

// A "barrel import" is any import that resolves to an `index.ts`/`index.js`
// file. Non-barrel source files must import the concrete module
// (e.g. "@/shapes/rect"), never the barrel (e.g. "@/shapes"), to preserve
// tree-shaking and avoid circular dependencies.
const BARREL_FORBID = ["**/index.ts", "**/index.js"];

// This package must stay backend-agnostic: it may only touch the CanvasKit/Skia
// JS API and `@motion-script/core`. Everything platform-specific — surface
// creation, image/video/audio decode, encoding, clocks — arrives through an
// injected seam so a non-browser backend can supply its own.
//
// `tsconfig.base.json` sets no `lib`, so `lib.dom` is implicitly included and
// `document.createElement(...)` would otherwise typecheck silently. Narrowing
// `lib` to ES2022 isn't an option: three.js's own declarations reference DOM
// types (e.g. `WebGLRenderer`), which this package names in the `View3DHost`
// seam. So the boundary is enforced here instead, on actual *usage*, which is
// what matters. `build` runs `eslint .` first, so a violation fails the build.
const BROWSER_GLOBALS = [
    "document",
    "window",
    "navigator",
    "location",
    "fetch",
    "Image",
    "ImageData",
    "ImageBitmap",
    "createImageBitmap",
    "OffscreenCanvas",
    "HTMLCanvasElement",
    "CanvasRenderingContext2D",
    "AudioContext",
    "OfflineAudioContext",
    "AudioBuffer",
    "VideoFrame",
    "VideoDecoder",
    "VideoEncoder",
    "Blob",
    "FileReader",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "devicePixelRatio",
    "atob",
    "btoa",
    "alert",
].map(name => ({
    name,
    message:
        `\`${name}\` is a browser API — @motion-script/skia-render must stay backend-agnostic. ` +
        `Take it as an injected seam (see the platform interfaces in src/platform/) and let ` +
        `@motion-script/web supply the browser implementation.`,
}));

export default defineConfig([
    globalIgnores(["dist"]),
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
        },
        plugins: {
            "@typescript-eslint": tseslint.plugin,
            "import-x": importX,
        },
        settings: {
            "import-x/resolver-next": [
                createTypeScriptImportResolver({
                    project: "./tsconfig.json",
                }),
            ],
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "none",
                    varsIgnorePattern: "^_",
                    caughtErrors: "none",
                },
            ],

            // The backend-agnostic boundary (see BROWSER_GLOBALS above).
            "no-restricted-globals": ["error", ...BROWSER_GLOBALS],

            // An upward import would be a package cycle. `import-x/no-cycle` sets
            // `ignoreExternal: true`, so it will NOT catch this — without this rule
            // the only symptom is a confusing tsc project-reference error.
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@motion-script/web", "@motion-script/web/*"],
                            message:
                                "skia-render must not depend on web — that's a package cycle. " +
                                "Invert the seam instead (see three/renderer-seam.ts for the pattern).",
                        },
                    ],
                },
            ],
            // `URL` itself is fine (Node has it); the object-URL helpers are not.
            "no-restricted-properties": [
                "error",
                {
                    object: "URL",
                    property: "createObjectURL",
                    message: "Object URLs are browser-only — return bytes and let the backend deliver them.",
                },
                {
                    object: "URL",
                    property: "revokeObjectURL",
                    message: "Object URLs are browser-only — return bytes and let the backend deliver them.",
                },
            ],

            // Barrel imports (resolved-path based — see BARREL_FORBID above).
            "import-x/no-internal-modules": ["error", { forbid: BARREL_FORBID }],

            "import-x/no-cycle": ["error", { ignoreExternal: true }],
            "import-x/no-self-import": "error",
            "import-x/no-useless-path-segments": ["error", { noUselessIndex: true }],
            "import-x/no-duplicates": "error",
            "import-x/no-unresolved": "error",
        },
    },
    {
        // Barrel files legitimately re-export from other modules — exempt them
        // from the barrel-import restriction (every other rule still applies).
        files: ["**/index.ts"],
        rules: {
            "import-x/no-internal-modules": "off",
        },
    },
]);

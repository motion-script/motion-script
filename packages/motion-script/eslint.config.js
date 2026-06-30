// eslint.config.js
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { defineConfig, globalIgnores } from "eslint/config";

// A "barrel import" is any import that resolves to an `index.ts`/`index.js`
// file. Non-barrel source files must import the concrete module
// (e.g. "@/render/render-context"), never the barrel (e.g. "@/render"), to
// preserve tree-shaking and avoid circular dependencies.
//
// `import-x/no-internal-modules` matches its `forbid` patterns against the
// RESOLVED absolute path, so it catches barrels uniformly no matter how the
// import is written — alias ("@/render"), relative ("../../filters"), or an
// explicit "./foo/index" — while still allowing direct file imports beneath a
// barrel directory.
const BARREL_FORBID = ["**/index.ts", "**/index.js"];

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
      // Resolve "@/*" aliases (from tsconfig paths), relative imports and
      // extensionless TS files so import-x rules operate on real file paths.
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          project: "./tsconfig.json",
        }),
      ],
    },
    rules: {
      // Fail on unused imports / variables. Underscore-prefixed args/vars are
      // treated as intentionally unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],

      // Barrel imports (resolved-path based — see BARREL_FORBID above).
      "import-x/no-internal-modules": ["error", { forbid: BARREL_FORBID }],

      // Reinforce the same goals the barrel ban targets.
      "import-x/no-cycle": ["error", { ignoreExternal: true }],
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": ["error", { noUselessIndex: true }],
      "import-x/no-duplicates": "error",
      "import-x/no-unresolved": "error",
    },
  },
  {
    // Barrel files legitimately re-export from other modules — exempt them from
    // the barrel-import restriction (every other rule still applies).
    files: ["**/index.ts"],
    rules: {
      "import-x/no-internal-modules": "off",
    },
  },
]);

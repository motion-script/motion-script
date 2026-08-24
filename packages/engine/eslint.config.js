// eslint.config.js
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // Fail on unused imports / variables, but never on unused *parameters*:
      // an overridable hook is routinely empty (`prepareLayout(tracker) {}`),
      // and renaming its parameter to `_tracker` just to satisfy the linter
      // hides the real name from anyone overriding it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "none",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
]);

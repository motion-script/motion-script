import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),

  // Library + examples: TypeScript + React Hooks correctness, strict unused-code
  // hygiene so nothing dead ships in the published bundle.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Fail on unused imports/vars; underscore-prefixed args/vars are
      // treated as intentionally unused. Keeps the tree-shakable surface honest.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // Prefer `import type` so type-only imports are erased and never pull
      // runtime code into a consumer's bundle.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // The components deliberately use the "latest-ref" idiom (writing
      // ref.current during render to track the freshest callback) and a
      // reset-on-prop-change effect. These newer react-hooks heuristics flag
      // those working patterns; keep them visible as warnings rather than
      // blocking the build. rules-of-hooks / exhaustive-deps still apply.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  // react-refresh is a dev-server (HMR) concern — only relevant to the runnable
  // playground, not the published library.
  {
    files: ['examples/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite],
  },
])

import { defineConfig } from 'vite'
import path from 'path';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => {
  const isServe = command === 'serve';

  return {
    base: './',
    root: isServe ? path.resolve(__dirname, 'examples') : __dirname,
    publicDir: isServe ? path.resolve(__dirname, 'public') : false,
    plugins: [
      react(),
      tailwindcss(),
      ...(isServe
        ? []
        : [
            dts({
              tsconfigPath: './tsconfig.build.json',
              entryRoot: 'src',
            }),
          ]),
    ],

    // canvaskit.js is CJS-only (no ESM default export); pre-bundling it through
    // esbuild's CJS->ESM interop synthesizes the default export getter.ts expects.
    optimizeDeps: {
      include: ['@motion-script/canvaskit'],
    },

    server: {
      port: 5174,
      fs: {
        allow: [
          path.resolve(__dirname, '..', '..'),
        ],
      },
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    },

    build: {
      target: 'esnext',
      minify: false,
      sourcemap: true,
      lib: {
        entry: {
          'motion-script-player': 'src/index.ts',
        },
        formats: ['es'],
      },
      rolldownOptions: {
        external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', /use-sync-external-store/],
        output: {
          assetFileNames: 'motion-script-player[extname]',
        },
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
})

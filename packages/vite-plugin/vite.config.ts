import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const PLUGIN_APP_EXCLUDE = new Set([
    'node_modules',
    'dist',
    '.git',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lockb',
    '.DS_Store',
]);

function copyPluginApp(): import('vite').Plugin {
    return {
        name: 'copy-plugin-app',
        closeBundle() {
            const src = path.resolve(__dirname, 'plugin-app');
            const dest = path.resolve(__dirname, 'dist/plugin-app');
            fs.cpSync(src, dest, {
                recursive: true,
                filter: (srcPath) => {
                    const name = path.basename(srcPath);
                    return !PLUGIN_APP_EXCLUDE.has(name);
                },
            });
        },
    };
}

export default defineConfig({
    plugins: [
        dts({
            include: ['index.ts', 'src/**/*.ts'],
            outDir: 'dist',
            rollupTypes: true,
        }),
        copyPluginApp(),
    ],
    build: {
        lib: {
            entry: path.resolve(__dirname, 'index.ts'),
            formats: ['es'],
            fileName: 'index',
        },
        rollupOptions: {
            external: [
                'vite',
                '@vitejs/plugin-react',
                'fontkit',
                'image-size',
                'music-metadata',
                'node:path',
                'node:fs',
                'node:url',
                'node:module',
            ],
        },
        outDir: 'dist',
        emptyOutDir: true,
    },
});

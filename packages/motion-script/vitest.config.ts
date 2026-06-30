import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    test: {
        include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        environment: 'node',
        typecheck: {
            tsconfig: './tsconfig.test.json',
        },
    },
});

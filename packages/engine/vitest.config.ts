import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Node-only unit tests: the pure logic (frame selectors, option
        // validation, the session queue) that does not need a browser. The
        // render path itself is covered end-to-end by packages/e2e.
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});

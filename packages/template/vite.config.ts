import { defineConfig } from 'vite';
import motionScript from '@motion-script/vite-plugin';

export default defineConfig({
  plugins: [motionScript()],
  server: {
    port: 5173,
  },
});

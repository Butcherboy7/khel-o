import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Lets a .tsx component be rendered in a test without importing React by hand.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});

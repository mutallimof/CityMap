import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/ (set by the deploy workflow).
  base: process.env.BASE ?? '/',
  plugins: [react()],
  // GeoJSON data files are fetched at runtime (`?url` imports), not bundled into JS.
  assetsInclude: ['**/*.geojson'],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});

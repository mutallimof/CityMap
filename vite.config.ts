import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/ (set by the deploy workflow).
  base: process.env.BASE ?? '/',
  plugins: [react()],
  // GeoJSON data files are fetched at runtime (`?url` imports), not bundled into JS.
  assetsInclude: ['**/*.geojson'],
  build: {
    // Big libraries in their own chunks: they change rarely (cached across deploys) and load in parallel;
    // the app chunk stays small. Theme assets (fonts, the toy scenery layer) are split by dynamic imports.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ },
            { name: 'three', test: /node_modules[\\/]three/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1100,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});

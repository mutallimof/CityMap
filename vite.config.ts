import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// App name, public URL and the Pages base path live in site.json (one place).
const site = JSON.parse(readFileSync(new URL('./site.json', import.meta.url), 'utf8')) as { base: string };

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the app under site.base; dev serves at /. BASE overrides both.
  base: process.env.BASE ?? (command === 'build' || isPreview ? site.base : '/'),
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
}));

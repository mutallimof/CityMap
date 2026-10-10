import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GeoJSON data files are fetched at runtime (`?url` imports), not bundled into JS.
  assetsInclude: ['**/*.geojson'],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});

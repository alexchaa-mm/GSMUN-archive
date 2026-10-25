import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'emit-mint-asset-registry',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'mint-assets.json',
          source: readFileSync(new URL('./mint-assets.json', import.meta.url), 'utf8'),
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});

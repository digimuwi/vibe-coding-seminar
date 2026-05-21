import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built app works under any subpath
  // (e.g. when served from the seminar GitHub Pages site).
  base: './',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  optimizeDeps: {
    // Verovio bundles its own WASM — pre-bundling breaks the WASM loading path
    exclude: ['verovio'],
  },
  worker: {
    format: 'es',
  },
})

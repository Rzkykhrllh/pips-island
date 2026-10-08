import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build:single` inlines everything into one index.html (handy for quick sharing).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    // three.js + React Three Fiber in their own long-cached chunk: editing the
    // island doesn't change its hash, so returning visitors keep it. It's big
    // by nature (R3F registers all of three), hence the raised warning limit.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        advancedChunks: {
          // React first, or it gets swept into the three chunk as a dependency of
          // R3F and the page would have to download three.js before it can render
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: 'three', test: /node_modules[\\/](three|@react-three)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
}))

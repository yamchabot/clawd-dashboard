import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    allowedHosts: true,
    hmr: false, // Disable HMR - no live reload through the tunnel, but app works fine
  },
})

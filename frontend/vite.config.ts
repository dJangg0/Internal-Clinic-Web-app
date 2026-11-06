import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3001'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})

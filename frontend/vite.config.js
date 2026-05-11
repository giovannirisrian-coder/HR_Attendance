import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

<<<<<<< HEAD
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://ls-attendance-api.it-smm.id/api',
        changeOrigin: true,
=======
function devProxyTarget(apiBase) {
  const raw = (apiBase || '').trim() || 'http://127.0.0.1:3000'
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).origin
    }
  } catch {
    // ignore
  }
  return 'http://127.0.0.1:3000'
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = devProxyTarget(env.VITE_API_BASE_URL)

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
>>>>>>> 6d6af2d0fceba25586b09f0e16e211d944891e1f
      },
    },
  }
})

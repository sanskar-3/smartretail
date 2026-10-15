import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = process.env.PORT || env.PORT || '3000'
  const apiUrl = `http://127.0.0.1:${apiPort}`

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] })
    ],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': apiUrl,
        '/socket.io': {
          target: apiUrl,
          ws: true,
        },
      },
    },
  }
})

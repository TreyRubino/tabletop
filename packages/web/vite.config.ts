import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ProxyOptions } from 'vite'

/* The table server may not be listening yet, or may have exited. Either
   way a stack trace per retry buries the real error, which is printed by
   the server itself. One quiet line is enough. */
const quiet = (label: string): ProxyOptions['configure'] => proxy => {
  let warned = false
  proxy.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ECONNRESET') return
    if (warned) return
    warned = true
    console.log(`  [${label}] no table server on :8080 yet \u2014 retrying quietly`)
    setTimeout(() => { warned = false }, 5000)
  })
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,               // players reach it over the LAN
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true, configure: quiet('ws') },
      '/assets': { target: 'http://localhost:8080', configure: quiet('assets') },
    },
  },
})

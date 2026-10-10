import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

function buildId() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'public', 'version.json'), 'utf8')
    return JSON.parse(raw).id || ''
  } catch {
    return ''
  }
}
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  plugins: [react()],
  base: './',
})

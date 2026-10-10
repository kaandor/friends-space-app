import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const stamp = { id: new Date().toISOString(), v: 1 }
try {
  const prev = JSON.parse(fs.readFileSync(path.join(root, 'public', 'version.json'), 'utf8'))
  stamp.v = (Number(prev.v) || 0) + 1
} catch {}
fs.writeFileSync(path.join(root, 'public', 'version.json'), JSON.stringify(stamp) + '\n')
console.log('version:', stamp.id, 'v' + stamp.v)

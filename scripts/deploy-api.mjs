// Deploy da API no Firebase Cloud Functions.
// Uso: npm run deploy:api
// - Copia api/app.js para firebase-functions/app.js (o Firebase so envia a
//   pasta de source, entao o handler precisa estar dentro dela).
// - Instala as dependencias de firebase-functions/ se faltarem.
// - Autentica com service-account.json (se existir) ou com o login do
//   firebase-tools (npx firebase login).
// Requer plano Blaze no projeto (a cota gratis cobre o uso normal).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'friendsspace-6eb40'
const SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT || 'service-account.json'
const TARGET_DIR = 'firebase-functions'

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, ...options })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const banner = '// GERADO por scripts/deploy-api.mjs (copia de api/app.js) — NAO EDITE AQUI.\n'
writeFileSync(join(TARGET_DIR, 'app.js'), banner + readFileSync('api/app.js', 'utf8'))
console.log(`[api] ${TARGET_DIR}/app.js sincronizado com api/app.js`)

if (!existsSync(join(TARGET_DIR, 'node_modules'))) {
  console.log(`[api] instalando dependencias em ${TARGET_DIR}/ ...`)
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: TARGET_DIR })
}

const env = { ...process.env }
if (!env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(SERVICE_ACCOUNT)) {
  env.GOOGLE_APPLICATION_CREDENTIALS = SERVICE_ACCOUNT
  console.log(`[api] usando conta de servico: ${SERVICE_ACCOUNT}`)
} else if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.log('[api] sem service-account.json — usando o login do firebase-tools (npx firebase login)')
}

const bin = join('node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase')
run(`"${bin}"`, ['deploy', '--only', 'functions', '--project', PROJECT_ID], { env })

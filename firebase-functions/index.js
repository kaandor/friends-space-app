// Backend do Friends Space no Firebase Cloud Functions (v2).
// O handler e o MESMO da api/app.js (importado como ./app.js, copiado no deploy
// pelo script scripts/deploy-api.mjs) — evita manter duas versoes da API.
// A pasta chama-se firebase-functions/ (e nao functions/) de proposito: a
// pasta functions/ e das Cloudflare Pages Functions (payments do Pages).
import { onRequest } from 'firebase-functions/v2/https'
import handler from './app.js'

export const api = onRequest({
  region: 'southamerica-east1',
  memory: '512MiB',
  timeoutSeconds: 120,
  maxInstances: 5,
  concurrency: 40,
  cors: false,
  invoker: 'public',
}, async (req, res) => {
  await handler(req, res)
})

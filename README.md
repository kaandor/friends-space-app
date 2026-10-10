# Friends Space

App React + Vite com backend serverless em `api/app.js`, pronto para deploy na Vercel.

## Rodar localmente

```bash
npm install
npm run dev
```

## Deploy na Vercel

1. Suba este repositorio para GitHub/GitLab/Bitbucket.
2. Importe o repositorio na Vercel como projeto Vite.
3. A configuracao ja esta em `vercel.json`:

```txt
Build command: npm run build
Output directory: dist
Development command: npm run dev
```

4. Configure as variaveis de ambiente na Vercel:

```env
VITE_GOOGLE_CLIENT_ID=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

5. Para dados persistentes em producao, crie um Vercel KV/Upstash Redis e configure as variaveis acima.

6. No Google Cloud Console, adicione o dominio da Vercel em Authorized JavaScript origins:

```txt
https://seu-projeto.vercel.app
```

7. Para desenvolvimento local, mantenha tambem:

```txt
http://localhost:5173
```

Sem essas variaveis, a API usa arquivo temporario. Isso serve para teste local/preview, mas nao e armazenamento duravel em producao.

## Recursos conectados ao backend

- criacao e edicao de perfil
- login somente com Google
- codigo de amigo
- adicionar amigo pelo codigo
- criacao e entrada em servidores por convite
- canais, cargos e membros
- mensagens de canais e mensagens diretas

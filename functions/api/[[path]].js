// Proxy para o backend real (api/app.js) publicado no Vercel.
// Permite que o app seja servido pelo Cloudflare Pages (friends-space.pages.dev)
// enquanto o processamento continua no backend completo.
const TARGET = "https://friends-space-ecru.vercel.app/api/app";

const ALLOWED_ORIGINS = new Set([
  "https://friends-space.pages.dev",
  "https://friends-space-ecru.vercel.app",
]);

function corsFor(request) {
  const origin = request.headers.get("origin") || "";
  // Sem Origin (curl, app nativo): permite — navegador exige Origin e é validado.
  const allow = !origin || ALLOWED_ORIGINS.has(origin);
  return {
    "access-control-allow-origin": allow ? origin || "*" : "null",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(request) });
  }

  const targetUrl = new URL(TARGET);
  const incoming = new URL(request.url);

  // Token de sessão nunca viaja na query (logs): move para o body.
  const queryToken = incoming.searchParams.get("sessionToken") || "";
  if (queryToken) incoming.searchParams.delete("sessionToken");

  // repassa query string restante (ex.: ?profileId=..&health=1&_ts=..)
  targetUrl.search = incoming.search;

  const init = {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      // IP real do visitante para rate-limit/ban (Cloudflare fornece).
      "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
      "x-forwarded-for": request.headers.get("x-forwarded-for") || "",
      "x-real-ip": request.headers.get("x-real-ip") || "",
    },
  };

  if (request.method === "POST") {
    const buf = await request.arrayBuffer();
    if (queryToken) {
      try {
        const obj = JSON.parse(new TextDecoder().decode(buf));
        if (obj && typeof obj === "object" && !obj.sessionToken) obj.sessionToken = queryToken;
        init.body = new TextEncoder().encode(JSON.stringify(obj));
      } catch {
        init.body = buf;
      }
    } else {
      init.body = buf;
    }
  }

  const upstream = await fetch(targetUrl.toString(), init);

  const upstreamBody = await upstream.arrayBuffer();
  return new Response(upstreamBody, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsFor(request),
    },
  });
}

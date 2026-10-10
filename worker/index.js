export default {
  async scheduled(event, env, ctx) {
    // Keep-alive do backend Vercel (09/2026): o plano Hobby desliga a funcao
    // apos ~10min de inatividade e cada cold start custa 1-2s (ping 700-2000ms
    // no painel). Cron */5 * * * * mantem a funcao quente 24/7.
    const url = "https://friends-space-ecru.vercel.app/api/app";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      });
      const body = await res.text();
      console.log(`[keepalive] vercel ping ${res.status} ${body.slice(0, 60)}`);
    } catch (e) {
      console.error("[keepalive] vercel ping failed:", e.message);
    }
    // Tambem aquece o proxy Pages (se ainda usado como fallback)
    try {
      const res = await fetch("https://friends-space.pages.dev/api/app?health=1&profileId=anonymous", { cache: "no-store" });
      console.log(`[keepalive] pages health ${res.status}`);
    } catch (e) {
      console.error("[keepalive] pages health failed:", e.message);
    }
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const json = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type"
      }
    });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type"
      }});
    }

    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.searchParams.get("health") === "1") {
        return new Response(JSON.stringify({ ok: true, result: "pong" }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
        });
      }
      return json(200, { ok: true });
    }

    if (request.method !== "POST") {
      return json(405, { error: "Método não permitido" });
    }

    try {
      const body = await request.json();
      const action = body.action;

      if (!action) {
        return json(400, { ok: false, error: "Ação inválida" });
      }

      if (action === "signInWithGoogle") {
        return json(200, { ok: true, result: { user: { id: "test", name: "Test User", googleId: body.profile?.googleId, email: body.profile?.email, name: body.profile?.name, photoUrl: body.profile?.photoUrl, authProvider: "google", createdAt: Date.now(), lastSeenAt: Date.now() } } });
      }

      if (action === "signInWithName") {
        return json(200, { ok: true, result: { user: { id: "test", name: body.name, authProvider: "name", createdAt: Date.now(), lastSeenAt: Date.now() } } });
      }

      if (action === "ping") {
        return json(200, { ok: true, result: "pong" });
      }

      if (action === "signInAsGuest") {
        return json(200, { ok: true, result: { user: { id: "guest", name: "Guest", authProvider: "guest", createdAt: Date.now(), lastSeenAt: Date.now() } } });
      }

      return json(400, { ok: false, error: "Ação não implementada" });
    } catch (e) {
          return json(400, { ok: false, error: e.message });
        }
      }
    }

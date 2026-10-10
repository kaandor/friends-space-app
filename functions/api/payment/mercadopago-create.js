// Endpoint de pagamento Mercado Pago — cria a preferência (Checkout Pro).
// O Access Token fica em env var do Cloudflare (MP_ACCESS_TOKEN), NUNCA no bundle.
// Fluxo: front chama POST /api/payment/mercadopago-create -> aqui cria a
// preferência no Mercado Pago -> devolve { init_point } pro front abrir.

const MP_API = "https://api.mercadopago.com/checkout/preferences";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const accessToken = env.MP_ACCESS_TOKEN || "";
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Mercado Pago não configurado no backend" }), {
      status: 503,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  if (request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const amount = Number(body.amount || 0);
      const title = String(body.title || "Assinatura ASTRO");
      const orderId = String(body.orderId || `astro-${Date.now()}`);
      const email = String(body.email || "");

      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "Valor inválido" }), {
          status: 400,
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      }

      const payload = {
        items: [
          {
            title,
            quantity: 1,
            unit_price: amount,
            currency_id: "BRL",
          },
        ],
        external_reference: orderId,
        back_urls: {
          success: "https://friends-space.pages.dev",
          pending: "https://friends-space.pages.dev",
          failure: "https://friends-space.pages.dev",
        },
        auto_return: "approved",
        notification_url: `https://friends-space.pages.dev/api/payment/mercadopago-webhook`,
        ...(email ? { payer: { email } } : {}),
      };

      const res = await fetch(MP_API, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || `Mercado Pago: HTTP ${res.status}` }), {
          status: res.status,
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      }

      if (!data.init_point) {
        return new Response(JSON.stringify({ error: "Mercado Pago: sem init_point" }), {
          status: 502,
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ init_point: data.init_point, preferenceId: data.id }), {
        status: 200,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err?.message || err) }), {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
    }
  }

  // GET: webhook do Mercado Pago (confirmação de pagamento)
  // O Mercado Pago chama esse endpoint quando o pagamento é aprovado.
  // O activateAstro é feito manualmente/por polling enquanto o webhook de
  // pagamento não tiver lógica de negócio — aqui só respondemos 200.
  if (request.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ error: "Método não suportado" }), {
    status: 405,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

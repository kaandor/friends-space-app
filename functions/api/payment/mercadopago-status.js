// Endpoint de STATUS do Mercado Pago — consulta se o pagamento da preferencia
// foi aprovado (via external_reference). O front faz polling deste endpoint apos
// abrir o Checkout Pro e SO ativa o ASTRO quando approved = true.
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
    return new Response(JSON.stringify({ error: "Mercado Pago não configurado" }), {
      status: 503,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  const url = new URL(request.url);
  const externalRef = String(url.searchParams.get("externalReference") || "");
  if (!externalRef) {
    return new Response(JSON.stringify({ error: "externalReference obrigatorio" }), {
      status: 400,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  try {
    // Busca pagamentos por external_reference na API do Mercado Pago
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}&limit=5&sort=date_created&criteria=desc`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json().catch(() => ({}));
    const results = Array.isArray(data.results) ? data.results : [];

    // Aprovado se existir pagamento com status approved (ou approved+pending para PIX apos aprovacao)
    const approved = results.some((p) => p && (p.status === "approved" || p.status === "authorized"));
    const status = results[0] ? results[0].status : "no_payment";

    return new Response(JSON.stringify({ approved, status, count: results.length }), {
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

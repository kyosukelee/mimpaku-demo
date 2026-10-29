// Cloudflare Pages Functions: POST /api/stay-code
// 滞在コードを、Supabaseのデータベース関数(verify_stay_code)で照合する。
// secret key はここ(Cloudflareの秘密の環境変数 SUPABASE_SECRET_KEY)にだけ置き、画面には出さない。

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function onRequestPost(context) {
  const { request, env } = context;
  // URLの末尾に / や /rest/v1 が付いていても動くようにする
  const base = String(env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = env.SUPABASE_SECRET_KEY;
  if (!base || !key) return json(500, { error: "not_configured" });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "bad_request" }); }
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || code.length > 40) return json(400, { error: "bad_request" });

  // 総当たりの防止は、接続元(IP)ごとにデータベース側で数える
  const ip = request.headers.get("CF-Connecting-IP") || "";

  // 新形式の secret key(sb_secret_...)はJWTではないので apikey ヘッダーだけで送る。
  // 従来の service_role キー(eyJ...)のときだけ Authorization も付ける。
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  // 失敗は error_logs に残す(滞在コードやIPは残さない)
  const logError = (detail) =>
    fetch(`${base}/rest/v1/rpc/log_error`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_source: "stay-code", p_kind: "upstream", p_model: "", p_detail: String(detail).slice(0, 500), p_retried: false }),
    }).catch(() => undefined);
  const later = (p) => (typeof context.waitUntil === "function" ? context.waitUntil(p) : p);

  let res;
  try {
    res = await fetch(`${base}/rest/v1/rpc/verify_stay_code`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_slug: slug, p_code: code, p_ip: ip }),
    });
  } catch (e) {
    await later(logError(`verify_stay_code に接続できない: ${e && e.message ? e.message : e}`));
    return json(502, { error: "upstream" });
  }
  if (!res.ok) {
    await later(logError(`verify_stay_code: HTTP ${res.status}`));
    return json(502, { error: "upstream" });
  }

  const r = await res.json();
  switch (r && r.status) {
    case "ok": return json(200, { items: Array.isArray(r.items) ? r.items : [] });
    case "invalid": return json(401, { error: "invalid" });
    case "locked": return json(429, { error: "locked" });
    case "not_found": return json(404, { error: "not_found" });
    default:
      await later(logError(`verify_stay_code の返事が想定外: ${String(r && r.status)}`));
      return json(502, { error: "upstream" });
  }
}

export async function onRequest() {
  return json(405, { error: "method_not_allowed" });
}

// ページを開いたときにSupabaseから最新の内容を取得して描画し直す。
// 環境変数が未設定、または取得に失敗したときは、ビルド時の静的な表示をそのまま残す。
import { closedMessage, renderPage } from "../lib/render";
import type { GuideData, ItemRow, Lang, Page, PropertyRow } from "../lib/guide";

const url = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

async function get<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    // 新形式のキー(sb_publishable_...)はJWTではないので、apikey ヘッダーだけで送る。
    // 従来のanonキー(eyJ...のJWT)のときだけ、Authorization も付ける。
    const headers: Record<string, string> = { apikey: key! };
    if (key!.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${url}/rest/v1/${path}`, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!url || !key) return;
  const { slug, lang, page, title } = document.body.dataset as {
    slug: string; lang: Lang; page: Page; title?: string;
  };
  const content = document.getElementById("content");
  if (!content) return;

  let property: PropertyRow | undefined;
  let items: ItemRow[];
  try {
    const props = await get<PropertyRow[]>(`properties?slug=eq.${encodeURIComponent(slug)}&select=*`);
    property = props[0];
    if (!property) {
      // 非公開(または存在しない)物件
      const hero = document.getElementById("hero");
      if (hero) hero.remove();
      content.innerHTML = `<h1 class="page">${closedMessage(lang)}</h1>`;
      return;
    }
    items = await get<ItemRow[]>(`guide_items?property_id=eq.${property.id}&select=*&order=sort_order.asc`);
  } catch (e) {
    console.warn("ガイドの最新データを取得できませんでした。保存済みの内容を表示します。", e);
    return;
  }

  const data: GuideData = { property, items };
  const out = renderPage(page, lang, data);
  content.innerHTML = out.main;
  const hero = document.getElementById("hero");
  if (hero && out.hero) hero.innerHTML = out.hero;

  const name = (lang === "en" ? property.name_en : "") || property.name_ja;
  const brand = document.querySelector<HTMLElement>("a.brand");
  if (brand) brand.textContent = name;
  document.title = (title ? title + " | " : "") + name;
}

main();

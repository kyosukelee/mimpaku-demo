// 1) ページを開いたときにSupabaseから最新の内容を取得して描画し直す。
//    環境変数が未設定、または取得に失敗したときは、ビルド時の静的な表示をそのまま残す。
// 2) チェックイン案内では、滞在コードを照合して、鍵やWi-Fiなど伏せた項目を表示する。
//    照合はサーバー側の関数(/api/stay-code)で行い、正しいコードの一覧は画面に渡さない。
import ui from "../i18n/ui.json";
import { closedMessage, renderPage } from "../lib/render";
import type { GuideData, ItemRow, Lang, Page, PropertyRow } from "../lib/guide";

const url = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

const { slug, lang, page, title } = document.body.dataset as { slug: string; lang: Lang; page: Page; title?: string };
const s = ui[lang];
const CODE_KEY = `stay-code:${slug}`;

let data: GuideData | null = readStatic();
let unlockedItems: ItemRow[] = [];
let unlockedState = false;

function readStatic(): GuideData | null {
  const el = document.getElementById("guide-static");
  if (!el?.textContent) return null;
  try { return JSON.parse(el.textContent) as GuideData; } catch { return null; }
}

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

function draw() {
  const content = document.getElementById("content");
  if (!content || !data) return;
  const unlocked = unlockedState;
  const merged: GuideData = {
    property: data.property,
    items: [...data.items.filter((i) => !i.requires_code), ...unlockedItems],
  };
  // 質問ページは、会話を消さないよう本文を描き直さない(物件名とタイトルだけ更新)
  if (page !== "ask") {
    const out = renderPage(page, lang, merged, { unlocked });
    content.innerHTML = out.main;
    const hero = document.getElementById("hero");
    if (hero && out.hero) hero.innerHTML = out.hero;
  }
  const name = (lang === "en" ? data.property.name_en : "") || data.property.name_ja;
  const brand = document.querySelector<HTMLElement>("a.brand");
  if (brand) brand.textContent = name;
  document.title = (title ? title + " | " : "") + name;
}

async function loadLive(): Promise<"ok" | "closed" | "failed"> {
  if (!url || !key) return "failed";
  try {
    const props = await get<PropertyRow[]>(`properties?slug=eq.${encodeURIComponent(slug)}&select=*`);
    const property = props[0];
    if (!property) return "closed";
    const items = await get<ItemRow[]>(`guide_items?property_id=eq.${property.id}&select=*&order=sort_order.asc`);
    data = { property, items };
    return "ok";
  } catch (e) {
    console.warn("ガイドの最新データを取得できませんでした。保存済みの内容を表示します。", e);
    return "failed";
  }
}

// ── 滞在コード ──────────────────────────────────────────
const storeCode = (c: string | null) => { try { if (c) localStorage.setItem(CODE_KEY, c); else localStorage.removeItem(CODE_KEY); } catch { /* 保存できなくても使える */ } };

function setMessage(text: string, busy = false) {
  const el = document.querySelector<HTMLElement>("#stay-code .code-msg");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("busy", busy);
}

async function unlock(code: string, silent: boolean) {
  if (!code.trim()) { if (!silent) setMessage(s.codeInvalid); return; }
  if (!silent) setMessage(s.codeChecking, true);
  let res: Response;
  try {
    res = await fetch("/api/stay-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, code }),
    });
  } catch {
    setMessage(s.codeError);
    return;
  }
  if (res.ok) {
    const body = (await res.json()) as { items?: ItemRow[] };
    unlockedItems = body.items ?? [];
    unlockedState = true;
    storeCode(code.trim());
    draw();
    return;
  }
  if (res.status === 401) {
    storeCode(null); // 期限切れ・まちがい: 端末に覚えたコードは消す
    setMessage(s.codeInvalid);
  } else if (res.status === 429) {
    setMessage(s.codeLocked);
  } else {
    setMessage(s.codeError);
  }
}

document.addEventListener("submit", (e) => {
  const form = (e.target as HTMLElement).closest?.("form[data-action='stay-code']") as HTMLFormElement | null;
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector<HTMLInputElement>("input[name='code']");
  void unlock(input?.value ?? "", false);
});

document.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest?.("[data-action='forget-code']");
  if (!btn) return;
  storeCode(null);
  unlockedItems = [];
  unlockedState = false;
  draw();
});

// ── AIに質問 ─────────────────────────────────────────────
let asking = false;

function appendMsg(kind: "you" | "ai", text: string, extra = ""): HTMLElement {
  const chat = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = `msg ${kind} ${extra}`.trim();
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = kind === "you" ? s.askYou : s.askAi;
  const body = document.createElement("span");
  body.textContent = text; // 文字として表示する(HTMLとして解釈しない)
  div.append(who, body);
  chat?.appendChild(div);
  div.scrollIntoView({ block: "nearest" });
  return div;
}

function addHelpLink(el: HTMLElement) {
  const a = document.createElement("a");
  a.href = `/p/${slug}/${lang}/help/`;
  a.textContent = s.askHelpLink;
  el.append(document.createElement("br"), a);
}

function setAskBusy(busy: boolean) {
  const btn = document.querySelector<HTMLButtonElement>("#ask-form button[type='submit']");
  if (btn) btn.disabled = busy;
  document.querySelectorAll<HTMLButtonElement>("[data-action='ask-example']").forEach((b) => (b.disabled = busy));
}

function updateCount() {
  const ta = document.getElementById("ask-input") as HTMLTextAreaElement | null;
  const el = document.querySelector<HTMLElement>(".ask-count");
  if (!ta || !el) return;
  el.textContent = `${ta.value.length}/300`;
  el.classList.toggle("over", ta.value.length > 300);
}

async function ask(question: string) {
  const q = question.trim();
  if (!q || asking) return;
  if (q.length > 300) { appendMsg("ai", s.askTooLong, "notice"); return; }
  asking = true;
  setAskBusy(true);
  appendMsg("you", q);
  const pending = appendMsg("ai", s.askThinking, "thinking");
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, lang, question: q }),
    });
    const body = (await res.json().catch(() => ({}))) as { answer?: string; kind?: string; error?: string };
    pending.remove();
    if (res.ok && body.answer) {
      appendMsg("ai", body.answer, body.kind === "emergency" ? "emergency" : "");
    } else if (res.status === 429) {
      addHelpLink(appendMsg("ai", body.error === "limited_day" ? s.askLimitedDay : s.askLimitedIp, "notice"));
    } else if (body.error === "too_long") {
      appendMsg("ai", s.askTooLong, "notice");
    } else {
      addHelpLink(appendMsg("ai", s.askError, "notice"));
    }
  } catch {
    pending.remove();
    addHelpLink(appendMsg("ai", s.askError, "notice"));
  } finally {
    asking = false;
    setAskBusy(false);
  }
}

document.addEventListener("submit", (e) => {
  const form = (e.target as HTMLElement).closest?.("form[data-action='ask']") as HTMLFormElement | null;
  if (!form) return;
  e.preventDefault();
  const ta = form.querySelector<HTMLTextAreaElement>("textarea");
  const q = ta?.value ?? "";
  if (ta && q.trim() && q.trim().length <= 300) ta.value = "";
  updateCount();
  void ask(q);
});

document.addEventListener("click", (e) => {
  const chip = (e.target as HTMLElement).closest?.("[data-action='ask-example']") as HTMLButtonElement | null;
  if (chip) void ask(chip.textContent ?? "");
});

document.addEventListener("input", (e) => {
  if ((e.target as HTMLElement).id === "ask-input") updateCount();
});

async function main() {
  const live = await loadLive();
  if (live === "closed") {
    const content = document.getElementById("content");
    document.getElementById("hero")?.remove();
    if (content) content.innerHTML = `<h1 class="page">${closedMessage(lang)}</h1>`;
    return;
  }
  if (live === "ok") draw();
  if (page === "checkin") {
    let stored: string | null = null;
    try { stored = localStorage.getItem(CODE_KEY); } catch { stored = null; }
    if (stored) await unlock(stored, true);
  }
}

void main();

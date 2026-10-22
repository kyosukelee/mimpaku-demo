import ui from "../i18n/ui.json";
import type { GuideData, ItemRow, Lang, Page } from "./guide";

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// 選んだ言語の文章が空なら日本語で補う(英語が未入力でも空白にしない)
const pick = (row: any, key: string, lang: Lang): string =>
  (row[`${key}_${lang}`] || row[`${key}_ja`] || "") as string;

const lines = (s: string) =>
  s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

const mapUrl = (q: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

export const pageUrl = (slug: string, lang: Lang, page: Page) =>
  `/p/${slug}/${lang}/${page === "home" ? "" : page + "/"}`;

const paragraphs = (s: string) =>
  lines(s).map((l) => `<p>${esc(l)}</p>`).join("");

function renderBody(item: ItemRow, lang: Lang): string {
  const body = pick(item, "body", lang);
  const s = ui[lang];
  switch (item.display) {
    case "steps":
      return `<ol class="steps">${lines(body).map((l) => `<li>${esc(l)}</li>`).join("")}</ol>`;
    case "bullets":
      return `<ul class="rules">${lines(body).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    case "keyvalue": {
      const rows = lines(body).map((l) => {
        const m = l.match(/^(.*?)\s*[:：]\s*(.*)$/);
        const label = m ? m[1] : "";
        const value = m ? m[2] : l;
        return `<dt>${esc(label)}</dt><dd class="row"><span>${esc(value)}</span><button class="copy" type="button" data-text="${esc(value)}" data-label="${esc(s.copied)}">${esc(s.copy)}</button></dd>`;
      });
      return `<div class="panel"><dl>${rows.join("")}</dl></div>`;
    }
    default:
      return paragraphs(body);
  }
}

const RIVER = `<svg class="river" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none" stroke="#7fc3e6" stroke-opacity="0.45" stroke-width="1.5" stroke-linecap="round"><path d="M-10 20 C 90 30, 140 90, 210 120 S 330 150, 420 140" /><path d="M-10 40 C 80 60, 130 110, 200 140 S 320 190, 420 200" /><path d="M210 120 C 250 150, 280 200, 300 270" /><path d="M200 140 C 220 180, 220 230, 250 270" /><path d="M-10 70 C 70 90, 120 140, 190 160 S 290 230, 330 270" /></svg>`;

export interface Rendered {
  hero?: string;
  main: string;
}

export function renderPage(page: Page, lang: Lang, data: GuideData): Rendered {
  const s = ui[lang];
  const { property: p } = data;
  const items = [...data.items]
    .filter((i) => i.is_published && !i.requires_code)
    .sort((a, b) => a.sort_order - b.sort_order);
  const by = (c: string) => items.filter((i) => i.category === c);

  if (page === "home") {
    const menu = (["checkin", "nearby", "help"] as Page[])
      .map((pg) => `<li><a href="${pageUrl(p.slug, lang, pg)}">${esc(s.menu[pg])}</a></li>`)
      .join("");
    return {
      hero: `${RIVER}<div class="wrap"><h1>${esc(pick(p, "name", lang))}</h1><p>${esc(pick(p, "tagline", lang))}</p><dl class="times"><div class="time"><dt>${esc(s.checkIn)}</dt><dd>${esc(p.check_in)}</dd></div><div class="time"><dt>${esc(s.checkOut)}</dt><dd>${esc(p.check_out)}</dd></div></dl></div>`,
      main: `<p class="lead" style="margin-top:24px">${esc(s.homeLead)}</p><ul class="menu">${menu}</ul>`,
    };
  }

  if (page === "checkin") {
    const sections = by("checkin")
      .map((i) => `<h2>${esc(pick(i, "title", lang))}</h2>${renderBody(i, lang)}`)
      .join("");
    return { main: `<h1 class="page">${esc(s.menu.checkin)}</h1>${sections}` };
  }

  if (page === "nearby") {
    const places = by("nearby")
      .map((i) => {
        const link = i.map_query
          ? `<a class="btn ghost" href="${esc(mapUrl(i.map_query))}" target="_blank" rel="noopener">${esc(s.openMap)}</a>`
          : "";
        return `<section class="place"><h2>${esc(pick(i, "title", lang))}</h2>${renderBody(i, lang)}${link}</section>`;
      })
      .join("");
    return { main: `<h1 class="page">${esc(s.menu.nearby)}</h1>${places}` };
  }

  // help
  const urgent = by("urgent")
    .map((i) => `<section class="urgent"><h2>${esc(pick(i, "title", lang))}</h2>${renderBody(i, lang)}</section>`)
    .join("");
  const tel = p.emergency_phone.replace(/[^0-9+]/g, "");
  const faq = by("faq")
    .map((i) => `<details><summary>${esc(pick(i, "title", lang))}</summary>${renderBody(i, lang)}</details>`)
    .join("");
  return {
    main:
      `<h1 class="page">${esc(s.menu.help)}</h1>${urgent}` +
      `<h2>${esc(s.emergencyTitle)}</h2><div class="panel"><dl><dd>${esc(p.emergency_phone)}</dd></dl><p style="margin:0;font-size:16px">${esc(pick(p, "emergency_note", lang))}</p></div>` +
      `<p><a class="btn" href="tel:${esc(tel)}">${esc(s.callEmergency)}</a></p>` +
      `<h2>${esc(s.faqTitle)}</h2>${faq}`,
  };
}

export const closedMessage = (lang: Lang) =>
  lang === "ja"
    ? "このガイドは現在公開されていません。"
    : "This guide is not available right now.";

import ui from "./ui.json";
import { staticData } from "../lib/staticData";
import type { Lang, Page } from "../lib/guide";

export const LANGS: Lang[] = ["ja", "en"];
export const PAGES: Page[] = ["home", "checkin", "nearby", "ask", "help"];
export type { Lang, Page };

export const t = (lang: Lang) => ui[lang];
export const slug = staticData.property.slug;

export const pageUrl = (lang: Lang, page: Page, s: string = slug) =>
  `/p/${s}/${lang}/${page === "home" ? "" : page + "/"}`;

export const otherLang = (lang: Lang): Lang => (lang === "ja" ? "en" : "ja");

export const paths = () => LANGS.map((lang) => ({ params: { slug, lang } }));

import ui from "./ui.json";
import property from "../../../../data/property.json";

export const LANGS = ["ja", "en"] as const;
export type Lang = (typeof LANGS)[number];
export type Page = "home" | "checkin" | "nearby" | "help";
export const PAGES: Page[] = ["home", "checkin", "nearby", "help"];

export const t = (lang: Lang) => ui[lang];
export { property };

export const pageUrl = (lang: Lang, page: Page) =>
  `/p/${property.slug}/${lang}/${page === "home" ? "" : page + "/"}`;

export const otherLang = (lang: Lang): Lang => (lang === "ja" ? "en" : "ja");

export const mapUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

export const paths = () =>
  LANGS.map((lang) => ({ params: { slug: property.slug, lang } }));

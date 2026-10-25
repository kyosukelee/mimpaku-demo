// ガイドのデータ型。Supabaseのテーブル(properties / guide_items)と同じ形。
export type Lang = "ja" | "en";
export type Page = "home" | "checkin" | "nearby" | "ask" | "help";
export type Category = "checkin" | "nearby" | "faq" | "urgent";
export type Display = "text" | "steps" | "bullets" | "keyvalue";

export interface PropertyRow {
  id?: string;
  slug: string;
  name_ja: string;
  name_en: string;
  tagline_ja: string;
  tagline_en: string;
  area_ja: string;
  area_en: string;
  check_in: string;
  check_out: string;
  emergency_phone: string;
  emergency_note_ja: string;
  emergency_note_en: string;
  is_published: boolean;
}

export interface ItemRow {
  id?: string;
  category: Category;
  display: Display;
  sort_order: number;
  title_ja: string;
  title_en: string;
  body_ja: string;
  body_en: string;
  map_query: string | null;
  requires_code: boolean;
  is_published: boolean;
}

export interface GuideData {
  property: PropertyRow;
  items: ItemRow[];
}

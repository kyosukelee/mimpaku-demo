export type Category = "checkin" | "nearby" | "faq" | "urgent";
export type Display = "text" | "steps" | "bullets" | "keyvalue";

export interface Property {
  id: string;
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

export interface Item {
  id: string;
  property_id: string;
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

export const CATEGORY_LABEL: Record<Category, string> = {
  checkin: "チェックイン案内",
  nearby: "周辺案内",
  faq: "よくある質問",
  urgent: "緊急のとき",
};

export const DISPLAY_LABEL: Record<Display, string> = {
  text: "文章",
  steps: "手順(番号つき)",
  bullets: "箇条書き",
  keyvalue: "ラベルと値(コピーボタンつき)",
};

export const DISPLAY_HINT: Record<Display, string> = {
  text: "改行ごとに段落になります。",
  steps: "1行に1つの手順を書きます。番号は自動でつきます。",
  bullets: "1行に1項目を書きます。",
  keyvalue: "「ラベル: 値」の形で1行ずつ書きます。値にコピーボタンがつきます。",
};

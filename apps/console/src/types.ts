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
  checklist_template: string;
  default_staff_id: string | null;
  demo_stay_code: string;
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

export type Role = "admin" | "owner" | "staff" | "viewer";
export type TaskStatus = "pending" | "in_progress" | "done";

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface Stay {
  id: string;
  property_id: string;
  checkout_date: string;
  label: string;
  stay_code: string;
  created_at: string;
}

export interface Task {
  id: string;
  property_id: string;
  stay_id: string | null;
  scheduled_at: string;
  assigned_staff: string | null;
  checklist: ChecklistItem[];
  photo_paths: string[];
  status: TaskStatus;
  completed_at: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  display_name: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "管理者",
  owner: "オーナー",
  staff: "清掃スタッフ",
  viewer: "閲覧専用",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "未着手",
  in_progress: "作業中",
  done: "完了",
};

export const PHOTO_BUCKET = "cleaning-photos";

export interface ChatLog {
  id: number;
  property_id: string;
  created_at: string;
  lang: "ja" | "en";
  kind: "ai" | "emergency";
  question: string;
  answer: string;
  answered: boolean;
  model: string;
}

export const AI_DAILY_LIMIT = 50; // supabase/stage4.sql の v_daily_limit と同じ値

import type { Task } from "../types";

const TZ = "Asia/Tokyo";

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const fmtDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${m}/${d}(${"日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};

// 日本時間の今日(yyyy-mm-dd)
export const todayJst = () => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());

export const isOverdue = (t: Pick<Task, "status" | "scheduled_at">) =>
  t.status !== "done" && new Date(t.scheduled_at).getTime() < Date.now();

export const progress = (t: Pick<Task, "checklist">) => ({
  done: t.checklist.filter((i) => i.done).length,
  total: t.checklist.length,
});

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const randomCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");

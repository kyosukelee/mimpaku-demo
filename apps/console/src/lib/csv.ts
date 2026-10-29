// CSVを作って、端末に保存する(Excelで文字化けしないよう先頭にBOMを付ける)
type Cell = string | number | boolean | null | undefined;

function cell(v: Cell): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Excelで計算式として実行されないよう、= + - @ などで始まる値は先頭に ' を付ける(CSVインジェクション対策)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, rows: Cell[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 日本時間の「2026-10-27 15:04:05」
export const jstStamp = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));

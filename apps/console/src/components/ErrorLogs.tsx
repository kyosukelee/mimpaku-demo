import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { ERROR_KIND_LABEL, ERROR_SOURCE_LABEL } from "../types";
import type { ErrorLog } from "../types";
import { fmtDateTime, todayJst } from "../lib/format";
import { downloadCsv, jstStamp } from "../lib/csv";

// エラーの記録(管理者だけ)。30日で自動的に消える
export default function ErrorLogs() {
  const [logs, setLogs] = useState<ErrorLog[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const r = await supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(500);
      if (r.error) { setError("エラーの記録を読み込めませんでした。"); setLogs([]); return; }
      setLogs((r.data ?? []) as ErrorLog[]);
    })();
  }, []);

  if (logs === null) return null;

  const today = todayJst();
  const todays = logs.filter((l) => jstStamp(l.created_at).startsWith(today));
  const failed = todays.filter((l) => l.kind !== "recovered").length;
  const recovered = todays.filter((l) => l.kind === "recovered").length;

  function save() {
    downloadCsv(`errors-${today}.csv`, [
      ["日時(日本時間)", "機能", "種類", "モデル", "説明", "自動のやり直し"],
      ...logs!.map((l) => [jstStamp(l.created_at), ERROR_SOURCE_LABEL[l.source] ?? l.source, ERROR_KIND_LABEL[l.kind] ?? l.kind, l.model, l.detail, l.retried ? "あり" : "なし"]),
    ]);
  }

  return (
    <section className="card errors">
      <h2>エラーの記録(30日分)</h2>
      {error && <p className="error">{error}</p>}
      <p>
        今日の失敗 <strong>{failed}件</strong>
        <span className="muted small">(自動のやり直しで回復 {recovered}件)</span>
      </p>
      {logs.length > 0 ? (
        <details>
          <summary>直近の記録を見る({logs.length}件)</summary>
          <ul className="error-list">
            {logs.slice(0, 50).map((l) => (
              <li key={l.id}>
                <span className={`badge ${l.kind === "recovered" ? "ok" : "danger"}`}>{ERROR_KIND_LABEL[l.kind] ?? l.kind}</span>
                <span className="muted small"> {fmtDateTime(l.created_at)} ・ {ERROR_SOURCE_LABEL[l.source] ?? l.source}{l.model ? ` ・ ${l.model.replace(/^@cf\/[^/]+\//, "")}` : ""}</span>
                {l.detail && <div className="small detail-text">{l.detail}</div>}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="muted">記録はありません。</p>
      )}
      <button className="small" onClick={save} disabled={logs.length === 0}>エラーの記録をCSVで保存</button>
    </section>
  );
}

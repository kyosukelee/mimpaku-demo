import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { AI_DAILY_LIMIT } from "../types";
import type { ChatLog } from "../types";
import { fmtDateTime, todayJst } from "../lib/format";
import { downloadCsv, jstStamp } from "../lib/csv";
import ErrorLogs from "./ErrorLogs";

type Filter = "all" | "unanswered" | "emergency";
const FILTER_LABEL: Record<Filter, string> = { all: "すべて", unanswered: "答えられなかった", emergency: "緊急" };

export default function InquiriesTab({ propertyId, showUsage, isAdmin = false }: { propertyId: string; showUsage: boolean; isAdmin?: boolean }) {
  const [logs, setLogs] = useState<ChatLog[] | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await supabase.from("chat_logs").select("*").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(200);
    if (r.error) { setError("問い合わせの記録を読み込めませんでした。"); setLogs([]); return; }
    setError("");
    setLogs((r.data ?? []) as ChatLog[]);
    if (showUsage) {
      const u = await supabase.from("usage_limits").select("calls").eq("day", todayJst()).maybeSingle();
      if (!u.error) setUsage((u.data?.calls as number | undefined) ?? 0);
    }
  }, [propertyId, showUsage]);

  useEffect(() => { void load(); }, [load]);

  if (logs === null) return <p>読み込み中…</p>;

  async function saveCsv() {
    const r = await supabase.from("chat_logs").select("*").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(1000);
    if (r.error) { setError("CSVを作れませんでした。"); return; }
    downloadCsv(`inquiries-${todayJst()}.csv`, [
      ["日時(日本時間)", "画面の言語", "種類", "答えられたか", "モデル", "質問", "回答"],
      ...((r.data ?? []) as ChatLog[]).map((l) => [
        jstStamp(l.created_at), l.lang === "en" ? "英語" : "日本語", l.kind === "emergency" ? "緊急の案内" : "AI",
        l.answered ? "答えられた" : "答えられなかった", l.model, l.question, l.answer,
      ]),
    ]);
  }

  const shown = logs.filter((l) => filter === "all" ? true : filter === "emergency" ? l.kind === "emergency" : !l.answered);
  const unanswered = logs.filter((l) => !l.answered).length;

  return (
    <section>
      {showUsage && usage !== null && (
        <p className="muted">今日のAIの利用: <strong>{usage}/{AI_DAILY_LIMIT}回</strong>(緊急の定型の案内は数えません)</p>
      )}
      {isAdmin && <ErrorLogs />}
      {isAdmin && (
        <p><button className="small" onClick={saveCsv} disabled={logs.length === 0}>問い合わせの記録をCSVで保存</button>
          <span className="muted small"> 記録は90日で自動的に消えます。残したいときは、CSVで保存してください。</span></p>
      )}
      {unanswered > 0 && (
        <p className="alert" role="status">答えられなかった質問が {unanswered} 件あります。ガイドに書き足すと、次から答えられます。</p>
      )}
      <div className="chips" role="tablist">
        {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={f === filter} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {shown.length === 0 && <p className="muted">該当する問い合わせはありません。記録は90日で自動的に消えます。</p>}
      <ul className="items">
        {shown.map((l) => (
          <li key={l.id} className="task-card">
            <button className="item-main" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
              <span className="item-title">{l.question}</span>
              <span className="muted small">{fmtDateTime(l.created_at)} ・ 画面の言語 {l.lang === "en" ? "英語" : "日本語"}{l.model ? ` ・ ${l.model.replace(/^@cf\/[^/]+\//, "")}` : ""}</span>
              <span className={`badge ${l.kind === "emergency" ? "danger" : l.answered ? "ok" : ""}`}>
                {l.kind === "emergency" ? "緊急の案内" : l.answered ? "回答できた" : "答えられなかった"}
              </span>
            </button>
            {open === l.id && <div className="detail"><p className="answer">{l.answer}</p></div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

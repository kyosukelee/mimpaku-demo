import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { STATUS_LABEL } from "../types";
import type { Stay, Task } from "../types";
import { fmtDate, isOverdue, randomCode, todayJst } from "../lib/format";

export default function StaysTab({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const [stays, setStays] = useState<Stay[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [date, setDate] = useState(todayJst());
  const [label, setLabel] = useState("");
  const [code, setCode] = useState(randomCode());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await supabase.from("stays").select("*").eq("property_id", propertyId).order("checkout_date", { ascending: false });
    const t = await supabase.from("cleaning_tasks").select("*").eq("property_id", propertyId);
    if (s.error || t.error) { setError("予約を読み込めませんでした。"); setStays([]); return; }
    setError("");
    setStays((s.data ?? []) as Stay[]);
    setTasks((t.data ?? []) as Task[]);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!date) { setError("チェックアウト日を入力してください。"); return; }
    setBusy(true);
    setError("");
    const { error } = await supabase.from("stays").insert({ property_id: propertyId, checkout_date: date, label: label.trim(), stay_code: code.trim() });
    setBusy(false);
    if (error) {
      setError(/duplicate|unique/i.test(error.message) ? "その滞在コードはすでに使われています。別のコードにしてください。" : "予約を登録できませんでした。");
      return;
    }
    setLabel("");
    setCode(randomCode());
    await load();
  }

  async function remove(s: Stay) {
    if (!window.confirm(`「${s.label || fmtDate(s.checkout_date)}」の予約を削除します。清掃タスクも一緒に消えます。よろしいですか?`)) return;
    const { error } = await supabase.from("stays").delete().eq("id", s.id);
    if (error) { setError("削除できませんでした。"); return; }
    await load();
  }

  if (stays === null) return <p>読み込み中…</p>;

  return (
    <section>
      {!readOnly && (
        <form className="card" onSubmit={add}>
          <h2>予約(架空)を登録</h2>
          <label>チェックアウト日<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>予約の呼び名(架空)<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: 予約D(架空)" /></label>
          <label>滞在コード(架空)<input value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <p className="muted">登録すると、チェックアウト日の清掃タスクが自動でできます。滞在コードは、あとの段階で鍵やWi-Fiの表示に使います。</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>{busy ? "登録中…" : "登録する"}</button>
        </form>
      )}
      {readOnly && error && <p className="error" role="alert">{error}</p>}
      {stays.length === 0 && <p className="muted">予約はまだありません。</p>}
      <ul className="items">
        {stays.map((s) => {
          const t = tasks.find((x) => x.stay_id === s.id);
          return (
            <li key={s.id} className="item stay">
              <div className="item-main static">
                <span className="item-title">{fmtDate(s.checkout_date)} チェックアウト</span>
                <span className="muted small">{s.label || "(呼び名なし)"} ・ 滞在コード {s.stay_code || "なし"}</span>
                {t && (
                  <span className={`badge ${isOverdue(t) ? "danger" : t.status === "done" ? "ok" : ""}`}>
                    清掃: {isOverdue(t) ? "期限超過" : STATUS_LABEL[t.status]}
                  </span>
                )}
              </div>
              {!readOnly && <button className="small danger move-btn" onClick={() => remove(s)}>削除</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

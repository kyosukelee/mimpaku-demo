import { useState } from "react";
import { supabase } from "../supabase";
import { CATEGORY_LABEL, DISPLAY_HINT, DISPLAY_LABEL } from "../types";
import type { Display, Item } from "../types";

const DISPLAYS = Object.keys(DISPLAY_LABEL) as Display[];

export default function ItemEditor({ item, onCancel, onDone }: { item: Item; onCancel: () => void; onDone: () => void }) {
  const [d, setD] = useState<Item>(item);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const isNew = item.id === "";

  const set = <K extends keyof Item>(k: K, v: Item[K]) => setD({ ...d, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title_ja.trim()) { setMsg("題名(日本語)を入力してください。"); return; }
    setBusy(true);
    setMsg("");
    const { id, ...payload } = d;
    const clean = { ...payload, map_query: d.category === "nearby" && d.map_query?.trim() ? d.map_query.trim() : null };
    const res = isNew
      ? await supabase.from("guide_items").insert(clean)
      : await supabase.from("guide_items").update(clean).eq("id", id);
    setBusy(false);
    if (res.error) { setMsg("保存できませんでした。もう一度試してください。"); return; }
    onDone();
  }

  async function remove() {
    if (!window.confirm(`「${d.title_ja || "この項目"}」を削除します。元に戻せません。よろしいですか?`)) return;
    setBusy(true);
    const { error } = await supabase.from("guide_items").delete().eq("id", d.id);
    setBusy(false);
    if (error) { setMsg("削除できませんでした。"); return; }
    onDone();
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>{isNew ? "項目を追加" : "項目を編集"}<span className="muted small">({CATEGORY_LABEL[d.category]})</span></h2>
      <label className="check">
        <input type="checkbox" checked={d.is_published} onChange={(e) => set("is_published", e.target.checked)} />
        公開する
      </label>
      <label>題名(日本語)<input value={d.title_ja} onChange={(e) => set("title_ja", e.target.value)} /></label>
      <label>題名(英語)<input value={d.title_en} onChange={(e) => set("title_en", e.target.value)} /></label>
      <label>
        表示のしかた
        <select value={d.display} onChange={(e) => set("display", e.target.value as Display)}>
          {DISPLAYS.map((x) => <option key={x} value={x}>{DISPLAY_LABEL[x]}</option>)}
        </select>
      </label>
      <p className="muted">{DISPLAY_HINT[d.display]}</p>
      <label>本文(日本語)<textarea rows={6} value={d.body_ja} onChange={(e) => set("body_ja", e.target.value)} /></label>
      <label>本文(英語)<textarea rows={6} value={d.body_en} onChange={(e) => set("body_en", e.target.value)} /></label>
      <p className="muted">英語が空のときは、日本語を表示します。</p>
      {d.category === "nearby" && (
        <label>
          地図の検索語
          <input value={d.map_query ?? ""} onChange={(e) => set("map_query", e.target.value)} placeholder="例: 平和記念公園 広島" />
        </label>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>{busy ? "保存中…" : "保存する"}</button>
        <button type="button" onClick={onCancel} disabled={busy}>キャンセル</button>
        {!isNew && <button type="button" className="danger" onClick={remove} disabled={busy}>削除</button>}
      </div>
    </form>
  );
}

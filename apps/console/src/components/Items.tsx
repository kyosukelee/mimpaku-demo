import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { CATEGORY_LABEL, DISPLAY_HINT, DISPLAY_LABEL } from "../types";
import type { Category, Display, Item } from "../types";
import ItemEditor from "./ItemEditor";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

export default function Items({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [cat, setCat] = useState<Category>("checkin");
  const [editing, setEditing] = useState<Item | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("guide_items").select("*").eq("property_id", propertyId).order("sort_order", { ascending: true });
    if (error) { setError("案内項目を読み込めませんでした。"); setItems([]); return; }
    setError("");
    setItems((data ?? []) as Item[]);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  if (items === null) return <p>読み込み中…</p>;

  const list = items.filter((i) => i.category === cat);

  function startNew() {
    const max = items!.reduce((m, i) => Math.max(m, i.sort_order), 0);
    const display: Display = "text";
    setEditing({
      id: "", property_id: propertyId, category: cat, display, sort_order: max + 10,
      title_ja: "", title_en: "", body_ja: "", body_en: "", map_query: null,
      requires_code: false, is_published: true,
    });
  }

  async function move(index: number, dir: -1 | 1) {
    const a = list[index];
    const b = list[index + dir];
    if (!a || !b) return;
    const r1 = await supabase.from("guide_items").update({ sort_order: b.sort_order }).eq("id", a.id);
    const r2 = await supabase.from("guide_items").update({ sort_order: a.sort_order }).eq("id", b.id);
    if (r1.error || r2.error) setError("並び替えできませんでした。");
    await load();
  }

  if (editing) {
    return (
      <ItemEditor
        item={editing}
        readOnly={readOnly}
        onCancel={() => setEditing(null)}
        onDone={async () => { setEditing(null); await load(); }}
      />
    );
  }

  return (
    <section>
      <div className="chips" role="tablist">
        {CATEGORIES.map((c) => (
          <button key={c} role="tab" aria-selected={c === cat} onClick={() => setCat(c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {list.length === 0 && <p className="muted">この区分の項目はまだありません。</p>}
      <ul className="items">
        {list.map((i, idx) => (
          <li key={i.id} className="item">
            <button className="item-main" onClick={() => setEditing(i)}>
              <span className="item-title">{i.title_ja || "(題名なし)"}</span>
              <span className="muted small">{DISPLAY_LABEL[i.display]}</span>
              {!i.is_published && <span className="badge">非公開</span>}
              {i.requires_code && <span className="badge code">滞在コードで表示</span>}
            </button>
            {!readOnly && (
              <span className="move">
                <button className="small" aria-label="上へ" disabled={idx === 0} onClick={() => move(idx, -1)}>↑</button>
                <button className="small" aria-label="下へ" disabled={idx === list.length - 1} onClick={() => move(idx, 1)}>↓</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && <button className="primary" onClick={startNew}>この区分に項目を追加</button>}
    </section>
  );
}

export { DISPLAY_HINT };

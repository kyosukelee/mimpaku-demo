import { useState } from "react";
import { supabase } from "../supabase";
import type { Property, Staff } from "../types";

type Field = { key: keyof Property; label: string; multiline?: boolean };

const FIELDS: Field[] = [
  { key: "name_ja", label: "物件名(日本語)" },
  { key: "name_en", label: "物件名(英語)" },
  { key: "tagline_ja", label: "ひとこと(日本語)" },
  { key: "tagline_en", label: "ひとこと(英語)" },
  { key: "area_ja", label: "エリア(日本語)" },
  { key: "area_en", label: "エリア(英語)" },
  { key: "check_in", label: "チェックイン時刻" },
  { key: "check_out", label: "チェックアウト時刻" },
  { key: "emergency_phone", label: "緊急連絡先の電話番号" },
  { key: "emergency_note_ja", label: "緊急連絡先の説明(日本語)", multiline: true },
  { key: "emergency_note_en", label: "緊急連絡先の説明(英語)", multiline: true },
];

interface Props {
  property: Property;
  staff: Staff[];
  readOnly: boolean;
  onSaved: (p: Property) => void;
}

export default function PropertyForm({ property, staff, readOnly, onSaved }: Props) {
  const [draft, setDraft] = useState<Property>(property);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!draft.name_ja.trim()) { setMsg({ ok: false, text: "物件名(日本語)を入力してください。" }); return; }
    setBusy(true);
    setMsg(null);
    const { id, slug: _slug, ...rest } = draft;
    const { data, error } = await supabase.from("properties").update(rest).eq("id", id).select().single();
    setBusy(false);
    if (error || !data) { setMsg({ ok: false, text: "保存できませんでした。もう一度試してください。" }); return; }
    onSaved(data as Property);
    setDraft(data as Property);
    setMsg({ ok: true, text: "保存しました。ガイドにはすぐ反映されます。" });
  }

  return (
    <form className="card" onSubmit={save}>
      <fieldset disabled={readOnly}>
        <label className="check">
          <input type="checkbox" checked={draft.is_published} onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })} />
          ガイドを公開する
        </label>
        <p className="muted">オフにすると、宿泊者には「公開されていません」と表示されます。</p>
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            {f.multiline ? (
              <textarea rows={3} value={String(draft[f.key] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            ) : (
              <input value={String(draft[f.key] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            )}
          </label>
        ))}

        <h2 className="section">清掃の設定</h2>
        <label>
          清掃の担当スタッフ(既定)
          <select value={draft.default_staff_id ?? ""} onChange={(e) => setDraft({ ...draft, default_staff_id: e.target.value || null })}>
            <option value="">未設定</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </select>
        </label>
        <label>
          清掃のチェックリスト(1行に1項目)
          <textarea rows={8} value={draft.checklist_template} onChange={(e) => setDraft({ ...draft, checklist_template: e.target.value })} />
        </label>
        <p className="muted">予約を登録すると、この内容と担当で清掃タスクができます。すでにあるタスクは変わりません。</p>
      </fieldset>
      <p className="muted">URLの名前(slug): <code>{property.slug}</code>(変更できません)</p>
      {msg && <p className={msg.ok ? "ok" : "error"} role="status">{msg.text}</p>}
      {!readOnly && <button className="primary" type="submit" disabled={busy}>{busy ? "保存中…" : "保存する"}</button>}
    </form>
  );
}

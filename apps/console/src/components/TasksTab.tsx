import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { PHOTO_BUCKET, STATUS_LABEL } from "../types";
import type { Staff, Stay, Task } from "../types";
import { fmtDateTime, isOverdue, progress } from "../lib/format";
import { usePhotoUrls } from "../lib/photos";

type Filter = "all" | "open" | "overdue" | "done";
const FILTER_LABEL: Record<Filter, string> = { all: "すべて", open: "未完了", overdue: "期限超過", done: "完了" };

function TaskDetail({ task, staff, stay, readOnly, onChanged }: { task: Task; staff: Staff[]; stay?: Stay; readOnly: boolean; onChanged: () => void }) {
  const urls = usePhotoUrls(task.photo_paths);
  const [error, setError] = useState("");

  async function assign(id: string) {
    const { error } = await supabase.from("cleaning_tasks").update({ assigned_staff: id || null }).eq("id", task.id);
    if (error) setError("担当を変更できませんでした。"); else { setError(""); onChanged(); }
  }
  // チェック・写真・申し送りを消して、未着手に戻す(デモを最初から繰り返すとき)
  async function restart() {
    if (!window.confirm("チェックを外し、写真と申し送りも消して、最初の状態に戻します。元に戻せません。よろしいですか?")) return;
    if (task.photo_paths.length > 0) {
      const rm = await supabase.storage.from(PHOTO_BUCKET).remove(task.photo_paths);
      if (rm.error) { setError("写真を消せませんでした。"); return; }
    }
    const { error } = await supabase.from("cleaning_tasks").update({
      status: "pending",
      checklist: task.checklist.map((c) => ({ ...c, done: false })),
      photo_paths: [],
      note: "",
    }).eq("id", task.id);
    if (error) setError("最初の状態に戻せませんでした。"); else { setError(""); onChanged(); }
  }
  const hasProgress = task.status !== "pending" || task.photo_paths.length > 0 || task.note !== "" || task.checklist.some((c) => c.done);

  async function reopen() {
    if (!window.confirm("このタスクを未完了に戻します。よろしいですか?")) return;
    const { error } = await supabase.from("cleaning_tasks").update({ status: "pending" }).eq("id", task.id);
    if (error) setError("戻せませんでした。"); else { setError(""); onChanged(); }
  }

  return (
    <div className="detail">
      <p className="muted">予約: {stay?.label || "(呼び名なし)"}{task.completed_at ? ` ・ 完了 ${fmtDateTime(task.completed_at)}` : ""}</p>
      {!readOnly && (
        <label>担当スタッフ
          <select value={task.assigned_staff ?? ""} onChange={(e) => assign(e.target.value)}>
            <option value="">未設定</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </select>
        </label>
      )}
      <ul className="checks">
        {task.checklist.length === 0 && <li className="muted">チェックリストはありません。</li>}
        {task.checklist.map((c, i) => <li key={i} className={c.done ? "on" : ""}><span aria-hidden="true">{c.done ? "✓" : "○"}</span> {c.text}</li>)}
      </ul>
      {task.note && <p><strong>申し送り:</strong> {task.note}</p>}
      <div className="photos">
        {task.photo_paths.length === 0 && <p className="muted">写真はありません。</p>}
        {task.photo_paths.map((p) => urls[p]
          ? <a key={p} href={urls[p]} target="_blank" rel="noopener"><img src={urls[p]} alt="清掃の写真" /></a>
          : <span key={p} className="ph muted">読み込み中…</span>)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!readOnly && (task.status === "done" || hasProgress) && (
        <div className="actions">
          {task.status === "done" && <button className="small" onClick={reopen}>未完了に戻す(チェック・写真は残す)</button>}
          {hasProgress && <button className="small danger" onClick={restart}>最初からやり直す</button>}
        </div>
      )}
    </div>
  );
}

export default function TasksTab({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [stays, setStays] = useState<Stay[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const t = await supabase.from("cleaning_tasks").select("*").eq("property_id", propertyId).order("scheduled_at", { ascending: false });
    if (t.error) { setError("清掃の状況を読み込めませんでした。"); setTasks([]); return; }
    setError("");
    setTasks((t.data ?? []) as Task[]);
    const s = await supabase.from("stays").select("*").eq("property_id", propertyId);
    if (!s.error) setStays((s.data ?? []) as Stay[]);
    const st = await supabase.from("staff_directory").select("*");
    if (!st.error) setStaff((st.data ?? []) as Staff[]);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  if (tasks === null) return <p>読み込み中…</p>;

  const overdue = tasks.filter(isOverdue);
  const shown = tasks.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.status === "done" : filter === "overdue" ? isOverdue(t) : t.status !== "done");

  return (
    <section>
      {overdue.length > 0 && (
        <p className="alert" role="alert">期限を過ぎた未完了の清掃が {overdue.length} 件あります。</p>
      )}
      <div className="chips" role="tablist">
        {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={f === filter} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {shown.length === 0 && <p className="muted">該当する清掃はありません。</p>}
      <ul className="items">
        {shown.map((t) => {
          const stay = stays.find((s) => s.id === t.stay_id);
          const who = staff.find((s) => s.id === t.assigned_staff)?.display_name ?? "担当未設定";
          const pr = progress(t);
          const od = isOverdue(t);
          return (
            <li key={t.id} className="task-card">
              <button className="item-main" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
                <span className="item-title">期限 {fmtDateTime(t.scheduled_at)}</span>
                <span className="muted small">{who} ・ チェック {pr.done}/{pr.total} ・ 写真 {t.photo_paths.length}枚</span>
                <span className={`badge ${od ? "danger" : t.status === "done" ? "ok" : ""}`}>{od ? "期限超過" : STATUS_LABEL[t.status]}</span>
              </button>
              {open === t.id && <TaskDetail task={t} staff={staff} stay={stay} readOnly={readOnly} onChanged={load} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

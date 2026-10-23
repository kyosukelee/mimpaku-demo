import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { PHOTO_BUCKET } from "../types";
import type { ChecklistItem, Task, TaskStatus } from "../types";
import { fmtDateTime, isOverdue } from "../lib/format";
import { resizeImage } from "../lib/image";
import { loadCache, removeCache, saveCache } from "../lib/cache";
import { usePhotoUrls } from "../lib/photos";

interface Draft { checklist: ChecklistItem[]; note: string }
const draftKey = (id: string) => `task-draft:${id}`;
const sameTexts = (a: ChecklistItem[], b: ChecklistItem[]) =>
  a.length === b.length && a.every((x, i) => x.text === b[i].text);

interface Props {
  task: Task;
  propertyName: string;
  onClose: (changed: boolean) => void;
}

export default function TaskWork({ task, propertyName, onClose }: Props) {
  // 前回、電波が悪くて送れなかった入力が端末に残っていれば、そこから再開する
  const saved = useRef(loadCache<Draft>(draftKey(task.id)));
  const useSaved = saved.current !== null && sameTexts(saved.current.checklist, task.checklist);

  const state = useRef({
    checklist: useSaved ? saved.current!.checklist : task.checklist,
    note: useSaved ? saved.current!.note : task.note,
    paths: task.photo_paths,
  });
  const [checklist, setChecklistState] = useState(state.current.checklist);
  const [note, setNoteState] = useState(state.current.note);
  const [paths, setPathsState] = useState(state.current.paths);
  const [sync, setSync] = useState<"idle" | "saving" | "error">("idle");
  const [dirty, setDirty] = useState(useSaved);
  const [message, setMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);

  const dirtyRef = useRef(useSaved);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const urls = usePhotoUrls(paths);

  const persist = useCallback((status?: TaskStatus): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      setSync("saving");
      const sent = { checklist: state.current.checklist, note: state.current.note, paths: state.current.paths };
      const st: TaskStatus = status ?? (sent.checklist.some((i) => i.done) || sent.paths.length > 0 ? "in_progress" : "pending");
      const { error } = await supabase
        .from("cleaning_tasks")
        .update({ checklist: sent.checklist, note: sent.note, photo_paths: sent.paths, status: st })
        .eq("id", task.id)
        .select()
        .single();
      if (error) {
        setSync("error");
        setMessage(error.message);
        return false;
      }
      setSync("idle");
      setMessage("");
      const now = state.current;
      if (JSON.stringify([now.checklist, now.note]) === JSON.stringify([sent.checklist, sent.note])) {
        dirtyRef.current = false;
        setDirty(false);
        removeCache(draftKey(task.id));
      }
      return true;
    };
    const p = queue.current.then(run, run) as Promise<boolean>;
    queue.current = p.catch(() => undefined);
    return p;
  }, [task.id]);

  const touch = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
    saveCache(draftKey(task.id), { checklist: state.current.checklist, note: state.current.note });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persist(); }, 700);
  }, [persist, task.id]);

  useEffect(() => {
    if (useSaved) void persist(); // 残っていた入力を送る
    const online = () => { if (dirtyRef.current) void persist(); };
    window.addEventListener("online", online);
    return () => { window.removeEventListener("online", online); clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(i: number) {
    const next = state.current.checklist.map((c, idx) => (idx === i ? { ...c, done: !c.done } : c));
    state.current.checklist = next;
    setChecklistState(next);
    touch();
  }
  function changeNote(v: string) {
    state.current.note = v;
    setNoteState(v);
    touch();
  }
  function setPaths(next: string[]) {
    state.current.paths = next;
    setPathsState(next);
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setPhotoError("");
    let added = 0;
    try {
      for (const f of Array.from(files)) {
        const blob = await resizeImage(f);
        const path = `${task.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        setPaths([...state.current.paths, path]);
        added++;
      }
    } catch {
      setPhotoError("写真を送れませんでした。電波のよいところで、もう一度撮ってください。");
    } finally {
      if (added > 0) await persist();
      setUploading(false);
    }
  }

  async function removePhoto(p: string) {
    if (!window.confirm("この写真を削除しますか?")) return;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([p]);
    if (error) { setPhotoError("写真を削除できませんでした。"); return; }
    setPaths(state.current.paths.filter((x) => x !== p));
    await persist();
  }

  const allChecked = checklist.every((c) => c.done);
  const canComplete = allChecked && paths.length >= 1 && !uploading && !completing;

  async function complete() {
    if (!window.confirm("清掃の完了を報告します。よろしいですか?")) return;
    setCompleting(true);
    clearTimeout(timer.current);
    const ok = await persist("done");
    setCompleting(false);
    if (ok) { removeCache(draftKey(task.id)); onClose(true); }
  }

  const syncText = sync === "saving" ? "送信中…" : sync === "error" ? "" : dirty ? "未送信(端末に保存しました)" : "送信済み";

  return (
    <section>
      <button className="small back" onClick={() => onClose(false)}>← 一覧にもどる</button>
      <h1>{propertyName}</h1>
      <p className={isOverdue(task) ? "alert" : "muted"}>期限 {fmtDateTime(task.scheduled_at)}{isOverdue(task) ? "(過ぎています)" : ""}</p>

      <div className="card">
        <h2>チェックリスト</h2>
        {checklist.length === 0 && <p className="muted">チェックリストはありません。</p>}
        <ul className="checklist">
          {checklist.map((c, i) => (
            <li key={i}>
              <label className="check big">
                <input type="checkbox" checked={c.done} onChange={() => toggle(i)} />
                <span>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
        <label>申し送り(あれば)
          <textarea rows={3} value={note} onChange={(e) => changeNote(e.target.value)} />
        </label>
      </div>

      <div className="card">
        <h2>写真</h2>
        <div className="photos">
          {paths.length === 0 && <p className="muted">写真を1枚以上撮ってください。</p>}
          {paths.map((p) => (
            <figure key={p} className="photo">
              {urls[p] ? <img src={urls[p]} alt="清掃の写真" /> : <span className="ph muted">…</span>}
              <button className="small danger" onClick={() => removePhoto(p)}>削除</button>
            </figure>
          ))}
        </div>
        <label className="btn-like">
          {uploading ? "送信中…" : "写真を撮る・選ぶ"}
          <input type="file" accept="image/*" capture="environment" multiple hidden disabled={uploading} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
        </label>
        {photoError && <p className="error" role="alert">{photoError}</p>}
      </div>

      <p className={sync === "error" ? "error" : "muted"} role="status">
        {sync === "error"
          ? <>電波が弱いようです。入力は端末に保存してあります。 <button className="small" onClick={() => void persist()}>もう一度送る</button>{message ? <span className="small"> ({message})</span> : null}</>
          : syncText}
      </p>

      <button className="primary wide" disabled={!canComplete} onClick={complete}>{completing ? "送信中…" : "完了を報告する"}</button>
      {!canComplete && !completing && (
        <p className="muted">
          {!allChecked ? "すべてのチェックを入れると、" : "写真を1枚以上撮ると、"}完了を報告できます。
        </p>
      )}
    </section>
  );
}

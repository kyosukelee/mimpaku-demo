import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { STATUS_LABEL } from "../types";
import type { Task } from "../types";
import { fmtDateTime, isOverdue, progress, todayJst } from "../lib/format";
import { loadCache, saveCache } from "../lib/cache";
import { isOffline } from "../lib/net";
import TaskWork from "./TaskWork";

interface Cached { tasks: Task[]; names: Record<string, string> }

export default function StaffHome({ userId }: { userId: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const cacheKey = `staff-cache:${userId}`;

  const load = useCallback(async () => {
    if (isOffline()) {
      const cached = loadCache<Cached>(cacheKey);
      if (cached) { setTasks(cached.tasks); setNames(cached.names); setOffline(true); return; }
    }
    const t = await supabase.from("cleaning_tasks").select("*").eq("assigned_staff", userId).order("scheduled_at", { ascending: true });
    const p = await supabase.from("properties").select("id,name_ja");
    if (t.error || p.error) {
      const cached = loadCache<Cached>(cacheKey);
      if (cached) { setTasks(cached.tasks); setNames(cached.names); setOffline(true); return; }
      setTasks([]);
      setOffline(true);
      return;
    }
    const map: Record<string, string> = {};
    for (const row of (p.data ?? []) as { id: string; name_ja: string }[]) map[row.id] = row.name_ja;
    const list = (t.data ?? []) as Task[];
    setTasks(list);
    setNames(map);
    setOffline(false);
    saveCache(cacheKey, { tasks: list, names: map });
  }, [userId, cacheKey]);

  useEffect(() => { void load(); }, [load]);

  // 電波が戻ったら、最新の内容を読み込み直す(作業画面を開いているときは触らない)
  useEffect(() => {
    const online = () => { if (!openId) void load(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [load, openId]);

  if (tasks === null) return <p>読み込み中…</p>;

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 5);
  const current = tasks.find((t) => t.id === openId);

  if (current) {
    return (
      <TaskWork
        task={current}
        propertyName={names[current.property_id] ?? "物件"}
        onClose={() => { setOpenId(null); void load(); }}
      />
    );
  }

  return (
    <section>
      <h1>今日の清掃</h1>
      <p className="muted">{todayJst()}</p>
      {offline && (
        <p className="alert" role="status">
          電波がつながりません。最後に読み込めた内容を表示しています。 <button className="small" onClick={() => void load()}>読み込み直す</button>
        </p>
      )}
      {open.length === 0 && <p className="muted">いま担当の清掃はありません。</p>}
      <ul className="items">
        {open.map((t) => {
          const pr = progress(t);
          const od = isOverdue(t);
          return (
            <li key={t.id} className="task-card">
              <button className="item-main" onClick={() => setOpenId(t.id)}>
                <span className="item-title">{names[t.property_id] ?? "物件"}</span>
                <span className="muted small">期限 {fmtDateTime(t.scheduled_at)} ・ チェック {pr.done}/{pr.total} ・ 写真 {t.photo_paths.length}枚</span>
                <span className={`badge ${od ? "danger" : ""}`}>{od ? "期限超過" : STATUS_LABEL[t.status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {done.length > 0 && (
        <>
          <h2 className="section">最近の完了</h2>
          <ul className="items">
            {done.map((t) => (
              <li key={t.id} className="task-card">
                <div className="item-main static">
                  <span className="item-title">{names[t.property_id] ?? "物件"}</span>
                  <span className="muted small">完了 {t.completed_at ? fmtDateTime(t.completed_at) : ""} ・ 写真 {t.photo_paths.length}枚</span>
                  <span className="badge ok">完了</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

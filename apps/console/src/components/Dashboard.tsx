import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { guideBase, supabase } from "../supabase";
import { ROLE_LABEL } from "../types";
import type { Property, Role, Staff } from "../types";
import { loadCache, saveCache } from "../lib/cache";
import { isOffline } from "../lib/net";
import PropertyForm from "./PropertyForm";
import Items from "./Items";
import StaysTab from "./StaysTab";
import TasksTab from "./TasksTab";
import StaffHome from "./StaffHome";

type Tab = "property" | "items" | "stays" | "tasks";
const TAB_LABEL: Record<Tab, string> = { property: "物件情報", items: "案内項目", stays: "予約", tasks: "清掃状況" };
const ROLES: Role[] = ["admin", "owner", "staff", "viewer"];

export default function Dashboard({ session }: { session: Session }) {
  const uid = session.user.id;
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [property, setProperty] = useState<Property | null | undefined>(undefined);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("property");

  useEffect(() => {
    let alive = true;
    (async () => {
      // 権限(role)を確認する。電波が弱いときは、前に確認できた結果を使う
      let r: Role | null = null;
      const cachedRole = loadCache<Role>(`role:${uid}`);
      const prof = isOffline() && cachedRole && ROLES.includes(cachedRole)
        ? { data: null, error: { message: "offline" } }   // 電波なし: 待たずに保存済みを使う
        : await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      if (prof.error) {
        const cached = loadCache<Role>(`role:${uid}`);
        if (cached && ROLES.includes(cached)) r = cached;
        else { if (alive) { setError("接続できませんでした。電波のよいところで、読み込み直してください。"); setRole(null); } return; }
      } else {
        const v = prof.data?.role as Role | undefined;
        if (v && ROLES.includes(v)) { r = v; saveCache(`role:${uid}`, v); }
      }
      if (!alive) return;
      setRole(r);
      if (!r || r === "staff") return;

      // 管理者・閲覧専用は先頭の物件、オーナーは自分の物件
      let q = supabase.from("properties").select("*").order("created_at", { ascending: true }).limit(1);
      if (r === "owner") q = q.eq("owner_id", uid);
      const res = await q;
      if (!alive) return;
      if (res.error) { setError("物件を読み込めませんでした。"); setProperty(null); return; }
      setProperty((res.data?.[0] as Property | undefined) ?? null);
      if (r === "viewer") setTab("tasks");
      const st = await supabase.from("staff_directory").select("*");
      if (alive && !st.error) setStaff((st.data ?? []) as Staff[]);
    })();
    return () => { alive = false; };
  }, [uid]);

  const logout = () => supabase.auth.signOut();

  if (role === undefined) return <main className="center"><p>読み込み中…</p></main>;
  if (role === null) {
    return (
      <main className="center">
        <h1>権限がありません</h1>
        <p>このアカウントは、管理画面を使う人として登録されていません。</p>
        {error && <p className="error">{error}</p>}
        <button onClick={logout}>ログアウト</button>
      </main>
    );
  }

  const readOnly = role !== "admin";
  const isOffice = role === "admin" || role === "viewer";

  return (
    <div className="shell">
      <header className="bar">
        <strong>管理画面</strong>
        {role !== "admin" && <span className="role-badge">{ROLE_LABEL[role]}</span>}
        <span className="spacer" />
        {isOffice && property && guideBase && (
          <a href={`${guideBase}/p/${property.slug}/ja/`} target="_blank" rel="noopener">ガイドを開く</a>
        )}
        <button className="small" onClick={logout}>ログアウト</button>
      </header>
      <main className="wrap">
        {error && <p className="error" role="alert">{error}</p>}

        {role === "staff" && <StaffHome userId={uid} />}

        {role !== "staff" && property === undefined && <p>読み込み中…</p>}
        {role !== "staff" && property === null && !error && (
          <p>{role === "owner" ? "あなたの物件はまだ登録されていません。" : <>物件がありません。<code>supabase/seed.sql</code> を実行してから、ページを再読み込みしてください。</>}</p>
        )}

        {role !== "staff" && property && (
          <>
            <h1>{property.name_ja}</h1>
            {role === "viewer" && <p className="muted">閲覧専用のアカウントです。見るだけで、変更はできません。</p>}
            {isOffice ? (
              <>
                <div className="tabs" role="tablist">
                  {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
                    <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
                  ))}
                </div>
                {tab === "property" && <PropertyForm property={property} staff={staff} readOnly={readOnly} onSaved={setProperty} />}
                {tab === "items" && <Items propertyId={property.id} readOnly={readOnly} />}
                {tab === "stays" && <StaysTab propertyId={property.id} readOnly={readOnly} />}
                {tab === "tasks" && <TasksTab propertyId={property.id} readOnly={readOnly} />}
              </>
            ) : (
              <TasksTab propertyId={property.id} readOnly />
            )}
          </>
        )}
      </main>
    </div>
  );
}

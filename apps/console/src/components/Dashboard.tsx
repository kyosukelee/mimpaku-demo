import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { guideBase, supabase } from "../supabase";
import type { Property } from "../types";
import PropertyForm from "./PropertyForm";
import Items from "./Items";

type Tab = "property" | "items";

export default function Dashboard({ session }: { session: Session }) {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [property, setProperty] = useState<Property | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("property");

  useEffect(() => {
    let alive = true;
    (async () => {
      const prof = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      if (!alive) return;
      if (prof.error) { setError("権限を確認できませんでした。"); setRole(null); return; }
      const r = prof.data?.role ?? null;
      setRole(r);
      if (r !== "admin") return;
      const res = await supabase.from("properties").select("*").order("created_at", { ascending: true }).limit(1);
      if (!alive) return;
      if (res.error) { setError("物件を読み込めませんでした。"); setProperty(null); return; }
      setProperty((res.data?.[0] as Property | undefined) ?? null);
    })();
    return () => { alive = false; };
  }, [session.user.id]);

  const logout = () => supabase.auth.signOut();

  if (role === undefined) return <main className="center"><p>読み込み中…</p></main>;
  if (role !== "admin") {
    return (
      <main className="center">
        <h1>権限がありません</h1>
        <p>このアカウントは管理者として登録されていません。</p>
        {error && <p className="error">{error}</p>}
        <button onClick={logout}>ログアウト</button>
      </main>
    );
  }

  return (
    <div className="shell">
      <header className="bar">
        <strong>管理画面</strong>
        <span className="spacer" />
        {property && guideBase && (
          <a href={`${guideBase}/p/${property.slug}/ja/`} target="_blank" rel="noopener">ガイドを開く</a>
        )}
        <button className="small" onClick={logout}>ログアウト</button>
      </header>
      <main className="wrap">
        {error && <p className="error" role="alert">{error}</p>}
        {property === undefined && <p>読み込み中…</p>}
        {property === null && !error && (
          <p>物件がありません。<code>supabase/seed.sql</code> を実行してから、ページを再読み込みしてください。</p>
        )}
        {property && (
          <>
            <h1>{property.name_ja}</h1>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === "property"} onClick={() => setTab("property")}>物件情報</button>
              <button role="tab" aria-selected={tab === "items"} onClick={() => setTab("items")}>案内項目</button>
            </div>
            {tab === "property" && <PropertyForm property={property} onSaved={setProperty} />}
            {tab === "items" && <Items propertyId={property.id} />}
          </>
        )}
      </main>
    </div>
  );
}

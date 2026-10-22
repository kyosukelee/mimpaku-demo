import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./supabase";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <main className="center">
        <h1>設定が必要です</h1>
        <p>
          環境変数 <code>VITE_SUPABASE_URL</code> と <code>VITE_SUPABASE_ANON_KEY</code> を設定してから、もう一度ビルドしてください。
        </p>
      </main>
    );
  }
  if (session === undefined) return <main className="center"><p>読み込み中…</p></main>;
  if (session === null) return <Login />;
  return <Dashboard session={session} />;
}

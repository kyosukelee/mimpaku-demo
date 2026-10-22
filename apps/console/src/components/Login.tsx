import { useState } from "react";
import { supabase } from "../supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("メールアドレスかパスワードが違います。");
    setBusy(false);
  }

  return (
    <main className="center">
      <h1>管理画面</h1>
      <p className="muted">民泊デモの案内を編集します。</p>
      <form className="card" onSubmit={submit}>
        <label>
          メールアドレス
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          パスワード
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? "ログイン中…" : "ログイン"}</button>
      </form>
    </main>
  );
}

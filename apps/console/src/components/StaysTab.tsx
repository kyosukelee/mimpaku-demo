import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { COUNTRY_SUGGESTIONS, STATUS_LABEL, STAY_LIMIT_DAYS } from "../types";
import type { Nationality, Stay, Task } from "../types";
import { addDays, fiscalYearStart, fmtDate, isOverdue, natText, nightsBetween, randomCode, todayJst } from "../lib/format";

export default function StaysTab({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const [stays, setStays] = useState<Stay[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fyNights, setFyNights] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [checkin, setCheckin] = useState(todayJst());
  const [checkout, setCheckout] = useState(addDays(todayJst(), 1));
  const [guests, setGuests] = useState(1);
  const [nats, setNats] = useState<Nationality[]>([{ country: "日本", count: 1 }]);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState(randomCode());
  const [busy, setBusy] = useState(false);
  const fy = fiscalYearStart(todayJst());

  const load = useCallback(async () => {
    const s = await supabase.from("stays").select("*").eq("property_id", propertyId).order("checkout_date", { ascending: false });
    const t = await supabase.from("cleaning_tasks").select("*").eq("property_id", propertyId);
    if (s.error || t.error) { setError("予約を読み込めませんでした。"); setStays([]); return; }
    setError("");
    setStays((s.data ?? []) as Stay[]);
    setTasks((t.data ?? []) as Task[]);
    const n = await supabase.rpc("fy_nights", { p_property: propertyId, p_fy_start: fy });
    if (!n.error) setFyNights(n.data as number);
  }, [propertyId, fy]);

  useEffect(() => { void load(); }, [load]);

  const natSum = nats.reduce((a, n) => a + (Number(n.count) || 0), 0);
  const setNat = (i: number, patch: Partial<Nationality>) => setNats(nats.map((n, idx) => (idx === i ? { ...n, ...patch } : n)));
  function changeGuests(v: number) {
    setGuests(v);
    if (nats.length === 1) setNats([{ ...nats[0], count: v }]); // 国籍が1つなら人数に合わせる
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!checkin || !checkout || checkin >= checkout) { setError("チェックイン日は、チェックアウト日より前にしてください。"); return; }
    if (natSum !== guests) { setError(`国籍の内訳の合計(${natSum}人)を、宿泊者数(${guests}人)に合わせてください。`); return; }
    setBusy(true);
    setError("");
    const { error } = await supabase.from("stays").insert({
      property_id: propertyId, checkin_date: checkin, checkout_date: checkout, guests,
      nationalities: nats.map((n) => ({ country: n.country.trim(), count: Number(n.count) })),
      label: label.trim(), stay_code: code.trim(),
    });
    setBusy(false);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) setError("その滞在コードはすでに使われています。別のコードにしてください。");
      else if (/180日|別の予約|30泊|国籍|チェックイン日/.test(error.message)) setError(error.message);
      else setError("予約を登録できませんでした。");
      return;
    }
    setLabel("");
    setCode(randomCode());
    await load();
  }

  async function remove(s: Stay) {
    if (!window.confirm(`「${s.label || fmtDate(s.checkout_date)}」の予約を削除します。清掃タスクも一緒に消えます。よろしいですか?`)) return;
    const { error } = await supabase.from("stays").delete().eq("id", s.id);
    if (error) { setError("削除できませんでした。"); return; }
    await load();
  }

  if (stays === null) return <p>読み込み中…</p>;

  const left = fyNights === null ? null : STAY_LIMIT_DAYS - fyNights;
  const nightsNew = checkin && checkout ? nightsBetween(checkin, checkout) : 0;

  return (
    <section>
      {fyNights !== null && (
        <div className={`fy-box ${left! <= 0 ? "full" : left! <= 30 ? "warn" : ""}`}>
          <strong>{fy.slice(0, 4)}年度の宿泊日数: {fyNights}/{STAY_LIMIT_DAYS}日</strong>
          <span className="muted small">(残り {Math.max(0, left!)}日。4月1日正午〜翌年4月1日正午で数えます)</span>
          <div className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (fyNights / STAY_LIMIT_DAYS) * 100)}%` }} /></div>
          {left! <= 30 && <p className="small">{left! <= 0 ? "上限に達しました。今年度は、これ以上の予約を登録できません。" : "上限が近づいています。予約の受け付けに注意してください。"}</p>}
        </div>
      )}
      {!readOnly && (
        <form className="card" onSubmit={add}>
          <h2>予約(架空)を登録</h2>
          <div className="two">
            <label>チェックイン日<input type="date" required value={checkin} onChange={(e) => setCheckin(e.target.value)} /></label>
            <label>チェックアウト日<input type="date" required value={checkout} onChange={(e) => setCheckout(e.target.value)} /></label>
          </div>
          {nightsNew > 0 && <p className="muted">{nightsNew}泊</p>}
          <label>宿泊者数<input type="number" min={1} max={50} required value={guests} onChange={(e) => changeGuests(Math.max(1, Number(e.target.value) || 1))} /></label>
          <fieldset className="nats">
            <legend>国籍の内訳(定期報告に使います)</legend>
            <datalist id="countries">{COUNTRY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
            {nats.map((n, i) => (
              <div className="nat-row" key={i}>
                <input aria-label={`国籍${i + 1}`} list="countries" value={n.country} onChange={(e) => setNat(i, { country: e.target.value })} />
                <input aria-label={`人数${i + 1}`} type="number" min={1} value={n.count} onChange={(e) => setNat(i, { count: Math.max(1, Number(e.target.value) || 1) })} />
                <span>人</span>
                {nats.length > 1 && <button type="button" className="small" onClick={() => setNats(nats.filter((_, idx) => idx !== i))}>削除</button>}
              </div>
            ))}
            <button type="button" className="small" onClick={() => setNats([...nats, { country: "", count: 1 }])}>国籍を追加</button>
            <p className={natSum === guests ? "muted" : "error"}>合計 {natSum}人(宿泊者数 {guests}人)</p>
          </fieldset>
          <label>予約の呼び名(架空)<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: 予約D(架空)" /></label>
          <label>滞在コード(架空)<input value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <p className="muted">登録すると、チェックアウト日の清掃タスクが自動でできます。同じ期間の予約や、年間180日を超える予約は登録できません。</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>{busy ? "登録中…" : "登録する"}</button>
        </form>
      )}
      {readOnly && error && <p className="error" role="alert">{error}</p>}
      {stays.length === 0 && <p className="muted">予約はまだありません。</p>}
      <ul className="items">
        {stays.map((s) => {
          const t = tasks.find((x) => x.stay_id === s.id);
          return (
            <li key={s.id} className="item stay">
              <div className="item-main static">
                <span className="item-title">{fmtDate(s.checkin_date)}〜{fmtDate(s.checkout_date)} {nightsBetween(s.checkin_date, s.checkout_date)}泊・{s.guests}人</span>
                <span className="muted small">{s.label || "(呼び名なし)"} ・ {natText(s.nationalities)}{s.stay_code ? ` ・ 滞在コード ${s.stay_code}` : ""}</span>
                {t && (
                  <span className={`badge ${isOverdue(t) ? "danger" : t.status === "done" ? "ok" : ""}`}>
                    清掃: {isOverdue(t) ? "期限超過" : STATUS_LABEL[t.status]}
                  </span>
                )}
              </div>
              {!readOnly && <button className="small danger move-btn" onClick={() => remove(s)}>削除</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

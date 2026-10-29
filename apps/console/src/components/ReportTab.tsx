import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { STAY_LIMIT_DAYS } from "../types";
import type { StayReport } from "../types";
import { fiscalYearStart, natText, todayJst } from "../lib/format";
import { downloadCsv } from "../lib/csv";

const md = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${m}/${d}`; };

// 定期報告の集計(住宅宿泊事業法: 偶数月の15日までに、前2か月分を報告)
export default function ReportTab({ propertyId, canDownload }: { propertyId: string; canDownload: boolean }) {
  const today = todayJst();
  const currentFy = fiscalYearStart(today);
  const fyOptions = [-1, 0].map((d) => `${Number(currentFy.slice(0, 4)) + d}-04-01`);
  const [fy, setFy] = useState(currentFy);
  const [report, setReport] = useState<StayReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setReport(null);
    supabase.rpc("stay_report", { p_property: propertyId, p_fy_start: fy }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setError("集計を読み込めませんでした。"); return; }
      setError("");
      setReport(data as StayReport);
    });
    return () => { alive = false; };
  }, [propertyId, fy]);

  function save() {
    if (!report) return;
    downloadCsv(`report-${fy.slice(0, 4)}.csv`, [
      ["年度", "期間", "報告期限", "宿泊させた日数", "宿泊者数", "延べ宿泊者数", "国籍別の内訳"],
      ...report.periods.map((p) => [
        `${fy.slice(0, 4)}年度`, `${p.start}〜${p.end}`, p.due, p.nights, p.guests, p.guest_nights,
        Object.entries(p.nationalities).map(([c, n]) => `${c}:${n}`).join(" / "),
      ]),
    ]);
  }

  return (
    <section>
      <div className="row-between">
        <label className="inline">年度
          <select value={fy} onChange={(e) => setFy(e.target.value)}>
            {fyOptions.map((o) => <option key={o} value={o}>{o.slice(0, 4)}年度</option>)}
          </select>
        </label>
        {canDownload && <button className="small" onClick={save} disabled={!report}>報告の集計をCSVで保存</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!report && !error && <p>読み込み中…</p>}
      {report && (
        <>
          <div className={`fy-box ${STAY_LIMIT_DAYS - report.fy_nights <= 0 ? "full" : STAY_LIMIT_DAYS - report.fy_nights <= 30 ? "warn" : ""}`}>
            <strong>宿泊させた日数(年度の合計): {report.fy_nights}/{STAY_LIMIT_DAYS}日</strong>
            <div className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (report.fy_nights / STAY_LIMIT_DAYS) * 100)}%` }} /></div>
          </div>
          <div className="table-wrap">
            <table className="report">
              <thead>
                <tr><th>期間</th><th>報告期限</th><th>宿泊させた日数</th><th>宿泊者数</th><th>延べ宿泊者数</th><th>国籍別の内訳</th></tr>
              </thead>
              <tbody>
                {report.periods.map((p) => {
                  const reporting = p.end < today && today <= p.due;
                  return (
                    <tr key={p.start} className={reporting ? "now" : ""}>
                      <td>{md(p.start)}〜{md(p.end)}{reporting && <span className="badge danger">報告の時期</span>}</td>
                      <td>{md(p.due)}</td>
                      <td className="num">{p.nights}日</td>
                      <td className="num">{p.guests}人</td>
                      <td className="num">{p.guest_nights}人</td>
                      <td>{Object.keys(p.nationalities).length ? natText(p.nationalities) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="howto">
            <summary>集計の考え方</summary>
            <ul>
              <li>宿泊させた日数: 正午から翌日の正午までを1日とし、期間の中の夜の日付を数えます(重なりは1日)。</li>
              <li>宿泊者数: 期間の中に1泊でもある予約の人数を足します。2つの期間にまたがる予約は、両方の期間で数えます。</li>
              <li>延べ宿泊者数: 期間の中の1泊ごとに、その予約の人数を足します(1人が3泊なら3人)。</li>
              <li>国籍別の内訳: 宿泊者数と同じ数え方で、国籍ごとに足します。</li>
              <li>報告は、届出住宅ごとに、偶数月の15日までに前2か月分を行います(宿泊が0日でも必要)。管理を委託していても、報告はオーナー(住宅宿泊事業者)の責務です。</li>
              <li>数え方の細かい扱い(期間をまたぐ予約など)は、届け出先の自治体の考え方を確認してください。民泊制度運営システムへの入力は、この数字をもとに行います。</li>
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

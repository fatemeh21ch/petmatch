"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HBars, Sparkline, TimeChart } from "@/components/Charts";
import Guard from "@/components/Guard";
import { Empty, Stars, Svg, Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { dogArt, pkgSVG } from "@/lib/art";
import { fa, fd } from "@/lib/format";

function Dashboard() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<"clicks" | "gap" | "views">("clicks");
  const [allAlerts, setAllAlerts] = useState(false);
  useEffect(() => { api("/api/v1/seller/dashboard").then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="notice">{err}</div>;
  if (!d) return <div className="skeleton" style={{ height: 420, marginTop: 24 }} />;
  if (d.status === "pending") return (
    <Empty art={dogArt({ sweater: "#6b5bd1" })}>
      <h2 style={{ fontSize: 20 }}>{d.user.store_name || "فروشگاه شما"} در انتظار تأیید است</h2>
      <p>{d.message}</p>
      <p className="hint">قدم بعدی: فید محصولات (CSV، XML یا API) را به پشتیبانی بدهید تا آگهی‌ها با همان پایپ‌لاین یکسان‌سازی و تطبیق وارد شوند.</p>
    </Empty>
  );

  const k = d.kpis, s = d.seller;
  const dates = d.series.map((r: any) => r[0]);
  const clicks = d.series.map((r: any) => r[2]);
  const views = d.series.map((r: any) => r[1]);
  const diff = k.clicks_yesterday ? Math.round(((k.clicks_today - k.clicks_yesterday) / k.clicks_yesterday) * 100) : 0;
  const rows = [...d.listings].sort((a, b) => sort === "gap" ? (b.gap_pct ?? -99) - (a.gap_pct ?? -99) : (b[sort] || 0) - (a[sort] || 0));
  const top = d.listings.filter((r: any) => r.clicks).slice(0, 6);

  return (
    <>
      <div className="dash-head">
        <span className="logo-tile" style={{ background: s.color }}>{s.name.slice(0, 1)}</span>
        <div>
          <h1>پنل فروشنده · {s.name}</h1>
          <div className="meta">{s.verified && <span className="pill good"><Ui n="shield" s={12} /> تأییدشده</span>}<Stars r={s.rating} /> {fa(s.rating)}
            <span>·</span><span className="ltr" style={{ direction: "ltr" }}>{s.website.replace("https://", "")}</span><span>·</span><span>فرمت فید: {s.format}</span></div>
        </div>
        <div className="acts"><Link className="btn btn-ghost btn-sm" href={`/store/${s.id}/${d.listings[0]?.listing_id}`}>دیدن فروشگاه</Link></div>
      </div>

      <div className="kcards">
        <div className="kcard" style={{ background: "var(--t2)" }}><div className="k">کلیک امروز (تا این لحظه)</div><div className="v">{fa(k.clicks_today)}</div>
          <div className={`d ${diff >= 0 ? "up" : "down"}`}>{diff >= 0 ? "▲" : "▼"} {fa(Math.abs(diff))}٪ نسبت به دیروز ({fa(k.clicks_yesterday)})</div></div>
        <div className="kcard" style={{ background: "var(--t5)" }}><div className="k">کلیک ۳۰ روز</div><div className="v">{fa(k.clicks_30d)}</div><Sparkline values={clicks} color="#2e9b62" /></div>
        <div className="kcard" style={{ background: "var(--t4)" }}><div className="k">بازدید ۳۰ روز</div><div className="v">{fa(k.views_30d)}</div><Sparkline values={views} color="#c79a1e" /></div>
        <div className="kcard" style={{ background: "var(--t3)" }}><div className="k">نرخ کلیک (CTR)</div><div className="v">{fa(k.ctr)}٪</div><div className="d">کلیک ÷ بازدید محصول</div></div>
        <div className="kcard" style={{ background: "var(--t7)" }}><div className="k">محصولات موجود</div><div className="v">{fa(k.in_stock)} <small style={{ fontSize: 14 }}>از {fa(k.listings)}</small></div></div>
        <div className="kcard" style={{ background: "var(--t8)" }}><div className="k">ارزان‌ترین بازار در</div><div className="v">{fa(k.first_place)} <small style={{ fontSize: 14 }}>محصول</small></div><div className="d">رتبه ۱ قیمت نهایی</div></div>
      </div>

      <div className="grid2 sec" style={{ marginTop: 18 }}>
        <div className="card-p">
          <h3>کلیک روزانه روی «خرید از فروشگاه»</h3>
          <div className="sub">۳۰ روز گذشته · هر کلیک از /api/v1/go ثبت می‌شود و کاربر را به صفحه شما می‌برد</div>
          <TimeChart dates={dates} series={[
            { label: "کلیک", color: "#13566c", values: clicks, kind: "bar" },
            { label: "بازدید ÷ ۱۰", color: "#f4c542", values: views.map((v: number) => v / 10), kind: "line" },
          ]} />
        </div>
        <div className="card-p">
          <h3>هشدارهای قیمت و موجودی</h3>
          <div className="sub">کارهایی که کلیک بیشتری می‌آورند</div>
          <div className="alerts">{d.alerts.length ? (allAlerts ? d.alerts : d.alerts.slice(0, 4)).map((a: any, i: number) => <div key={i} className={`alert ${a.level}`}>{fd(a.text)}</div>)
            : <div className="alert info">همه قیمت‌ها به‌روز و رقابتی‌اند. 🎉</div>}</div>
          {d.alerts.length > 4 && <button className="linkish" style={{ marginTop: 6 }} onClick={() => setAllAlerts(!allAlerts)}>{allAlerts ? "نمایش کمتر" : `${fa(d.alerts.length - 4)} هشدار دیگر`}</button>}
          <h3 style={{ marginTop: 16 }}>پرکلیک‌ترین محصولات</h3>
          <div style={{ marginTop: 8 }}><HBars rows={top.map((r: any) => ({ label: fd(r.name_fa).replace(/^(غذای خشک|غذای تر|خاک|تشویقی) (گربه|سگ) /, "").replace(/ وزن .*| حجم .*/, ""), note: fd(r.name_fa), value: r.clicks, color: s.color }))} /></div>
        </div>
      </div>

      <section className="sec">
        <div className="sec-h"><div><h2>محصولات شما <b>در برابر رقبا</b></h2><div className="sub">جایگاه قیمت نهایی (کالا + ارسال) بین فروشگاه‌هایی که همین محصول را دارند</div></div>
          <div className="sortbar" style={{ margin: 0 }}>{([["clicks", "کلیک"], ["views", "بازدید"], ["gap", "فاصله با ارزان‌ترین"]] as const).map(([k2, l]) => (
            <button key={k2} className="sort" aria-pressed={sort === k2} onClick={() => setSort(k2)}>{l}</button>))}</div></div>
        <div className="table-wrap"><table>
          <thead><tr><th>محصول</th><th>قیمت نهایی</th><th>جایگاه</th><th>ارزان‌ترین رقیب</th><th>بازدید</th><th>کلیک</th><th>CTR</th><th>وضعیت</th></tr></thead>
          <tbody>{rows.map((r: any) => (
            <tr key={r.listing_id}>
              <td style={{ minWidth: 260 }}>{r.product_id ? <Link href={`/p/${r.product_id}`} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Svg className="mini-thumb" html={pkgSVG(r, 36)} /><span>{fd(r.name_fa)}</span></Link> : <span>{r.title} <span className="pill warn">در صف بررسی تطبیق</span></span>}</td>
              <td>{fa(r.total)}{r.shipping ? <small className="muted"> (ارسال {fa(r.shipping)})</small> : null}</td>
              <td>{r.position ? <span className={`pos ${r.position === 1 ? "p1" : ""}`}>{fa(r.position)} از {fa(r.competitors)}</span> : "—"}</td>
              <td>{r.best_rival ? <>{r.best_rival.seller}<br /><small className={r.gap_pct > 0 ? "fit no" : "fit ok"}>{r.gap_pct > 0 ? `شما ${fa(r.gap_pct)}٪ گران‌تر` : r.gap_pct < 0 ? `شما ${fa(Math.abs(r.gap_pct))}٪ ارزان‌تر` : "هم‌قیمت"}</small></> : <span className="muted">رقیبی ندارد</span>}</td>
              <td>{fa(r.views)}</td><td><b>{fa(r.clicks)}</b></td><td>{fa(r.ctr)}٪</td>
              <td>{r.anomaly ? <span className="pill bad">قیمت مشکوک</span> : r.stale ? <span className="pill warn">قیمت قدیمی</span> : !r.available ? <span className="pill">ناموجود</span> : <span className="pill good">فعال</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="hint">آمار ۳۰ روز گذشته نمایشی است (داده ساختگی)؛ کلیک‌ها و بازدیدهایی که همین الان در سایت انجام می‌شود واقعاً به آن اضافه می‌شوند.</p>
      </section>
    </>
  );
}

export default function SellerPage() {
  return <Guard role="seller"><Dashboard /></Guard>;
}

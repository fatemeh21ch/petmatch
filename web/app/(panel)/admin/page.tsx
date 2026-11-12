"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Donut, HBars, Sparkline, TimeChart } from "@/components/Charts";
import AdminStores from "@/components/AdminStores";
import Guard from "@/components/Guard";
import { Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/client";
import { fa, fd, q2h } from "@/lib/format";

function Overview() {
  const [d, setD] = useState<any>(null);
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    api("/api/v1/admin/analytics").then(setD).catch(() => {});
    api("/api/v1/admin/pipeline").then(setM).catch(() => {});
  }, []);
  if (!d || !m) return <div className="skeleton" style={{ height: 500 }} />;
  const s = d.search, ev = m.stats.evaluation;
  const dates = d.traffic.map((r: any) => r[0]);
  const clicks = d.traffic.map((r: any) => r[2]);
  const views = d.traffic.map((r: any) => r[1]);
  return (
    <>
      <div className="kcards">
        <div className="kcard" style={{ background: "var(--t2)" }}><div className="k">جست‌وجو (۳۰ روز)</div><div className="v">{fa(s.total)}</div><Sparkline values={s.series.map((r: any) => r[1])} /></div>
        <div className="kcard" style={{ background: "var(--t6)" }}><div className="k">جست‌وجوی بی‌نتیجه</div><div className="v">{fa(Math.round(s.zero_rate * 1000) / 10)}٪</div><div className="d">{fa(s.zero)} جست‌وجو</div></div>
        <div className="kcard" style={{ background: "var(--t5)" }}><div className="k">کلیک به فروشگاه‌ها</div><div className="v">{fa(clicks.reduce((a: number, b: number) => a + b, 0))}</div><Sparkline values={clicks} color="#2e9b62" /></div>
        <div className="kcard" style={{ background: "var(--t4)" }}><div className="k">پیشنهاد موجود</div><div className="v">{fa(d.offers.in_stock)} <small style={{ fontSize: 14 }}>از {fa(d.offers.total)}</small></div></div>
        <div className="kcard" style={{ background: "var(--t3)" }}><div className="k">قیمت مشکوک / قدیمی</div><div className="v">{fa(d.offers.anomalies)} / {fa(d.offers.stale)}</div></div>
        <div className="kcard" style={{ background: "var(--t7)" }}><div className="k">Precision / Recall تطبیق</div><div className="v">{ev ? `${fa(Math.round(ev.precision * 100))}٪ / ${fa(Math.round(ev.recall * 100))}٪` : "—"}</div></div>
        <div className="kcard" style={{ background: "var(--t8)" }}><div className="k">کاربران</div><div className="v">{fa(d.users.total)}</div>
          <div className="d">{fa(d.users.by_role.buyer)} خریدار · {fa(d.users.by_role.seller)} فروشنده · {fa(d.users.by_role.admin)} مدیر</div></div>
      </div>

      <div className="grid2 sec" style={{ marginTop: 18 }}>
        <div className="card-p"><h3>جست‌وجوی روزانه</h3><div className="sub">حجم جست‌وجو و تعداد جست‌وجوهای بی‌نتیجه · ۳۰ روز</div>
          <TimeChart dates={s.series.map((r: any) => r[0])} series={[
            { label: "همه جست‌وجوها", color: "#4f9ac2", values: s.series.map((r: any) => r[1]), kind: "area" },
            { label: "بی‌نتیجه", color: "#e0892b", values: s.series.map((r: any) => r[2]), kind: "bar" },
          ]} /></div>
        <div className="card-p"><h3>جست‌وجوهای بی‌نتیجه</h3><div className="sub">چیزی که کاربران می‌خواهند و ما نداریم</div>
          <div className="qlist">{s.top_zero.map(([q, n]: [string, number]) => <div key={q} className="qrow zero"><span>{q}</span><b>{fa(n)}</b></div>)}</div>
          <div className="insight">💡 فرصت توسعه: دسته‌هایی مثل قلاده، اسباب‌بازی و شامپو هنوز در کاتالوگ نیستند؛ این‌ها اولویت دسته‌های بعدی‌اند.</div></div>
      </div>

      <div className="grid2 sec">
        <div className="card-p"><h3>کلیک روزانه به فروشگاه‌ها</h3><div className="sub">کلیک روی «خرید» (درآمد ارجاع) و بازدید صفحه محصول ÷ ۱۰</div>
          <TimeChart dates={dates} series={[
            { label: "کلیک", color: "#13566c", values: clicks, kind: "bar" },
            { label: "بازدید ÷ ۱۰", color: "#f4c542", values: views.map((v: number) => v / 10), kind: "line" },
          ]} /></div>
        <div className="card-p"><h3>سهم کلیک فروشگاه‌ها</h3><div className="sub">۳۰ روز</div>
          <HBars rows={[...d.sellers].sort((a, b) => b.clicks - a.clicks).map((x: any) => ({ label: x.name, value: x.clicks, color: x.color }))} /></div>
      </div>

      <div className="grid3 sec">
        <div className="card-p"><h3>نتیجه تطبیق آگهی‌ها</h3><div className="sub">{fa(m.stats.raw)} آگهی خام ← {fa(m.stats.products)} محصول</div><Donut rows={d.matching} size={150} /></div>
        <div className="card-p"><h3>تازگی قیمت‌ها</h3><div className="sub">زمان از آخرین بررسی هر پیشنهاد</div>
          <HBars rows={d.freshness.map((x: any, i: number) => ({ label: x.label, value: x.count, color: ["#2e9b62", "#4f9ac2", "#f4c542", "#e0892b"][i] }))} /></div>
        <div className="card-p"><h3>محصولات در هر دسته</h3><div className="sub">{fa(m.stats.products)} محصول یکتا</div>
          <HBars rows={d.categories.map((x: any) => ({ label: x.label, value: x.count, color: "var(--sky-2)" }))} /></div>
      </div>

      <div className="grid2 sec">
        <div className="card-p"><h3>سلامت فید فروشگاه‌ها</h3><div className="sub">پیشنهادهای هر فروشگاه و مشکلاتشان</div>
          <div className="table-wrap"><table><thead><tr><th>فروشگاه</th><th>پیشنهاد</th><th>موجود</th><th>قدیمی</th><th>مشکوک</th><th>امتیاز</th></tr></thead>
            <tbody>{d.sellers.map((x: any) => <tr key={x.name}><td><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: x.color, marginLeft: 6 }} />{x.name}{x.status === "blocked" && <span className="pill bad" style={{ marginRight: 6 }}>مسدود</span>}</td>
              <td>{fa(x.listings)}</td><td>{fa(x.in_stock)}</td><td className={x.stale ? "fit no" : ""}>{fa(x.stale)}</td><td className={x.anomalies ? "fit no" : ""}>{fa(x.anomalies)}</td><td>{fa(x.rating)}</td></tr>)}</tbody></table></div></div>
        <div className="card-p"><h3>پرتکرارترین جست‌وجوها</h3><div className="sub">۳۰ روز</div>
          <div className="qlist">{s.top.slice(0, 8).map(([q, n]: [string, number]) => <Link key={q} className="qrow" href={q2h(q)}><span>{q}</span><b>{fa(n)}</b></Link>)}</div>
          {d.users.pending_sellers.length > 0 && <><h3 style={{ marginTop: 14 }}>فروشندگان در انتظار تأیید</h3>
            <div className="qlist" style={{ marginTop: 6 }}>{d.users.pending_sellers.map((u: any) => <div key={u.phone} className="qrow"><span>{u.store_name} · {u.name}</span><span className="ltr" style={{ direction: "ltr" }}>{u.phone}</span></div>)}</div></>}
        </div>
      </div>
      <p className="hint">نمودارهای ۳۰ روزه داده نمایشی هستند؛ جست‌وجوها، بازدیدها و کلیک‌هایی که همین الان در سایت انجام می‌شود واقعاً به آن‌ها اضافه می‌شوند.</p>
    </>
  );
}

function Matching() {
  const [d, setD] = useState<any>(null);
  const load = () => api("/api/v1/admin/pipeline").then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d) return <div className="skeleton" style={{ height: 400 }} />;
  const s = d.stats, ev = s.evaluation;
  const L: Record<string, string> = { brand: "برند", species: "حیوان", type: "نوع", amount: "وزن/حجم", stage: "رده سنی" };
  const decide = async (listing_id: string, action: string, product_id?: string) => {
    try {
      await api("/api/v1/admin/decisions", { method: "POST", json: { listing_id, action, product_id: product_id || null } });
      toast(action === "approve" ? "ادغام شد؛ کاتالوگ به‌روز شد." : "به‌عنوان محصول جداگانه ثبت شد.");
      load();
    } catch { toast("ثبت تصمیم ناموفق بود."); }
  };
  return (
    <>
      <div className="sec-h"><div><div className="sub">فیدهای خام ← اعتبارسنجی ← یکسان‌سازی ← استخراج ویژگی ← تطبیق ← کاتالوگ · ادغام خودکار از {fa(d.thresholds.auto)}، بررسی انسانی از {fa(d.thresholds.review)}</div></div>
        <button className="btn btn-ghost btn-sm" onClick={async () => { await api("/api/v1/admin/reset", { method: "POST" }); toast("تصمیم‌ها بازنشانی شد."); load(); }}>بازنشانی تصمیم‌ها</button></div>
      <div className="kpis">
        <div className="kpi"><div className="v">{fa(s.raw)}</div><div className="k">آگهی خام از {fa(d.sellers.length)} فروشگاه</div></div>
        <div className="kpi"><div className="v">{fa(s.products)}</div><div className="k">محصول یکتا</div></div>
        <div className="kpi"><div className="v">{fa(s.auto)}</div><div className="k">ادغام خودکار</div></div>
        <div className="kpi"><div className="v">{fa(s.review)}</div><div className="k">منتظر بررسی انسانی</div></div>
        <div className="kpi"><div className="v">{fa(s.blocked)}</div><div className="k">ادغام اشتباهِ جلوگیری‌شده</div></div>
        {ev && <div className="kpi"><div className="v">{fa(Math.round(ev.precision * 1000) / 10)}٪</div><div className="k">Precision تطبیق</div></div>}
        {ev && <div className="kpi"><div className="v">{fa(Math.round(ev.recall * 1000) / 10)}٪</div><div className="k">Recall تطبیق</div></div>}
      </div>
      <p className="hint">درصد پرشدن ویژگی‌ها: {Object.entries(s.fill_rate).map(([k, v]) => `${L[k]} ${fa(v as number)}٪`).join(" · ")}</p>

      <section className="sec"><div className="sec-h"><div><h2>صف <b>بررسی تطبیق</b></h2><div className="sub">هر تصمیم کاتالوگ را فوراً بازسازی می‌کند</div></div></div>
        {d.review.length ? <div style={{ display: "grid", gap: 12 }}>{d.review.map((r: any) => (
          <div key={r.listing_id} className="review">
            <div className="rating"><span className="pill">{r.seller}</span><span className="pill">{fa(r.price)} تومان</span><span className="value-pill">شباهت {fa(Math.round(r.score * 100))}٪</span></div>
            <div className="raw-title">«{r.title}»</div>
            <div>{Object.entries(r.attrs).filter(([, v]: any) => v && (!Array.isArray(v) || v.length)).map(([k, v]: any) => <code key={k} style={{ marginLeft: 4 }}>{k}={Array.isArray(v) ? v.join("+") : v}</code>)}</div>
            <ul className="reasons">{r.reasons.map((x: string) => <li key={x}>{x}</li>)}</ul>
            <div className="cands">{r.candidates.map((c: any) => (
              <div key={c.pid} className="cand"><div><b>{fd(c.name)}</b><small>{fa(c.offers)} آگهی · مثل: {c.titles.join(" | ")}</small></div>
                <button className="btn btn-good btn-sm" onClick={() => decide(r.listing_id, "approve", c.pid)}>همین محصول است</button></div>))}</div>
            <div><button className="btn btn-bad btn-sm" onClick={() => decide(r.listing_id, "reject")}>هیچ‌کدام، محصول جداگانه است</button></div>
          </div>))}</div> : <div className="panel muted">صف خالی است. 🎉</div>}
      </section>
      <section className="sec"><div className="sec-h"><div><h2>ادغام‌هایی که <b>جلویشان گرفته شد</b></h2><div className="sub">عنوان‌های شبیه، ولی محصول متفاوت</div></div></div>
        <div className="table-wrap"><table><thead><tr><th>آگهی</th><th>شبیه به</th><th>دلیل عدم ادغام</th></tr></thead>
          <tbody>{d.blocked.map((b: any, i: number) => <tr key={i}><td>{b.title}</td><td>{b.vs}</td><td>{b.why.join("، ")}</td></tr>)}</tbody></table></div></section>
      <section className="sec"><div className="sec-h"><div><h2>نمونه <b>یکسان‌سازی داده خام</b></h2><div className="sub">دو نمونه از فرمت هر فروشگاه</div></div></div>
        <div className="table-wrap"><table><thead><tr><th>فروشگاه</th><th>عنوان خام</th><th>قیمت خام</th><th>متن یکسان‌شده</th><th>ویژگی‌ها</th><th>تصمیم</th></tr></thead>
          <tbody>{d.samples.map((x: any, i: number) => <tr key={i}><td>{x.seller}</td><td>{x.raw}{x.extra && <><br /><small className="muted">{x.extra}</small></>}</td>
            <td>{x.raw_price}<br /><small className="muted">← {fa(x.price)} تومان</small></td><td><code>{x.normalized}</code></td>
            <td>{Object.entries(x.attrs).filter(([, v]) => v).map(([k, v]: any) => <code key={k} style={{ marginLeft: 4 }}>{k}={v}{x.inferred.includes(k) ? "*" : ""}</code>)}</td>
            <td>{({ auto: "ادغام خودکار", new: "محصول جدید", review: "بررسی", approved: "تأیید انسانی" } as any)[x.decision]}</td></tr>)}</tbody></table></div>
        <p className="hint">* استنتاج‌شده (مثلاً نوع «غذای خشک» از وزن بالای ۳۰۰ گرم بدون نشانه غذای تر).</p></section>
    </>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<"overview" | "matching" | "stores">("overview");
  return (
    <Guard role="admin">
      <div className="dash-head">
        <span className="logo-tile" style={{ background: "var(--ink)" }}><Ui n="shield" s={28} /></span>
        <div><h1>پنل مدیریت پت‌مچ</h1><div className="meta">داده، جست‌وجو، کلیک، کیفیت تطبیق محصول و فروشگاه‌ها</div></div>
      </div>
      <div className="tabs-top" role="tablist">
        <button role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>داشبورد و نمودارها</button>
        <button role="tab" aria-selected={tab === "matching"} onClick={() => setTab("matching")}>تطبیق محصول و داده خام</button>
        <button role="tab" aria-selected={tab === "stores"} onClick={() => setTab("stores")}>فروشگاه‌ها</button>
      </div>
      {tab === "overview" ? <Overview /> : tab === "matching" ? <Matching /> : <AdminStores />}
    </Guard>
  );
}

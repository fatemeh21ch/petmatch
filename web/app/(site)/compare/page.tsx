"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Empty, Stars, Svg, Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { catArt, pkgSVG } from "@/lib/art";
import { petQuery, useCompare, usePets } from "@/lib/client";
import { fa, fd, unitLabel } from "@/lib/format";

type Row = { label: string; hint?: string; get: (x: any) => React.ReactNode; best?: (x: any) => number | null; better?: "low" | "high" };

const ROWS: Row[] = [
  { label: "برند", get: (x) => x.brand_fa },
  { label: "نوع", get: (x) => `${x.type_fa || ""} ${x.species_fa || ""}` },
  { label: "وزن / حجم", get: (x) => fd(x.qty_label) || "—" },
  { label: "رده سنی", get: (x) => x.stage_fa || "—" },
  { label: "ویژگی‌ها", get: (x) => (x.attributes.length ? x.attributes.join("، ") : "—") },
  { label: "بهترین قیمت نهایی", hint: "کالا + ارسال، از بهترین پیشنهاد", get: (x) => (x.best ? <><b>{fa(x.best.total)}</b> <small>تومان</small><div className="muted">{x.best.seller}</div></> : "ناموجود"),
    best: (x) => x.best?.total ?? null, better: "low" },
  { label: "ارزان‌ترین قیمت نهایی", get: (x) => (x.cheapest ? <>{fa(x.cheapest.total)} <small>تومان</small><div className="muted">{x.cheapest.seller}</div></> : "—"),
    best: (x) => x.cheapest?.total ?? null, better: "low" },
  { label: "قیمت هر کیلو / لیتر", hint: "فقط بین محصولات هم‌واحد قابل مقایسه است", get: (x) => (x.best?.unit_price ? <>{fa(x.best.unit_price)} <small>تومان هر {unitLabel(x.unit)}</small></> : "—"),
    best: (x) => x.best?.unit_price ?? null, better: "low" },
  { label: "هزینه ماهانه تغذیه", hint: "برای حیوان فعال، تخمینی", get: (x) => (x.feeding ? <>{fa(x.feeding.monthly_cost)} <small>تومان</small><div className="muted">هر بسته ~{fa(Math.round(x.feeding.weeks_per_pack * 10) / 10)} هفته</div></> : "—"),
    best: (x) => x.feeding?.monthly_cost ?? null, better: "low" },
  { label: "امتیاز ارزش خرید", hint: "همان امتیاز رتبه‌بندی جست‌وجو (۰ تا ۱۰۰)", get: (x) => (x.value ? fa(x.value) : "—"), best: (x) => x.value || null, better: "high" },
  { label: "بازه قیمت فروشگاه‌ها", get: (x) => (x.price_range ? `${fa(x.price_range[0])} تا ${fa(x.price_range[1])}` : "—") },
  { label: "فروشگاه‌های دارای موجودی", get: (x) => `${fa(x.available_count)} از ${fa(x.offers_count)}`, best: (x) => x.available_count, better: "high" },
  { label: "امتیاز بهترین فروشنده", get: (x) => (x.best ? <><Stars r={x.best.seller_rating} /> {fa(x.best.seller_rating)}</> : "—") },
  { label: "روند قیمت ۳۰ روز", get: (x) => (x.trend == null ? "—" : <span className={x.trend > 0 ? "fit no" : "fit ok"}>{x.trend > 0 ? "▲" : x.trend < 0 ? "▼" : ""} {fa(Math.abs(x.trend))}٪</span>) },
  { label: "تناسب با حیوان شما", get: (x) => (x.fit_notes?.length ? x.fit_notes.map(([t, ok]: [string, boolean], i: number) => <div key={i} className={`fit ${ok ? "ok" : "no"}`}>{ok ? "✓" : "!"} {fd(t)}</div>) : <span className="muted">—</span>) },
];

export default function ComparePage() {
  const { ids, toggle, set, clear } = useCompare();
  const { active } = usePets();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {   // a shared link (?ids=a,b) replaces the local list
    const shared = new URLSearchParams(window.location.search).get("ids");
    if (shared) set(shared.split(",").filter(Boolean));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ids.length) { setD({ items: [] }); return; }
    api(`/api/v1/compare?ids=${ids.join(",")}${petQuery(active)}`).then(setD).catch((e) => setErr(e.message));
  }, [ids.join(","), active?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="notice" style={{ marginTop: 24 }}>{err}</div>;
  if (!d) return <div className="skeleton" style={{ height: 420, marginTop: 24 }} />;
  if (d.items.length < 2) return (
    <Empty art={catArt({ glasses: true })}>
      <h2 style={{ fontSize: 20 }}>{d.items.length ? "یک محصول دیگر برای مقایسه انتخاب کن" : "هنوز محصولی برای مقایسه انتخاب نکرده‌ای"}</h2>
      <p>روی دکمه «مقایسه» در کارت محصول یا صفحه محصول بزن؛ تا ۴ محصول را کنار هم می‌بینی.</p>
      <Link className="btn btn-primary" href="/search?q=غذای خشک گربه">رفتن به محصولات</Link>
    </Empty>
  );

  const items = d.items;
  const winner = (r: Row) => {
    if (!r.best) return null;
    const vals = items.map((x: any) => r.best!(x)).filter((v: any) => v != null) as number[];
    if (vals.length < 2 || new Set(vals).size < 2) return null;
    return r.better === "high" ? Math.max(...vals) : Math.min(...vals);
  };
  const mixedUnits = new Set(items.map((x: any) => `${x.type}|${x.unit}`)).size > 1;
  const share = typeof window !== "undefined" ? `${window.location.origin}/compare?ids=${ids.join(",")}` : "";

  return (
    <>
      <div className="dash-head">
        <span className="logo-tile" style={{ background: "var(--brand)" }}><Ui n="compare" s={28} /></span>
        <div><h1>مقایسه محصولات</h1>
          <div className="meta">{fa(items.length)} محصول · بهترین مقدار هر ردیف سبز شده{active ? ` · بر اساس پروفایل ${active.name || "حیوانت"}` : ""}</div></div>
        <div className="acts">
          <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(share); }}>کپی لینک مقایسه</button>
          <button className="btn btn-ghost btn-sm" onClick={clear}>پاک کردن همه</button>
        </div>
      </div>
      {mixedUnits && <div className="notice">این محصولات از یک نوع نیستند (مثلاً غذای خشک و تر)؛ «قیمت هر کیلو» و «امتیاز ارزش» فقط بین محصولات هم‌نوع معنی دارد.</div>}
      {!active && <div className="notice info">برای دیدن «هزینه ماهانه» و «تناسب با حیوان»، در <Link href="/pet">حیوان من</Link> یک پروفایل با وزن بساز.</div>}

      <div className="table-wrap cmp-wrap"><table className="cmp-table">
        <thead><tr><th />{items.map((x: any) => (
          <th key={x.id}>
            <button className="cmp-x" onClick={() => toggle(x.id)} aria-label={`برداشتن ${x.name_fa} از مقایسه`}>×</button>
            <Link href={`/p/${x.id}`} className="cmp-head"><Svg className="cmp-img" html={pkgSVG(x, 90)} /><span>{fd(x.name_fa)}</span></Link>
            {x.best && <a className="btn btn-primary btn-sm" href={`/api/v1/go/${x.best.listing_id}`} target="_blank" rel="nofollow noopener">خرید از {x.best.seller}</a>}
          </th>))}</tr></thead>
        <tbody>{ROWS.map((r) => {
          const w = winner(r);
          return (
            <tr key={r.label}><th scope="row">{r.label}{r.hint && <small>{r.hint}</small>}</th>
              {items.map((x: any) => <td key={x.id} className={w != null && r.best!(x) === w ? "cmp-win" : ""}>{r.get(x)}</td>)}</tr>
          );
        })}</tbody>
      </table></div>
      <p className="hint">قیمت‌ها نهایی‌اند (کالا + ارسال). هزینه ماهانه تخمینی است و جایگزین نظر دامپزشک نیست.</p>
    </>
  );
}

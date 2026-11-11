"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Empty, ProductCard, Svg, Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { catArt, pkgSVG } from "@/lib/art";
import { petQuery, usePets } from "@/lib/client";
import { fa, fd, q2h, TYPE, unitLabel } from "@/lib/format";

const SORTS: [string, string][] = [["best", "بهترین ارزش خرید"], ["monthly", "کمترین هزینه ماهانه"], ["cheapest", "ارزان‌ترین قیمت نهایی"], ["unit_price", "قیمت هر کیلو"], ["rating", "معتبرترین فروشنده"]];
const EXAMPLES = ["رويال كنين کیتن ۲ کیلو", "خاک گربه بدون عطر ارزون‌ترین", "غذای سگ توله زیر ۳ میلیون", "رویل کنن ایندور", "غذای گربه ماهی"];

function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") || "";
  const sort = params.get("sort");
  const { pets, active, setActive } = usePets();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [ai, setAi] = useState<string | null>(null);
  const [f, setF] = useState<{ types: string[] | null; brands: string[] | null; max: number | null; stock: boolean }>({ types: null, brands: null, max: null, stock: false });
  const [showFilters, setShowFilters] = useState(false);
  const pq = petQuery(active);

  useEffect(() => {
    if (!q) return;
    setD(null); setErr(false); setAi(null);
    setF({ types: null, brands: null, max: null, stock: false });
    api(`/api/v1/search?q=${encodeURIComponent(q)}${sort ? "&sort=" + sort : ""}${pq}`)
      .then((res) => {
        setD(res);
        if (res.ai_available && res.results[0]?.best)
          api(`/api/v1/explain?q=${encodeURIComponent(q)}${sort ? "&sort=" + sort : ""}${pq}`).then((x) => setAi(x.text || "")).catch(() => setAi(""));
      })
      .catch(() => setErr(true));
  }, [q, sort, pq]);

  const view = useMemo(() => {
    if (!d) return null;
    const types = [...new Set<string>(d.results.map((r: any) => r.type))];
    const brands = [...new Map<string, string>(d.results.map((r: any) => [r.brand, r.brand_fa])).entries()];
    const prices = d.results.filter((r: any) => r.best).map((r: any) => r.best.total);
    const maxP = Math.max(0, ...prices);
    const minP = prices.length > 1 ? Math.floor(Math.min(...prices) / 10000) * 10000 : 0;
    const ts = f.types ?? types, bs = f.brands ?? brands.map(([k]) => k), mx = f.max ?? maxP;
    const pass = (r: any, skip?: string) => (skip === "type" || ts.includes(r.type)) && (skip === "brand" || bs.includes(r.brand))
      && (!r.best || r.best.total <= mx) && (!f.stock || r.best);
    const list = d.results.filter((r: any) => pass(r));
    const active = ts.length < types.length || bs.length < brands.length || mx < maxP || f.stock;
    return { types, brands, maxP, minP, ts, bs, mx, list, active, pass, outCount: d.results.filter((r: any) => !r.best).length };
  }, [d, f]);

  if (!q) return (
    <div className="sec"><h1 style={{ fontSize: 22 }}>دنبال چه می‌گردی؟</h1>
      <div className="chips" style={{ marginTop: 12 }}>{EXAMPLES.map((e) => <Link key={e} className="qchip" href={q2h(e)}>{e}</Link>)}</div></div>
  );
  if (err) return <Empty art={catArt()}><p>ارتباط با سرور برقرار نشد.</p><button className="btn btn-primary" onClick={() => router.refresh()}>تلاش دوباره</button></Empty>;
  if (!d || !view) return (
    <><div className="crumbs"><span className="skeleton" style={{ width: 200, height: 18, display: "inline-block" }} /></div>
      <div className="s-layout"><div className="skeleton" style={{ height: 420 }} /><div><div className="skeleton" style={{ height: 180 }} />
        <div className="grid" style={{ marginTop: 16 }}>{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 330 }} />)}</div></div></div></>
  );

  const top = d.results[0];
  const chips = d.chips.filter((c: any) => c.key !== "sort");
  const profileExcl = d.chips.filter((c: any) => c.key === "exclude" && c.from_profile);
  const go = (s: string) => router.push(q2h(q, s));
  const toggle = (key: "types" | "brands", v: string, all: string[]) => {
    const cur = f[key] ?? all;
    setF({ ...f, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };

  return (
    <>
      <div className="crumbs"><Link href="/">پت‌مچ</Link> ‹ <span>جست‌وجو</span></div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>نتایج «{q}»</h1>
      <div className="understood">
        <span className="lbl">فهمیدیم دنبال این هستی:</span>
        {chips.length ? chips.map((c: any) => (
          <span key={c.label} className={`chip ${c.from_profile ? "profile" : ""}`} title={c.from_profile ? "از پروفایل حیوان شما" : "از متن جست‌وجو"}>
            {c.from_profile && <Ui n="paw" s={14} />}{fd(c.label)}</span>
        )) : <span className="muted">—</span>}
        {d.ai_used && <span className="chip ai"><Ui n="spark" s={14} /> تفسیر با AI</span>}
        {pets.length > 0 && (
          <label className="pet-switch"><Ui n="paw" s={15} /> پیشنهاد برای:
            <select value={active?.id || "none"} onChange={(e) => setActive(e.target.value)}>
              <option value="none">بدون پروفایل</option>
              {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {d.not_understood && <div className="notice">منظورت از «{d.intent.unknown.join(" ") || q}» را متوجه نشدیم{d.total ? "؛ فقط محصولاتی را نشان می‌دهیم که نامشان خیلی شبیه این کلمه است." : "."} نام برند، نوع حیوان یا محصول (مثلاً «غذای گربه»، «خاک»، «تشویقی سگ») را امتحان کن.</div>}
      {d.relaxed.length > 0 && <div className="notice">محصولی با همه شرایط پیدا نشد؛ شرط «{d.relaxed.join("، ")}» را برداشتیم تا نزدیک‌ترین گزینه‌ها را ببینی.</div>}
      {d.intent.sort === "monthly" && d.feeding_available && <div className="notice info"><Ui n="paw" s={15} /> هزینه ماهانه برای {active?.name || "حیوانت"} تخمین زده شده: از وزن، سن و عقیم بودنش انرژی روزانه حساب می‌شود و با میانگین انرژی غذای خشک/تر به گرم در روز تبدیل می‌شود. عدد تقریبی است، نه از برچسب همین محصول.</div>}
      {d.intent.sort === "monthly" && !d.feeding_available && <div className="notice">برای «کمترین هزینه ماهانه» وزن حیوان لازم است. <Link href="/pet">وزن را در پروفایل وارد کن</Link>.</div>}
      {d.pet_needs_weight && d.intent.sort !== "monthly" && <div className="notice info">اگر وزن {active?.name || "حیوانت"} را در <Link href="/pet">پروفایل</Link> وارد کنی، هزینه ماهانه تغذیه هر غذا را هم می‌بینی.</div>}
      {profileExcl.length > 0 && <div className="notice info">بر اساس پروفایل حیوانت، محصولات حاوی {profileExcl.map((c: any) => c.label.replace("بدون ", "")).join("، ")} حذف شدند.</div>}

      <div className="s-layout">
        <aside className={`filters ${showFilters ? "open" : ""}`} aria-label="فیلترها">
          <h4>نوع محصول</h4>
          {view.types.map((t) => <label key={t}><input type="checkbox" checked={view.ts.includes(t)} onChange={() => toggle("types", t, view.types)} /> {TYPE[t] || "سایر"}
            <small>{fa(d.results.filter((r: any) => r.type === t && view.pass(r, "type")).length)}</small></label>)}
          <h4>برند</h4>
          {view.brands.map(([k, l]) => <label key={k}><input type="checkbox" checked={view.bs.includes(k)} onChange={() => toggle("brands", k, view.brands.map(([x]) => x))} /> {l}
            <small>{fa(d.results.filter((r: any) => r.brand === k && view.pass(r, "brand")).length)}</small></label>)}
          <h4>حداکثر قیمت نهایی</h4>
          <input type="range" min={view.minP} max={view.maxP} step={10000} value={view.mx} aria-label="حداکثر قیمت" onChange={(e) => setF({ ...f, max: +e.target.value })} />
          <div className="range-ends"><span>{fa(view.minP)}</span><span>{fa(view.maxP)}</span></div>
          <div className="hint">تا {fa(view.mx)} تومان</div>
          <h4>موجودی</h4>
          <label className={view.outCount ? "" : "muted"}><input type="checkbox" checked={f.stock} disabled={!view.outCount} onChange={(e) => setF({ ...f, stock: e.target.checked })} /> فقط موجودها
            <small>{view.outCount ? `${fa(view.outCount)} ناموجود` : "همه موجودند"}</small></label>
          {view.active && <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 14 }} onClick={() => setF({ types: null, brands: null, max: null, stock: false })}>حذف فیلترها</button>}
        </aside>
        <div>
          <div className="sortbar" role="group" aria-label="مرتب‌سازی"><span className="lbl">مرتب‌سازی:</span>
            {SORTS.filter(([k]) => k !== "monthly" || d.feeding_available).map(([k, l]) => (
              <button key={k} className="sort" aria-pressed={k === d.intent.sort} onClick={() => go(k)}>{k === "monthly" && <Ui n="paw" s={14} />} {l}</button>
            ))}
            <button className="sort mobile-filter" onClick={() => setShowFilters(!showFilters)}><Ui n="filter" s={16} /> فیلترها</button>
          </div>
          {top?.best && view.list.some((r: any) => r.id === top.id) && (
            <section className="pick" aria-label="بهترین انتخاب">
              <Link className="pick-main" href={`/p/${top.id}`}>
                <Svg className="img" html={pkgSVG(top, 112)} style={{ display: "grid" }} />
                <div><span className="pick-badge"><Ui n="star" s={13} /> بهترین انتخاب برای این جست‌وجو</span>
                  <h3>{fd(top.name_fa)}</h3>
                  <div className="price">{fa(top.best.total)} <small>تومان</small></div>
                  <div className="hint" style={{ color: "var(--brand-2)" }}>از {top.best.seller} · هر {unitLabel(top.unit)} {fa(top.best.unit_price)} تومان · ارزش خرید {fa(top.value)}</div></div>
              </Link>
              <div className="pick-why"><h4><span className="bar" />چرا این گزینه؟</h4>
                <ul>{(d.top_pick?.reasons || []).map((x: string) => <li key={x}>{fd(x)}</li>)}</ul>
                {d.ai_available && (ai === null ? <div className="hint">در حال نوشتن توضیح…</div>
                  : ai ? <div className="ai-text"><span className="tag"><Ui n="spark" s={13} /> خلاصه AI (فقط بر اساس داده‌های بالا)</span>{fd(ai)}</div> : null)}
              </div>
            </section>
          )}
          <div className="meta-line">{view.active ? `${fa(view.list.length)} از ${fa(d.results.length)} محصول (فیلترشده)` : `${fa(view.list.length)} محصول`} · قیمت‌ها با احتساب هزینه ارسال</div>
          {view.list.length ? (
            <div className="grid">{view.list.map((r: any) => <ProductCard key={r.id} r={r} tag={r.best && r.id === top?.id ? "انتخاب اول" : undefined} />)}</div>
          ) : (
            <Empty art={catArt({ glasses: true })}>
              <p>محصول موردنظر پیدا نشد. شاید بتوانی با نام برند یا وزن متفاوت جست‌وجو کنی.</p>
              <div className="chips" style={{ justifyContent: "center" }}>{EXAMPLES.slice(0, 3).map((e) => <Link key={e} className="qchip" href={q2h(e)}>{e}</Link>)}</div>
            </Empty>
          )}
        </div>
      </div>
    </>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<div className="skeleton" style={{ height: 400, marginTop: 24 }} />}><SearchView /></Suspense>;
}

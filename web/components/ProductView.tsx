"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { bowlArt, catArt, dogArt, pkgSVG } from "@/lib/art";
import { petQuery, toast, usePets } from "@/lib/client";
import { ago, fa, fd, q2h, shortToman, SP, TYPE, unitLabel, weeksText } from "@/lib/format";
import { PriceChart } from "./Charts";
import { FavButton, Stars, Svg, Ui } from "./ui";

function FeedBox({ f, petName }: { f: any; petName: string }) {
  return (
    <div className="feedbox">
      <div className="fb-h"><Ui n="paw" s={18} /> هزینه تغذیه برای {petName} <span className="pill">تخمینی</span></div>
      <div className="fb-grid">
        <div><small>روزانه</small><b>~{fa(f.grams_per_day)} گرم</b></div>
        <div><small>این بسته کافی است برای</small><b>~{weeksText(f.weeks_per_pack)}</b></div>
        <div><small>هزینه ماهانه</small><b>~{shortToman(f.monthly_cost)}</b></div>
      </div>
      {f.freshness_warning && <div className="fb-warn">بسته بزرگ است؛ غذای خشک بعد از باز شدن معمولاً ۶ تا ۸ هفته بهترین کیفیت را دارد. اگر ظرف دربسته ندارید، بسته کوچک‌تر را هم در نظر بگیرید.</div>}
      <details><summary>چطور حساب شد؟</summary>
        <p>انرژی پایه = ۷۰ × وزن<sup>۰٫۷۵</sup> = {fa(f.rer)} کیلوکالری · ضریب «{f.factor_label}» = {fa(f.factor)} ← {fa(f.kcal_per_day)} کیلوکالری در روز.
          با میانگین {fa(f.density)} کیلوکالری در هر گرم برای این نوع غذا ← {fa(f.grams_per_day)} گرم در روز. هزینه = قیمت نهایی بهترین پیشنهاد ÷ روزهای مصرف × ۳۰.</p>
        <p>این عدد از برچسب همین محصول نیست؛ مقدار روی بسته و نظر دامپزشک مقدم است.</p>
      </details>
    </div>
  );
}

export default function ProductView({ initial, id }: { initial: any; id: string }) {
  const { active } = usePets();
  const [d, setD] = useState<any>(initial);
  const [view, setView] = useState(0);
  const [tab, setTab] = useState<"spec" | "src">("spec");
  const pq = petQuery(active);

  // re-fetch in the browser: adds the pet-specific estimate and counts one product view for the sellers' dashboards
  useEffect(() => {
    api(`/api/v1/products/${id}?track=true${pq}`).then(setD).catch(() => {});
  }, [id, pq]);

  const p = { ...d.product, brand_en: d.brand_en };
  const best = d.offers.find((o: any) => o.listing_id === d.best_id);
  const cheapest = d.offers.find((o: any) => o.listing_id === d.cheapest_id);
  const live = d.offers.filter((o: any) => o.available && !o.anomaly);
  const spread = live.length > 1 ? Math.max(...live.map((o: any) => o.total)) - Math.min(...live.map((o: any) => o.total)) : 0;
  const avgR = d.offers.reduce((s: number, o: any) => s + o.seller_rating, 0) / d.offers.length;
  const views = [pkgSVG(p, 300), p.type === "litter" ? catArt({ color: "#9aa7ad", belly: "#dfe5e8" }) : bowlArt(), p.species === "dog" ? dogArt() : catArt()];
  const card = { ...p, available_count: live.length, offers_count: d.offers.length, best: best || null };
  const desc = `${TYPE[p.type] || "محصول"} ${SP[p.species]} از برند ${p.brand_fa}${d.attributes.length ? `، ${d.attributes.join("، ")}` : ""}، در بسته‌بندی ${p.qty_label}. قیمت این محصول در ${d.offers.length} فروشگاه بررسی و مقایسه شده است.`;

  const report = async (lid: string) => {
    try { await api("/api/v1/reports", { method: "POST", json: { listing_id: lid, reason: "wrong_price" } }); toast("ممنون! گزارش ثبت شد و قیمت دوباره بررسی می‌شود."); }
    catch { toast("ثبت گزارش ناموفق بود. دوباره تلاش کن."); }
  };

  return (
    <>
      <div className="crumbs">
        <Link href="/">پت‌مچ</Link> ‹ <Link href={q2h(SP[p.species])}>{SP[p.species]}</Link> ‹ <Link href={q2h(`${TYPE[p.type]} ${SP[p.species]}`)}>{TYPE[p.type]}</Link> ‹ <Link href={q2h(p.brand_fa)}>{p.brand_fa}</Link>
      </div>
      <section className="pp">
        <div className="gallery">
          <div className="thumbs" aria-label="تصاویر">
            {views.map((v, i) => <button key={i} className={i === view ? "on" : ""} onClick={() => setView(i)} aria-label={`تصویر ${fa(i + 1)}`}><Svg html={v} style={{ display: "grid", width: "100%", height: "100%" }} /></button>)}
          </div>
          <div className="stage"><Svg html={views[view]} style={{ width: "74%", display: "block" }} /><FavButton card={card} size={20} /></div>
        </div>
        <div className="pp-info">
          <Link className="brand-link" href={q2h(p.brand_fa)}>{p.brand_fa}</Link>
          <h1>{fd(p.name_fa)}</h1>
          <div className="en">{p.name_en} · {p.qty_label}</div>
          <div className="rating" style={{ marginTop: 8, fontSize: 13 }}><Stars r={avgR} /><span>{fa(+avgR.toFixed(1))} میانگین امتیاز فروشندگان</span><span>·</span><span>{fa(d.offers.length)} فروشگاه</span></div>
          <p className="desc">{fd(desc)}</p>
          <div className="tabs-line" role="tablist">
            <button role="tab" aria-selected={tab === "spec"} onClick={() => setTab("spec")}>مشخصات</button>
            <button role="tab" aria-selected={tab === "src"} onClick={() => setTab("src")}>منبع داده</button>
          </div>
          {tab === "spec" ? (
            <dl className="spec"><dt>حیوان</dt><dd>{SP[p.species]}</dd><dt>نوع</dt><dd>{TYPE[p.type] || "—"}</dd>
              <dt>وزن / حجم</dt><dd>{fd(p.qty_label)}</dd>
              {d.attributes.length > 0 && <><dt>ویژگی‌ها</dt><dd>{d.attributes.map(fd).join("، ")}</dd></>}</dl>
          ) : (
            <><p className="hint" style={{ margin: "4px 0" }}>{fa(d.offers.length)} آگهی با عنوان‌های متفاوت به‌عنوان یک محصول شناسایی شدند:</p>
              <ul className="prov">{d.offers.map((o: any) => (
                <li key={o.listing_id}><span><b>{o.seller}:</b> «{o.raw_title}»</span>
                  <span className="pill">{o.match.decision === "new" ? "مرجع" : o.match.decision === "approved" ? "تأیید انسانی" : `شباهت ${fa(Math.round(o.match.score * 100))}٪`}</span></li>
              ))}</ul></>
          )}
          <div className="buybox">
            {best ? (
              <>
                <div className="row"><div><div className="hint">بهترین پیشنهاد · {best.seller}</div><div className="big">{fa(best.total)} <small>تومان</small></div></div>
                  <a className="btn btn-primary" href={`/api/v1/go/${best.listing_id}`} target="_blank" rel="nofollow noopener">خرید از {best.seller} <Ui n="chevL" s={16} /></a></div>
                <div className="lines">
                  <div><Ui n="truck" s={18} /> {best.shipping ? `ارسال ${fa(best.shipping)} تومان (در قیمت لحاظ شده)` : "ارسال رایگان"}</div>
                  <div><Ui n="clock" s={18} /> آخرین بررسی قیمت: {ago(best.age_hours)}</div>
                  <div><Ui n="shield" s={18} /> {best.seller_verified ? "فروشگاه تأییدشده" : "فروشگاه تأییدنشده"} · امتیاز {fa(best.seller_rating)}</div>
                </div>
              </>
            ) : <div className="big" style={{ fontSize: 20 }}>فعلاً در هیچ فروشگاهی موجود نیست</div>}
            {d.caveat && <div className="notice">{d.caveat}</div>}
            {d.feeding ? <FeedBox f={d.feeding} petName={active?.name || "حیوانت"} />
              : d.pet_needs_weight ? <div className="notice info" style={{ marginTop: 12 }}>وزن {active?.name || "حیوانت"} را در <Link href="/pet">پروفایل</Link> وارد کن تا ببینی این بسته چند هفته کافی است و ماهی چقدر خرج دارد.</div> : null}
            <div className="statgrid">
              <div><small>اختلاف قیمت فروشگاه‌ها</small><b>{fa(spread)} <small>تومان</small></b></div>
              <div><small>قیمت هر {unitLabel(p.unit)}</small><b>{best ? fa(best.unit_price) : "—"} <small>تومان</small></b></div>
              <div><small>کمترین ۹۰ روز</small><b>{d.history_stats ? fa(d.history_stats.min) : "—"} <small>تومان</small></b></div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><div><h2>مقایسه <b>فروشگاه‌ها</b></h2><div className="sub">مرتب‌شده بر اساس قیمت نهایی (کالا + ارسال) · «خرید» صفحه نمایشی همان فروشگاه را باز می‌کند</div></div></div>
        <div className="offers">
          {d.offers.map((o: any) => {
            const isBest = o.listing_id === d.best_id;
            const monthly = d.feeding_for_offers?.[o.listing_id];
            return (
              <div key={o.listing_id} className={`offer ${isBest ? "best" : ""} ${o.anomaly ? "flagged" : ""} ${!o.available ? "dim" : ""}`}>
                <div><div className="seller">{o.seller} {o.seller_verified ? <span className="pill good"><Ui n="shield" s={12} /> تأییدشده</span> : <span className="pill">تأییدنشده</span>}{isBest && <span className="pill brand">پیشنهاد ما</span>}</div>
                  <div className="rating" style={{ marginTop: 4 }}><Stars r={o.seller_rating} /> <span>{fa(o.seller_rating)}</span> · <span className={o.stale ? "fit no" : ""}>بررسی {ago(o.age_hours)}</span></div></div>
                <div><span className="k">قیمت کالا</span><span className="v">{fa(o.price)}</span></div>
                <div><span className="k">ارسال</span><span className="v">{o.shipping ? fa(o.shipping) : "رایگان"}</span></div>
                <div><span className="k">قیمت نهایی</span><span className="total">{o.available ? fa(o.total) : <span className="muted">ناموجود</span>}</span>
                  <span className="k">هر {unitLabel(p.unit)}: {fa(o.unit_price)}{monthly ? ` · ماهانه ~${shortToman(monthly)}` : ""}</span></div>
                <div className="actions">
                  {o.available && <a className={`btn ${isBest ? "btn-primary" : "btn-ghost"} btn-sm`} href={`/api/v1/go/${o.listing_id}`} target="_blank" rel="nofollow noopener">خرید از فروشگاه</a>}
                  <button className="linkish" onClick={() => report(o.listing_id)}>گزارش قیمت اشتباه</button>
                </div>
                {o.anomaly && <div className="flag">⚠️ {fd(o.anomaly)} — در پیشنهادها لحاظ نشد.</div>}
              </div>
            );
          })}
        </div>
        {best && cheapest && best.listing_id !== cheapest.listing_id && (
          <p className="hint">چرا ارزان‌ترین را پیشنهاد اول نکردیم؟ {cheapest.seller} فقط {fa(best.total - cheapest.total)} تومان ارزان‌تر است، اما امتیاز فروشنده {fa(cheapest.seller_rating)} و دقت اطلاعات قیمتش {fa(Math.round(cheapest.seller_accuracy * 100))}٪ است.</p>
        )}
      </section>

      <section className="sec panel">
        <div className="sec-h"><div><h2>روند <b>کمترین قیمت</b></h2><div className="sub">۹۰ روز گذشته · قیمت‌های مشکوک حذف شده‌اند</div></div></div>
        {d.history.length ? <PriceChart hist={d.history} /> : <p className="muted">داده تاریخی کافی نداریم.</p>}
        {d.history_stats && <div className="legend"><span>کمترین: <b>{fa(d.history_stats.min)}</b></span><span>بیشترین: <b>{fa(d.history_stats.max)}</b></span><span>امروز: <b>{fa(d.history_stats.now)}</b></span></div>}
      </section>
    </>
  );
}

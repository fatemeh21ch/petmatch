import Link from "next/link";
import { Hero, Rails } from "@/components/Home";
import { Svg, Ui } from "@/components/ui";
import { serverApi } from "@/lib/api";
import { BRAND_COLORS, icon } from "@/lib/art";
import { fa, q2h } from "@/lib/format";
import { GUIDES } from "@/lib/guides";

// Rendered on the server: crawlers get real product names and prices (most comparison traffic comes from search engines).
export const dynamic = "force-dynamic";

const EXAMPLES = ["رويال كنين کیتن ۲ کیلو", "خاک گربه بدون عطر ارزون‌ترین", "غذای سگ توله زیر ۳ میلیون", "رویل کنن ایندور", "غذای گربه ماهی"];
const CATS: [string, string, string][] = [
  ["dry", "غذای خشک گربه", "غذای خشک گربه"], ["dry", "غذای خشک سگ", "غذای خشک سگ"], ["wet", "غذای تر", "غذای تر گربه"],
  ["treat", "تشویقی گربه", "تشویقی گربه"], ["treat", "تشویقی سگ", "تشویقی سگ"], ["litter", "خاک گربه", "خاک گربه"],
  ["cat", "بچه‌گربه", "غذای بچه گربه"], ["dog", "توله‌سگ", "غذای توله سگ"],
];

export default async function HomePage() {
  const d = await serverApi<any>("/api/v1/home");
  if (!d) return <div className="empty"><p>سرور پت‌مچ در دسترس نیست. بک‌اند را روی پورت ۸۰۰۰ اجرا کنید.</p></div>;
  return (
    <>
      <Hero maxSaving={d.max_saving} />
      <div className="smart"><span className="lbl"><Ui n="spark" s={20} /> جست‌وجوی هوشمند:</span>
        <div className="chips">{EXAMPLES.map((e) => <Link key={e} className="qchip" href={q2h(e)}>{e}</Link>)}</div></div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "18px 0 0", color: "var(--ink-2)", fontSize: 14, flexWrap: "wrap" }}>
        <span><b>{fa(d.stats.offers)}</b> پیشنهاد</span><span>←</span><span>از <b>{fa(d.stats.sellers)}</b> فروشگاه</span><span>←</span>
        <span><b>{fa(d.stats.products)}</b> محصول یکتا و قابل مقایسه</span>
      </div>
      <section className="sec">
        <div className="sec-h"><div><h2>دسته‌های <b>محبوب</b></h2><div className="sub">تمرکز نسخه اول: خریدهای تکرارشونده</div></div></div>
        <div className="cats">{CATS.map(([ic, l, q], i) => (
          <Link key={l} className="cat" href={q2h(q)}><Svg className="tile" style={{ background: `var(--t${i + 1})`, display: "grid" }} html={icon(ic, 54)} /><span className="nm">{l}</span></Link>
        ))}</div>
      </section>
      <Rails popular={d.popular} deals={d.deals} />
      <section className="sec"><div className="sec-h"><div><h2>برندهای <b>برتر</b></h2></div></div>
        <div className="brands">{d.brands.map((b: any) => (
          <Link key={b.key} className="brand" href={q2h(b.fa)}><span><b style={{ color: (BRAND_COLORS[b.key] || ["#13566c"])[0] }}>{b.en}</b><small>{b.fa} · {fa(b.count)} محصول</small></span></Link>
        ))}</div>
      </section>
      <section className="sec">
        <div className="sec-h"><div><h2>راهنمای <b>خرید</b></h2></div></div>
        <div className="articles">{Object.entries(GUIDES).map(([id, g]) => (
          <Link key={id} className="article" href={`/guide/${id}`}>
            <Svg className="cover" style={{ background: g.bg, display: "grid" }} html={g.art()} />
            <div className="body"><span className="kicker">{g.kicker}</span><h3>{g.title}</h3><p>{g.body[0].slice(0, 90)}…</p></div>
          </Link>
        ))}</div>
      </section>
      <section className="sec trust">
        <div><Ui n="truck" s={26} /><span><b>قیمت نهایی</b>با احتساب هزینه ارسال</span></div>
        <div><Ui n="clock" s={26} /><span><b>تازگی قیمت</b>زمان آخرین بررسی کنار هر قیمت</span></div>
        <div><Ui n="shield" s={26} /><span><b>قیمت مشکوک؟</b>پیشنهاد نمی‌شود</span></div>
        <div><Ui n="paw" s={26} /><span><b>متناسب با حیوانت</b>سن، جثه، حساسیت، هزینه ماهانه</span></div>
      </section>
    </>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { bowlArt, catArt, dogArt } from "@/lib/art";
import { fa, q2h } from "@/lib/format";
import { Rail, Svg, Ui } from "./ui";

export function Hero({ maxSaving }: { maxSaving: number }) {
  const [cur, setCur] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setCur((c) => (c + 1) % 3), 6000);
    return () => clearInterval(t);
  }, [auto]);
  const slides = [
    { pre: "تا", big: <>{fa(maxSaving)}<small>٪</small></>, sub: <>اختلاف قیمت برای یک محصول یکسان،<br />بین فروشگاه‌های مختلف</>, cta: "مقایسه کن", href: "/#deals", art: bowlArt() },
    { pre: "برای", big: "حیوان خودت", sub: <>سن، جثه و حساسیت غذایی‌اش را بگو؛<br />حتی هزینه ماهانه‌اش را حساب می‌کنیم</>, cta: "ساخت پروفایل", href: "/pet", art: catArt({ color: "#f5f5f5", belly: "#fff" }) },
    { pre: "هر طور راحتی", big: "بنویس", sub: <>«غذای توله زیر ۳ میلیون» یا حتی<br />«رویل کنن» با غلط تایپی</>, cta: "امتحان کن", href: q2h("غذای سگ توله زیر ۳ میلیون"), art: dogArt({ sweater: "#f4c430" }) },
  ];
  return (
    <section className="hero" aria-label="پیشنهادهای ویژه">
      <div className="hero-main">
        {slides.map((s, i) => (
          <div key={i} className={`slide ${i === cur ? "on" : ""}`} aria-hidden={i !== cur}>
            <div>
              <div className="pre">{s.pre}</div>
              <div className="big" style={i ? { fontSize: "clamp(34px,5vw,54px)" } : undefined}>{s.big}</div>
              <div className="uline" /><div className="sub">{s.sub}</div>
              <Link className="btn btn-dark cta" href={s.href} tabIndex={i === cur ? 0 : -1}>{s.cta} <Ui n="chevL" s={16} /></Link>
            </div>
            <Svg className="art" html={s.art} />
          </div>
        ))}
        <div className="dots">{slides.map((_, i) => <button key={i} className={i === cur ? "on" : ""} aria-label={`اسلاید ${fa(i + 1)}`} onClick={() => { setCur(i); setAuto(false); }} />)}</div>
      </div>
      <div className="hero-side">
        <Link className="promo teal" href={q2h("غذای خشک گربه")}><div><h3>دنبال وسایل<br />پیشی هستی؟</h3><span className="btn-outline-w">ببین <Ui n="chevL" s={14} /></span></div><Svg className="art" html={catArt({ glasses: true })} /></Link>
        <Link className="promo blue" href={q2h("غذای خشک سگ")}><div><h3>دنبال وسایل<br />هاپو هستی؟</h3><span className="btn-outline-w">ببین <Ui n="chevL" s={14} /></span></div><Svg className="art" html={dogArt()} /></Link>
      </div>
    </section>
  );
}

export function Rails({ popular, deals }: { popular: any[]; deals: any[] }) {
  useEffect(() => { if (location.hash === "#deals") document.getElementById("deals")?.scrollIntoView(); }, []);
  return (
    <>
      <Rail id="popular" title={<>محصولات <b>پرطرفدار</b></>} sub="موجود در بیشترین فروشگاه‌ها" items={popular}
        tagFn={(r) => (r.trend < -1 ? ["ارزان‌تر شد", "sun"] : [])} />
      <section className="sec banners">
        <Link className="banner yellow" href="/pet"><div><h3>غذای مناسبِ خودِ حیوانت</h3><p>پروفایل بساز تا رده سنی، حساسیت‌ها و هزینه ماهانه لحاظ شوند</p><span className="btn btn-dark btn-sm">ساخت پروفایل</span></div><Svg className="art" html={catArt({ color: "#3b3b3b", belly: "#6b6b6b" })} /></Link>
        <Link className="banner light" href="/signup?role=seller"><div><h3>فروشگاه داری؟</h3><p>محصولاتت را در پت‌مچ نمایش بده و کلیک‌ها و رقبایت را ببین</p><span className="btn btn-dark btn-sm">ثبت‌نام فروشنده</span></div><Svg className="art" html={dogArt({ sweater: "#13566c", color: "#e2b57f" })} /></Link>
      </section>
      <Rail id="deals" title={<>بیشترین <b>اختلاف قیمت</b> امروز</>} sub="جایی که مقایسه بیشترین صرفه‌جویی را دارد" items={deals}
        tagFn={(r) => (r.saving_pct > 0 ? [`${fa(r.saving_pct)}٪ اختلاف`] : [])} />
    </>
  );
}

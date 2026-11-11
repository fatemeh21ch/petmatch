"use client";
import Link from "next/link";
import { useRef } from "react";
import { pkgSVG, ui } from "@/lib/art";
import { toast, useFavs } from "@/lib/client";
import { fa, fd, shortToman, weeksText } from "@/lib/format";

/** Render one of our own generated SVG strings (all data inside is escaped in lib/art.ts). */
export function Svg({ html, className, style }: { html: string; className?: string; style?: React.CSSProperties }) {
  return <span className={className} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}
export const Ui = ({ n, s = 22 }: { n: string; s?: number }) => <Svg html={ui(n, s)} style={{ display: "inline-flex" }} />;

export function Stars({ r }: { r: number }) {
  const full = Math.round(r);
  return (
    <span className="stars">
      {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ opacity: i < full ? 1 : 0.25 }}><Ui n="star" s={13} /></span>)}
    </span>
  );
}

export function FeedLine({ f }: { f: any }) {
  if (!f) return null;
  return (
    <div className="feed" title="تخمینی، بر اساس وزن و سن حیوان و میانگین انرژی غذای خشک/تر">
      <Ui n="paw" s={14} />
      <span>~{shortToman(f.monthly_cost)} <small>در ماه</small></span><span className="sep">·</span>
      <span>هر بسته ~{weeksText(f.weeks_per_pack)}</span>
      {f.freshness_warning && <span className="fresh" title="بسته بزرگ است؛ غذای خشک بعد از باز شدن معمولاً ۶ تا ۸ هفته بهترین کیفیت را دارد">!</span>}
    </div>
  );
}

export function FavButton({ card, size = 18 }: { card: any; size?: number }) {
  const { favs, toggle } = useFavs();
  const on = !!favs[card.id];
  return (
    <button className={`fav ${on ? "on" : ""}`} aria-pressed={on} aria-label={on ? "حذف از علاقه‌مندی" : "افزودن به علاقه‌مندی"}
      onClick={(e) => { e.preventDefault(); toast(toggle(card) ? "به علاقه‌مندی‌ها اضافه شد" : "از علاقه‌مندی‌ها حذف شد"); }}>
      <Ui n={on ? "heartFill" : "heart"} s={size} />
    </button>
  );
}

export function ProductCard({ r, tag, tagCls = "" }: { r: any; tag?: string; tagCls?: string }) {
  const b = r.best;
  const fit = (r.fit_notes || []).slice(0, 1);
  return (
    <article className={`pcard ${b ? "" : "out"}`}>
      {tag && <span className={`tag ${tagCls}`}>{tag}</span>}
      <FavButton card={r} />
      <Link href={`/p/${r.id}`} className="img" tabIndex={-1} aria-hidden="true"><Svg html={pkgSVG(r)} /></Link>
      <div className="rating">
        {b && <><Stars r={b.seller_rating} /><span>{fa(b.seller_rating)}</span></>}
        {r.value ? <span className="value-pill" title="امتیاز ارزش خرید">ارزش {fa(r.value)}</span> : null}
      </div>
      <h3><Link href={`/p/${r.id}`}>{fd(r.name_fa)}</Link></h3>
      <div className="en">{r.name_en}</div>
      {fit.map(([t, ok]: [string, boolean], i: number) => <div key={i} className={`fit ${ok ? "ok" : "no"}`}>{ok ? "✓" : "!"} {fd(t)}</div>)}
      <FeedLine f={r.feeding} />
      <div className="foot">
        <div className="price">
          {b ? <><span className="from">بهترین قیمت با ارسال</span>{fa(b.total)} <small>تومان</small></>
            : <span className="muted" style={{ fontSize: 13 }}>فعلاً ناموجود</span>}
        </div>
        <span className="stores">{fa(r.available_count)} فروشگاه</span>
      </div>
    </article>
  );
}

export function Rail({ id, title, sub, items, tagFn }: { id: string; title: React.ReactNode; sub?: string; items: any[]; tagFn?: (r: any) => [string?, string?] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="sec" id={id}>
      <div className="sec-h">
        <div><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}</div>
        <div className="arrows">
          <button onClick={() => scroll(1)} aria-label="بعدی"><Ui n="chevR" s={18} /></button>
          <button onClick={() => scroll(-1)} aria-label="قبلی"><Ui n="chevL" s={18} /></button>
        </div>
      </div>
      <div className="rail" ref={ref}>
        {items.map((r) => { const [t, c] = tagFn ? tagFn(r) : []; return <ProductCard key={r.id} r={r} tag={t} tagCls={c} />; })}
      </div>
    </section>
  );
}

export function Empty({ art, children }: { art: string; children: React.ReactNode }) {
  return <div className="empty"><Svg className="ill" html={art} style={{ display: "block" }} />{children}</div>;
}

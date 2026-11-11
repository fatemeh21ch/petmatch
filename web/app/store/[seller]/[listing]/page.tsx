import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stars, Svg, Ui } from "@/components/ui";
import { serverApi } from "@/lib/api";
import { pkgSVG } from "@/lib/art";
import { fa, fd } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ seller: string; listing: string }> }): Promise<Metadata> {
  const { seller, listing } = await params;
  const d = await serverApi<any>(`/api/v1/store/${seller}/${listing}`);
  return { title: d ? `${d.listing.title} — ${d.seller.name} (نمایشی)` : "فروشگاه", robots: { index: false } };
}

/** What the user lands on after "buy": a stand-in for the shop's own product page (the shops are fictional).
 *  Styled as the shop, not as PetMatch, and clearly labelled as a demo. */
export default async function StorePage({ params }: { params: Promise<{ seller: string; listing: string }> }) {
  const { seller, listing } = await params;
  const d = await serverApi<any>(`/api/v1/store/${seller}/${listing}`);
  if (!d) notFound();
  const s = d.seller, L = d.listing, p = d.product, o = d.offer;
  return (
    <>
      <div className="store-demo-bar">
        این صفحه نمایشی است: «{s.name}» یک فروشگاه ساختگی است و در نسخه واقعی، این کلیک کاربر را به سایت خود فروشگاه می‌برد.
        {p && <Link href={`/p/${p.id}`}>بازگشت به مقایسه قیمت در پت‌مچ ←</Link>}
      </div>
      <header className="store-hdr" style={{ background: s.color }}>
        <div className="wrap in">
          <span className="lg">{s.name.slice(0, 1)}</span>
          <div><b>{s.name}</b><small className="ltr" style={{ direction: "ltr" }}>{s.website.replace("https://", "")}</small></div>
          <span className="cart">🛒 سبد خرید (۰)</span>
        </div>
      </header>
      <main className="wrap">
        <div className="store-body">
          <div className="store-img">{p ? <Svg html={pkgSVG(p, 320)} style={{ display: "grid", width: "70%" }} /> : null}</div>
          <div className="store-info">
            <div className="crumbs">{s.name} ‹ {p ? (p.species === "cat" ? "گربه" : "سگ") : "محصولات"}</div>
            <h1>{L.title}</h1>
            <div className="rating" style={{ marginTop: 6 }}><Stars r={s.rating} /> <span>{fa(s.rating)} امتیاز فروشگاه</span></div>
            <div className="store-price" style={{ color: s.color }}>{fa(L.price)} <small style={{ fontSize: 15 }}>تومان</small></div>
            {o && <div className="hint">ارسال: {o.shipping ? `${fa(o.shipping)} تومان` : "رایگان"} · جمع با ارسال: {fa(o.total)} تومان</div>}
            <div style={{ marginTop: 10 }}>{L.available ? <span className="pill good">موجود در انبار</span> : <span className="pill">ناموجود</span>}</div>
            <div className="store-cta">
              <button className="btn btn-primary" style={{ background: s.color }} disabled title="فروشگاه نمایشی است">افزودن به سبد خرید</button>
              {p && <Link className="btn btn-ghost" href={`/p/${p.id}`}><Ui n="chevR" s={16} /> مقایسه در پت‌مچ</Link>}
            </div>
            <div className="store-note">
              <b>چرا این صفحه؟</b> هر کلیک روی «خرید از فروشگاه» در پت‌مچ اول از <code>/api/v1/go/{L.id}</code> رد می‌شود تا ثبت شود
              (همان «کلیک روزانه» در پنل فروشنده) و بعد کاربر به صفحه محصول در سایت فروشگاه هدایت می‌شود. پت‌مچ خودش چیزی نمی‌فروشد و پرداختی انجام نمی‌دهد.
            </div>
          </div>
        </div>
        {d.others.length > 0 && (
          <section className="sec">
            <div className="sec-h"><div><h2>محصولات دیگر <b>{s.name}</b></h2></div></div>
            <div className="store-more">{d.others.map((x: any) => (
              <Link key={x.listing_id} className="it" href={`/store/${s.id}/${x.listing_id}`}>
                <Svg className="im" html={pkgSVG(x, 160)} style={{ display: "grid" }} />
                <div style={{ marginTop: 6 }}>{x.title}</div><b style={{ color: s.color }}>{fa(x.price)} تومان</b>
              </Link>
            ))}</div>
          </section>
        )}
      </main>
      <footer style={{ background: "#f4f6f7", padding: "18px 0", marginTop: 30, fontSize: 13, color: "#677" }}>
        <div className="wrap">{s.name} · فروشگاه نمایشی برای دموی پت‌مچ · <Link href="/">بازگشت به پت‌مچ</Link></div>
      </footer>
    </>
  );
}

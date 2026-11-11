"use client";
import Link from "next/link";
import { Empty, ProductCard } from "@/components/ui";
import { catArt } from "@/lib/art";
import { useFavs } from "@/lib/client";

export default function FavoritesPage() {
  const { favs } = useFavs();
  const list = Object.values(favs);
  return (
    <div className="sec">
      <div className="sec-h"><div><h2>علاقه‌<b>مندی‌ها</b></h2><div className="sub">روی همین دستگاه ذخیره شده‌اند</div></div></div>
      {list.length ? <div className="grid">{list.map((r: any) => <ProductCard key={r.id} r={r} />)}</div> : (
        <Empty art={catArt({ color: "#f5f5f5", belly: "#fff" })}>
          <p>هنوز چیزی ذخیره نکرده‌ای. روی ♡ هر محصول بزن تا اینجا بیاید.</p>
          <Link className="btn btn-primary" href="/">گشتن در محصولات</Link>
        </Empty>
      )}
    </div>
  );
}

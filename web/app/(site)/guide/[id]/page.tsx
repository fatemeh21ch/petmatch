import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Svg, Ui } from "@/components/ui";
import { q2h } from "@/lib/format";
import { GUIDES } from "@/lib/guides";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const g = GUIDES[(await params).id];
  return { title: g ? g.title : "راهنما", description: g?.body[0] };
}

export function generateStaticParams() {
  return Object.keys(GUIDES).map((id) => ({ id }));
}

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const g = GUIDES[(await params).id];
  if (!g) notFound();
  return (
    <article className="art-page">
      <div className="crumbs"><Link href="/">پت‌مچ</Link> ‹ <span>راهنمای خرید</span></div>
      <Svg className="cover" style={{ background: g.bg, display: "grid" }} html={g.art()} />
      <span className="kicker pill" style={{ marginTop: 16 }}>{g.kicker}</span>
      <h1>{g.title}</h1>
      {g.body.map((t) => <p key={t}>{t}</p>)}
      <Link className="btn btn-primary" href={q2h(g.q)}>دیدن محصولات مرتبط <Ui n="chevL" s={16} /></Link>
    </article>
  );
}

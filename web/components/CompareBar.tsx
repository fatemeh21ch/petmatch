"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAX_COMPARE, useCompare } from "@/lib/client";
import { fa } from "@/lib/format";
import { Ui } from "./ui";

/** Floating bar on shop pages while the compare list has products. */
export default function CompareBar() {
  const { ids, clear } = useCompare();
  const path = usePathname();
  if (!ids.length || path === "/compare") return null;
  return (
    <div className="cmp-bar" role="region" aria-label="مقایسه محصولات">
      <span><Ui n="compare" s={18} /> {fa(ids.length)} از {fa(MAX_COMPARE)} محصول برای مقایسه</span>
      {ids.length < 2 && <small>یک محصول دیگر هم انتخاب کن</small>}
      <Link className={`btn btn-sun btn-sm ${ids.length < 2 ? "is-off" : ""}`} href="/compare" aria-disabled={ids.length < 2}>مقایسه کن</Link>
      <button className="linkish" onClick={clear}>پاک کردن</button>
    </div>
  );
}

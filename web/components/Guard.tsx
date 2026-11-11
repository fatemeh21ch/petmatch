"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/client";
import { catArt } from "@/lib/art";
import { Empty } from "./ui";

/** UI convenience only: the API checks the role on every request anyway (hiding a page is not security). */
export default function Guard({ role, children }: { role: "seller" | "admin"; children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const path = usePathname();
  if (!ready) return <div className="skeleton" style={{ height: 300, marginTop: 24 }} />;
  if (!user) return (
    <Empty art={catArt({ glasses: true })}>
      <p>برای دیدن این صفحه وارد شو.</p>
      <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(path)}`}>ورود با کد یک‌بارمصرف</Link>
    </Empty>
  );
  if (user.role !== role) return (
    <Empty art={catArt()}>
      <p>این بخش مخصوص {role === "admin" ? "مدیر سامانه" : "فروشندگان"} است و حساب شما ({user.role_fa}) به آن دسترسی ندارد.</p>
      <Link className="btn btn-ghost" href="/login">ورود با حساب دیگر</Link>
    </Empty>
  );
  return <>{children}</>;
}

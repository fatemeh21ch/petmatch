"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast, useAuth } from "@/lib/client";
import { Ui } from "./ui";

const NAV: Record<string, [string, string, string][]> = {
  seller: [["/seller", "chart", "داشبورد"], ["/seller/products", "box", "محصولات و افزودن محصول"]],
  admin: [["/admin", "shield", "داشبورد و تطبیق محصول"]],
};

/** In demo mode, lets the viewer jump between the demo stores (or seller ↔ admin) without an OTP. */
function DemoSwitch() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  useEffect(() => { api("/api/v1/auth/demo-accounts").then(setAccounts).catch(() => {}); }, []);
  const panel = accounts.filter((a) => a.role !== "buyer");
  if (panel.length < 2 || !user) return null;
  return (
    <label className="demo-switch" title="حساب نمایشی؛ بدون کد یک‌بارمصرف">
      <span>نمایش با حساب</span>
      <select value={user.phone} onChange={async (e) => {
        const a = panel.find((x) => x.phone === e.target.value);
        if (!a) return;
        await api("/api/v1/auth/demo-login", { method: "POST", json: { phone: a.phone } });
        await refresh();
        toast(`اکنون: ${a.name}`);
        router.push(a.role === "admin" ? "/admin" : "/seller");
      }}>
        {!panel.some((a) => a.phone === user.phone) && <option value={user.phone}>{user.name}</option>}
        {panel.map((a) => <option key={a.phone} value={a.phone}>{a.name}</option>)}
      </select>
    </label>
  );
}

export default function PanelHeader() {
  const { user, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const role = path.startsWith("/admin") ? "admin" : "seller";
  return (
    <header className="phdr">
      <div className="wrap phdr-row">
        <Link href={role === "admin" ? "/admin" : "/seller"} className="logo" aria-label="خانه پنل">
          <span className="logo-paw"><Ui n="paw" s={22} /></span>
          <span><span className="logo-word">پت<span>‌مچ</span></span>
            <span className="logo-sub">{role === "admin" ? "پنل مدیریت" : "پنل فروشندگان"}</span></span>
        </Link>
        <nav className="phdr-nav" aria-label="منوی پنل">
          {NAV[role].map(([href, ic, label]) => (
            <Link key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined}>
              <Ui n={ic} s={18} /> {label}
            </Link>
          ))}
        </nav>
        <div className="phdr-end">
          <DemoSwitch />
          <Link href="/" className="btn btn-ghost btn-sm">مشاهده سایت</Link>
          {user && (
            <button className="btn btn-ghost btn-sm" onClick={async () => { await logout(); toast("از حساب خارج شدید"); router.push("/"); }}>
              خروج
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

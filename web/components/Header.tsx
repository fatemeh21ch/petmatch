"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { icon } from "@/lib/art";
import { api } from "@/lib/api";
import { homeFor, toast, useAuth, useFavs, usePets } from "@/lib/client";
import { fa, q2h } from "@/lib/format";
import { Svg, Ui } from "./ui";

const NAV: { label: string; menuKey?: string; href?: string; hot?: boolean }[] = [
  { label: "گربه", menuKey: "cat" }, { label: "سگ", menuKey: "dog" }, { label: "برندها", menuKey: "brands" },
  { label: "بیشترین اختلاف قیمت", href: "/#deals", hot: true },
  { label: "راهنمای خرید", href: "/guide/unit-price" },
];

function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  useEffect(() => { setQ(pathname === "/search" ? params.get("q") || "" : ""); }, [pathname, params]);
  return (
    <form className="searchbar" role="search" onSubmit={(e) => {
      e.preventDefault();
      const full = [q.trim(), cat].filter(Boolean).join(" ");
      if (full) router.push(q2h(full));
    }}>
      <select aria-label="دسته" value={cat} onChange={(e) => setCat(e.target.value)}>
        <option value="">همه دسته‌ها</option>
        <option value="غذای خشک گربه">غذای گربه</option>
        <option value="غذای خشک سگ">غذای سگ</option>
        <option value="خاک گربه">خاک گربه</option>
        <option value="تشویقی">تشویقی</option>
      </select>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="هر طور راحتی بنویس: غذای گربه عقیم زیر ۴ میلیون" aria-label="جست‌وجو" autoComplete="off" />
      <button className="go" type="submit" aria-label="جست‌وجو"><Ui n="search" s={20} /></button>
    </form>
  );
}

function NavRow() {
  const [menus, setMenus] = useState<Record<string, any[]> | null>(null);
  const [open, setOpen] = useState<{ key: string; top: number; right: number } | null>(null);
  const pathname = usePathname();
  const hover = typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
  useEffect(() => { api("/api/v1/nav").then(setMenus).catch(() => {}); }, []);
  useEffect(() => setOpen(null), [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".navitem")) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);
  const openAt = (key: string, el: HTMLElement) => {
    // the menu is position:fixed so the horizontally scrollable nav row can't clip it
    const r = el.getBoundingClientRect();
    setOpen({ key, top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };
  let n = 0;
  return (
    <nav className="navrow" aria-label="منوی اصلی" onMouseLeave={() => hover && setOpen(null)} onScroll={() => setOpen(null)}>
      {NAV.map((item) => item.menuKey ? (
        <div key={item.label} className={`navitem ${open?.key === item.menuKey ? "open" : ""}`}
          onMouseEnter={(e) => hover && openAt(item.menuKey!, e.currentTarget.firstElementChild as HTMLElement)}>
          <button className="navlink" aria-haspopup="true" aria-expanded={open?.key === item.menuKey}
            onClick={(e) => (open?.key === item.menuKey && !hover ? setOpen(null) : openAt(item.menuKey!, e.currentTarget))}>
            {item.label} <Ui n="chevD" s={16} />
          </button>
          <div className="menu" style={open?.key === item.menuKey ? { top: open.top, right: open.right } : undefined}>
            {!menus ? <div className="hint" style={{ padding: "8px 12px" }}>در حال بارگذاری…</div>
              : (menus[item.menuKey] || []).map((g: any) => (
                <div key={g.title} style={{ display: "contents" }}>
                  <div className="menu-group">{g.title}</div>
                  {g.items.map((it: any) => (
                    <Link key={it.q} href={q2h(it.q)} onClick={() => setOpen(null)}>
                      <span className="mi" style={{ background: `var(--t${(n++ % 8) + 1})` }}><Svg html={icon(it.icon, 22)} /></span>
                      {it.label}<small>{fa(it.count)}</small>
                    </Link>
                  ))}
                </div>
              ))}
          </div>
        </div>
      ) : (
        <Link key={item.label} className={`navlink ${item.hot ? "hot" : ""}`} href={item.href!}>{item.label}</Link>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  if (!ready) return <span className="hdr-act" style={{ width: 90 }} />;
  if (!user) return <Link href="/login" className="hdr-act"><Ui n="user" s={20} /><span className="lbl">ورود | ثبت‌نام</span></Link>;
  return (
    <div className={`usermenu ${open ? "open" : ""}`} ref={ref}>
      <button className="hdr-act user" onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open}>
        <Ui n="user" s={20} /><span className="lbl">{user.name.split(" ")[0]}</span>
        <span className={`role-badge ${user.role}`}>{user.role_fa}</span>
      </button>
      <div className="menu">
        <div className="who"><b>{user.name}</b><span className="ltr" style={{ direction: "ltr" }}>{user.phone}</span></div>
        {user.role === "seller" && <Link href="/seller" onClick={() => setOpen(false)}><Ui n="chart" s={18} /> پنل فروشنده</Link>}
        {user.role === "admin" && <Link href="/admin" onClick={() => setOpen(false)}><Ui n="shield" s={18} /> پنل مدیریت</Link>}
        <Link href="/pet" onClick={() => setOpen(false)}><Ui n="paw" s={18} /> حیوان‌های من</Link>
        <Link href="/favorites" onClick={() => setOpen(false)}><Ui n="heart" s={18} /> علاقه‌مندی‌ها</Link>
        <button onClick={async () => { await logout(); setOpen(false); toast("از حساب خارج شدید"); router.push("/"); }}>
          <Ui n="chevR" s={18} /> خروج
        </button>
      </div>
    </div>
  );
}

export default function Header() {
  const { active } = usePets();
  const { favs } = useFavs();
  const n = Object.keys(favs).length;
  return (
    <header className="hdr">
      <div className="wrap">
        <div className="hdr-top">
          <Link href="/" className="logo" aria-label="پت‌مچ، صفحه اصلی">
            <span className="logo-paw"><Ui n="paw" s={24} /></span>
            <span><span className="logo-word">پت<span>‌مچ</span></span><span className="logo-sub">مقایسه هوشمند قیمت</span></span>
          </Link>
          <Suspense fallback={<div className="searchbar" />}><SearchBar /></Suspense>
          <div className="hdr-actions">
            <Link href="/pet" className={`hdr-act ${active ? "pet-on" : ""}`}>
              <Ui n="paw" s={20} /><span className="lbl">{active ? active.name || "حیوان من" : "حیوان من"}</span>
            </Link>
            <Link href="/favorites" className="hdr-act" aria-label="علاقه‌مندی‌ها">
              <Ui n="heart" s={22} />{n ? <span className="count">{fa(n)}</span> : null}
            </Link>
            <UserMenu />
          </div>
        </div>
        <NavRow />
      </div>
    </header>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const tabs: [string, string, string, boolean?][] = [
    ["/", "home", "خانه"], ["/favorites", "heart", "علاقه‌مندی"], ["/search", "search", "جست‌وجو", true],
    ["/pet", "paw", "حیوان من"], [user ? homeFor(user.role) === "/" ? "/login" : homeFor(user.role) : "/login", "user", "حساب"],
  ];
  return (
    <nav className="tabbar" aria-label="ناوبری موبایل">
      {tabs.map(([href, ic, l, c]) => (
        <Link key={l} href={href} aria-label={l} className={`${c ? "center" : ""} ${pathname === href ? "on" : ""}`}><Ui n={ic} s={22} /></Link>
      ))}
    </nav>
  );
}

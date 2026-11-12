"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { catArt } from "@/lib/art";
import { loggedOut, useAuth } from "@/lib/client";
import { Empty } from "./ui";

/** UI convenience only: the API checks the role on every request anyway (hiding a page is not security).
 *
 * Demo mode: nobody has to log in to look around. Opening /seller or /admin without a session
 * signs in as the matching demo account (no OTP); a wrong-role session gets a one-click switch.
 * With PETMATCH_DEMO_OTP=0 the server exposes no demo accounts and the normal login is required. */
export default function Guard({ role, children }: { role: "seller" | "admin"; children: React.ReactNode }) {
  const { user, ready, refresh } = useAuth();
  const path = usePathname();
  const [demo, setDemo] = useState<any[] | null>(null);
  const tried = useRef(false);
  const [failed, setFailed] = useState(false);
  const candidates = (demo || []).filter((a) => a.role === role);

  // While the backend (re)starts it is busy building the catalog and the proxy answers 500: keep retrying ~10s.
  const retry = async <T,>(fn: () => Promise<T>, tries = 8): Promise<T> => {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) { if (i >= tries) throw e; await new Promise((r) => setTimeout(r, 1200)); }
    }
  };
  const loadDemo = useCallback(() => {
    setDemo(null); setFailed(false); tried.current = false;
    retry(() => api<any[]>("/api/v1/auth/demo-accounts")).then(setDemo).catch(() => setDemo([]));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadDemo(); }, [loadDemo]);
  const enter = async (phone: string) => {
    await retry(() => api("/api/v1/auth/demo-login", { method: "POST", json: { phone } }), 4);
    await refresh();
  };
  useEffect(() => {
    if (!ready || user || !demo || tried.current || !candidates.length || loggedOut()) return;
    tried.current = true;
    enter(candidates[0].phone).catch(() => setFailed(true));
  }, [ready, user, demo]);   // eslint-disable-line react-hooks/exhaustive-deps

  const autoEntering = !user && !loggedOut() && (demo === null || (candidates.length > 0 && !failed));
  if (!ready || autoEntering) return <div className="skeleton" style={{ height: 300, marginTop: 24 }} />;
  if (!user) return (
    <Empty art={catArt({ glasses: true })}>
      <p>برای دیدن این صفحه وارد شو.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(path)}`}>ورود با کد یک‌بارمصرف</Link>
        {candidates.map((a) => (
          <button key={a.phone} className="btn btn-ghost" onClick={() => enter(a.phone).catch(() => setFailed(true))}>ورود نمایشی: {a.name}</button>
        ))}
        {!candidates.length && <button className="btn btn-ghost" onClick={() => { refresh(); loadDemo(); }}>تلاش دوباره</button>}
      </div>
    </Empty>
  );
  if (user.role !== role) return (
    <Empty art={catArt()}>
      <p>این بخش مخصوص {role === "admin" ? "مدیر سامانه" : "فروشندگان"} است و حساب شما ({user.role_fa}) به آن دسترسی ندارد.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {candidates.map((a) => (
          <button key={a.phone} className="btn btn-primary" onClick={() => enter(a.phone)}>ادامه با حساب نمایشی {a.name}</button>
        ))}
        <Link className="btn btn-ghost" href={`/login?next=${encodeURIComponent(path)}`}>ورود با حساب دیگر</Link>
      </div>
    </Empty>
  );
  return <>{children}</>;
}

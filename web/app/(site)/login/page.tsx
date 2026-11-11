"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import OtpStep from "@/components/Otp";
import { Svg, Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { catArt } from "@/lib/art";
import { homeFor, toast, useAuth } from "@/lib/client";

const ROLE_STYLE: Record<string, [string, string, string]> = {
  buyer: ["var(--t2)", "user", "خرید و مقایسه قیمت"],
  seller: ["#e3dcfb", "chart", "پنل فروشنده و آمار کلیک"],
  admin: ["var(--t4)", "shield", "پنل مدیریت و نمودارها"],
};

function LoginView() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  useEffect(() => { api("/api/v1/auth/demo-accounts").then(setAccounts).catch(() => {}); }, []);

  async function request(p = phone) {
    setBusy(true); setErr("");
    try { setPhone(p); setSent(await api("/api/v1/auth/otp/request", { method: "POST", json: { phone: p } })); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <div>
          <h2>ورود به پت‌مچ</h2>
          <p>با شماره موبایل و کد یک‌بارمصرف؛ بدون رمز عبور.</p>
          <ul><li>خریدار: پروفایل حیوان‌ها و علاقه‌مندی‌ها</li><li>فروشنده: کلیک روزانه، رتبه قیمت در برابر رقبا</li><li>مدیر: نمودارها، صف تطبیق محصول</li></ul>
        </div>
        <Svg className="art" html={catArt({ glasses: true })} />
      </div>
      <div className="auth-main">
        {!sent ? (
          <>
            <div className="steps"><span className="on" /><span /></div>
            <h1>شماره موبایلت را وارد کن</h1>
            <p className="sub">کد تأیید برایت پیامک می‌شود.</p>
            <form onSubmit={(e) => { e.preventDefault(); request(); }}>
              <div className="phone-input"><span>+98</span>
                <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="0912 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="شماره موبایل" autoFocus /></div>
              {err && <div className="err-msg">{err} {err.includes("ثبت‌نام") && <Link href={`/signup?phone=${encodeURIComponent(phone)}`}>ثبت‌نام کن</Link>}</div>}
              <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || phone.length < 10}>{busy ? "در حال ارسال…" : "دریافت کد تأیید"}</button>
            </form>
            <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>حساب نداری؟ <Link href="/signup">ثبت‌نام کن</Link></p>
            {accounts.length > 0 && (
              <div className="demo-accts">
                <div className="t">حساب‌های نمایشی؛ با یک کلیک وارد شو</div>
                {accounts.map((a) => {
                  const [bg, ic, desc] = ROLE_STYLE[a.role];
                  return (
                    <button key={a.phone} className="acct" disabled={busy} onClick={() => request(a.phone)}>
                      <span className="av" style={{ background: bg }}><Ui n={ic} s={20} /></span>
                      <span><b>{a.name} <span className={`role-badge ${a.role}`}>{a.role_fa}</span></b><small>{a.phone}</small> <span className="muted" style={{ fontSize: 12 }}>· {desc}</span></span>
                      <span className="go">ورود ←</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <OtpStep phone={phone} sent={sent} onBack={() => setSent(null)}
            onResend={() => api("/api/v1/auth/otp/request", { method: "POST", json: { phone } })}
            onVerified={async (u) => { await refresh(); toast(`خوش آمدی ${u.name}`); router.push(next || homeFor(u.role)); }} />
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginView /></Suspense>;
}

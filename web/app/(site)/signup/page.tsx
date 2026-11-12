"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import OtpStep from "@/components/Otp";
import { Svg, Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { dogArt } from "@/lib/art";
import { toast, useAuth } from "@/lib/client";
import { fa } from "@/lib/format";

const num = (s: string) => +s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");

function SignupView() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const [role, setRole] = useState<"buyer" | "seller">(params.get("role") === "seller" ? "seller" : "buyer");
  const [form, setForm] = useState({ name: "", phone: params.get("phone") || "", store_name: "", website: "", shipping_flat: "", free_over: "", terms: false });
  const [sent, setSent] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const body = () => ({ phone: form.phone, name: form.name, role, ...(role === "seller" ? { store_name: form.store_name, website: form.website || null,
    shipping_flat: form.shipping_flat.trim() === "" ? null : num(form.shipping_flat), free_over: num(form.free_over) || 0 } : {}) });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.terms) { setErr("پذیرفتن قوانین لازم است"); return; }
    if (role === "seller" && !form.website.trim()) { setErr("لینک فروشگاه را وارد کنید (مثلاً petshop.ir)"); return; }
    if (role === "seller" && (form.shipping_flat.trim() === "" || Number.isNaN(num(form.shipping_flat)))) { setErr("هزینه ارسال فروشگاه را وارد کنید (اگر رایگان است ۰ بنویسید)"); return; }
    setBusy(true); setErr("");
    try { setSent(await api("/api/v1/auth/signup", { method: "POST", json: body() })); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-side" style={{ background: role === "seller" ? "#e3dcfb" : "var(--sky)" }}>
        <div>
          <h2>{role === "seller" ? "فروشگاهت را به پت‌مچ وصل کن" : "به پت‌مچ خوش آمدی"}</h2>
          {role === "seller" ? (
            <ul><li>نمایش محصولات کنار رقبا، بدون هزینه ثبت‌نام</li><li>کلیک روزانه، نرخ کلیک و جایگاه قیمت هر محصول</li><li>هشدار وقتی قیمتت از بازار عقب افتاده یا به‌روز نشده</li></ul>
          ) : (
            <ul><li>پروفایل تا ۶ حیوان، با پیشنهاد مناسب سن و حساسیت</li><li>هزینه ماهانه تغذیه هر غذا</li><li>علاقه‌مندی‌ها و بهترین قیمت با ارسال</li></ul>
          )}
        </div>
        <Svg className="art" html={dogArt({ sweater: role === "seller" ? "#6b5bd1" : "#f4c430" })} />
      </div>
      <div className="auth-main">
        {!sent ? (
          <>
            <div className="steps"><span className="on" /><span /></div>
            <h1>ثبت‌نام</h1>
            {params.get("from") === "login" && <div className="notice info">شماره {form.phone} هنوز در پت‌مچ حساب ندارد. با چند قدم کوتاه ثبت‌نام کن؛ شماره را خودمان پر کردیم.</div>}
            <p className="sub">چند ثانیه طول می‌کشد؛ بعد کد تأیید پیامک می‌شود.</p>
            <form className="form" onSubmit={submit}>
              <div className="role-pick" role="radiogroup" aria-label="نوع حساب">
                <label><input type="radio" checked={role === "buyer"} onChange={() => setRole("buyer")} /><Ui n="user" s={24} /><span><b>خریدار</b><small>صاحب گربه یا سگ</small></span></label>
                <label><input type="radio" checked={role === "seller"} onChange={() => setRole("seller")} /><Ui n="chart" s={24} /><span><b>فروشنده</b><small>صاحب پت‌شاپ آنلاین</small></span></label>
              </div>
              <div className="field"><label htmlFor="nm">نام و نام خانوادگی</label><input id="nm" type="text" required minLength={2} maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label htmlFor="ph">شماره موبایل</label>
                <div className="phone-input"><span>+98</span><input id="ph" type="tel" inputMode="numeric" autoComplete="tel" required placeholder="0912 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div></div>
              {role === "seller" && (
                <div className="row2">
                  <div className="field"><label htmlFor="st">نام فروشگاه</label><input id="st" type="text" required maxLength={40} value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} /></div>
                  <div className="field"><label htmlFor="ws">لینک فروشگاه</label><input id="ws" type="text" dir="ltr" required placeholder="petshop.ir" maxLength={80} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
                </div>
              )}
              {role === "seller" && (
                <div className="row2">
                  <div className="field"><label htmlFor="sh">هزینه ارسال (تومان)</label>
                    <input id="sh" type="text" inputMode="numeric" required placeholder="مثلاً ۶۰۰۰۰ (رایگان: ۰)" value={form.shipping_flat} onChange={(e) => setForm({ ...form, shipping_flat: e.target.value })} />
                    {num(form.shipping_flat) > 0 && <small className="muted">{fa(num(form.shipping_flat))} تومان</small>}</div>
                  <div className="field"><label htmlFor="fo">ارسال رایگان برای خرید بالای (تومان، اختیاری)</label>
                    <input id="fo" type="text" inputMode="numeric" placeholder="مثلاً ۳۰۰۰۰۰۰ (ندارد: خالی)" value={form.free_over} onChange={(e) => setForm({ ...form, free_over: e.target.value })} />
                    {num(form.free_over) > 0 && <small className="muted">{fa(num(form.free_over))} تومان</small>}</div>
                </div>
              )}
              {role === "seller" && <div className="hint">هزینه ارسال را خودتان اعلام می‌کنید و در «قیمت نهایی» همه محصولاتتان حساب می‌شود. لینک سایت فروشگاهتان را بنویسید (https). مدیر پت‌مچ آن را بررسی می‌کند و فروشگاه فقط بعد از تأیید مدیر اضافه می‌شود؛ تا آن موقع پنل در حالت «در انتظار تأیید» است.</div>}
              <label className="check"><input type="checkbox" checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} />
                <span>قوانین پت‌مچ و سیاست حریم خصوصی را می‌پذیرم. فقط شماره موبایل و نام ذخیره می‌شود.</span></label>
              {err && <div className="err-msg">{err} {err.includes("وارد شوید") && <Link href="/login">ورود</Link>}</div>}
              <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "در حال ارسال…" : "ادامه و دریافت کد"}</button>
            </form>
            <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>قبلاً ثبت‌نام کرده‌ای؟ <Link href="/login">وارد شو</Link></p>
          </>
        ) : (
          <OtpStep phone={form.phone} sent={sent} onBack={() => setSent(null)}
            onResend={() => api("/api/v1/auth/signup", { method: "POST", json: body() })}
            onVerified={async (u) => { await refresh(); toast(`حساب ${u.role_fa} ساخته شد`); const nx = params.get("next");
              router.push(u.role === "seller" ? "/seller" : nx && nx.startsWith("/") && !nx.startsWith("//") ? nx : "/pet"); }} />
        )}
      </div>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense><SignupView /></Suspense>;
}

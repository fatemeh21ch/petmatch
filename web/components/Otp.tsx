"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { User } from "@/lib/client";
import { fa } from "@/lib/format";

const LEN = 5;
const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** Step 2 of login/signup: enter the 5-digit code.
 *  Demo mode: the API returns the code (no SMS gateway), we show it as an incoming "SMS" and
 *  type it in automatically — the same experience as Android/iOS one-time-code autofill. */
export default function OtpStep({ phone, sent, onVerified, onBack, onResend }:
  { phone: string; sent: any; onVerified: (u: User) => void; onBack: () => void; onResend: () => Promise<any> }) {
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number>(sent.expires_in);
  const [resendIn, setResendIn] = useState<number>(sent.resend_in);
  const [demo, setDemo] = useState<string | null>(sent.demo_code || null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => { setLeft((x) => Math.max(0, x - 1)); setResendIn((x) => Math.max(0, x - 1)); }, 1000);
    return () => clearInterval(t);
  }, []);

  // demo autofill: type the code digit by digit, then submit
  useEffect(() => {
    if (!demo) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setDigits(demo.slice(0, i).split("").concat(Array(LEN - i).fill("")));
      if (i >= LEN) { clearInterval(t); setTimeout(() => submit(demo), 350); }
    }, 170);
    return () => clearInterval(t);
  }, [demo]); // eslint-disable-line

  async function submit(code = digits.join("")) {
    if (code.length < LEN || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ user: User }>("/api/v1/auth/otp/verify", { method: "POST", json: { phone, code } });
      onVerified(r.user);
    } catch (e: any) {
      setErr(e.message); setDigits(Array(LEN).fill("")); refs.current[0]?.focus();
    } finally { setBusy(false); }
  }

  const setAt = (i: number, raw: string) => {
    const v = toLatin(raw).replace(/\D/g, "");
    if (v.length > 1) {          // pasted / OS-autofilled the whole code
      const all = v.slice(0, LEN).split("");
      setDigits(all.concat(Array(LEN - all.length).fill("")));
      if (all.length === LEN) submit(all.join(""));
      return;
    }
    const next = [...digits]; next[i] = v; setDigits(next);
    if (v && i < LEN - 1) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) submit(next.join(""));
  };

  return (
    <div>
      <div className="steps"><span className="on" /><span className="on" /></div>
      <h1>کد تأیید را وارد کن</h1>
      <p className="sub">کد ۵ رقمی به <span className="ltr" style={{ direction: "ltr", display: "inline-block" }}>{sent.masked}</span> ارسال شد.
        <button className="linkish" style={{ marginRight: 8 }} onClick={onBack}>تغییر شماره</button></p>
      {demo && (
        <div className="sms" role="status">
          <span className="ic">SMS</span>
          <div>پت‌مچ: کد ورود شما <b>{demo}</b><small>نسخه نمایشی: پیامکی ارسال نمی‌شود؛ کد خودکار وارد می‌شود (مثل پرکردن خودکار کد در موبایل).</small></div>
        </div>
      )}
      <div className={`otp-boxes ${err ? "err" : ""}`} onPaste={(e) => { e.preventDefault(); setAt(0, e.clipboardData.getData("text")); }}>
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" maxLength={i === 0 ? LEN : 1}
            autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`رقم ${fa(i + 1)}`} className={d ? "filled" : ""} autoFocus={i === 0}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); if (e.key === "Enter") submit(); }} />
        ))}
      </div>
      {err && <div className="err-msg" style={{ textAlign: "center" }}>{err}</div>}
      <div className="timer">{left > 0 ? `اعتبار کد: ${fa(Math.floor(left / 60))}:${fa(left % 60).padStart(2, "۰")}` : "کد منقضی شد"}</div>
      <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || digits.some((x) => !x)} onClick={() => submit()}>
        {busy ? "در حال بررسی…" : "تأیید و ورود"}</button>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        {resendIn > 0 ? <span className="hint">ارسال دوباره تا {fa(resendIn)} ثانیه دیگر</span> : (
          <button className="linkish" style={{ fontSize: 13 }} onClick={async () => {
            try { const r = await onResend(); setLeft(r.expires_in); setResendIn(r.resend_in); setErr(""); setDemo(r.demo_code || null); }
            catch (e: any) { setErr(e.message); }
          }}>ارسال دوباره کد</button>
        )}
      </div>
    </div>
  );
}

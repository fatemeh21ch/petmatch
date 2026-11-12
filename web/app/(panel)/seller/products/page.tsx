"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Guard from "@/components/Guard";
import { Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/client";
import { fa, fd } from "@/lib/format";

const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");
const EMPTY = { title: "", category: "غذای خشک گربه", weight: "", price: "", available: true, url: "" };
const DECISION: Record<string, [string, string]> = {
  auto: ["good", "وصل به محصول موجود"], approved: ["good", "تأییدشده توسط مدیر"], new: ["brand", "محصول جدید"],
  review: ["warn", "در صف بررسی مدیر"], rejected: ["bad", "رد شد"],
};

function MatchBox({ m, live }: { m: any; live?: boolean }) {
  if (!m) return null;
  const [cls, label] = DECISION[m.decision] || ["", m.decision];
  return (
    <div className={`match-box ${cls}`}>
      <div className="mh"><span className={`pill ${cls}`}>{label}</span>{live && <small className="muted">پیش‌نمایش؛ هنوز ذخیره نشده</small>}</div>
      <p>{fd(m.text)}</p>
      {Object.keys(m.understood || {}).length > 0 && (
        <div className="understood">{Object.entries(m.understood).map(([k, v]) => <span key={k} className="chip"><small>{k}:</small> {fd(String(v))}</span>)}</div>
      )}
      {m.duplicate && <div className="alert warn" style={{ marginTop: 8 }}>{m.duplicate}</div>}
      {m.missing?.length > 0 && <div className="alert warn" style={{ marginTop: 8 }}>از عنوان تشخیص ندادیم: {m.missing.join("، ")}. اضافه کردنشان به عنوان یا فیلد وزن، تطبیق را دقیق‌تر می‌کند.</div>}
    </div>
  );
}

function Row({ r, onChange }: { r: any; onChange: () => void }) {
  const [price, setPrice] = useState(String(r.price_toman));
  const [busy, setBusy] = useState(false);
  const save = async (patch: any, msg: string) => {
    setBusy(true);
    try { await api(`/api/v1/seller/listings/${r.id}`, { method: "PATCH", json: patch }); toast(msg); onChange(); }
    catch (e: any) { toast(e.message); }
    finally { setBusy(false); }
  };
  const [cls, label] = DECISION[r.match.decision] || ["", ""];
  return (
    <tr>
      <td style={{ minWidth: 240 }}>
        <b>{fd(r.title)}</b>
        <div className="muted" style={{ fontSize: 12 }}>{r.category}{r.weight ? ` · ${fd(r.weight)}` : ""}</div>
      </td>
      <td><span className={`pill ${cls}`}>{label}</span>
        {r.match.product_id && <div><Link className="linkish" href={`/p/${r.match.product_id}`} style={{ fontSize: 12 }}>دیدن در مقایسه</Link></div>}</td>
      <td>
        <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); const v = +toLatin(price); if (v >= 1000) save({ price_toman: v }, "قیمت به‌روز شد"); else toast("قیمت نامعتبر است"); }}>
          <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="قیمت به تومان" />
          {+toLatin(price) !== r.price_toman && <button className="btn btn-primary btn-sm" disabled={busy}>ذخیره</button>}
        </form>
      </td>
      <td><label className="check" style={{ alignItems: "center" }}>
        <input type="checkbox" checked={r.available} disabled={busy} onChange={(e) => save({ available: e.target.checked }, e.target.checked ? "موجود شد" : "ناموجود شد")} /> موجود</label></td>
      <td><button className="btn btn-bad btn-sm" disabled={busy} onClick={async () => {
        if (!confirm(`«${r.title}» از پت‌مچ حذف شود؟`)) return;
        try { await api(`/api/v1/seller/listings/${r.id}`, { method: "DELETE" }); toast("محصول حذف شد"); onChange(); } catch (e: any) { toast(e.message); }
      }}>حذف</button></td>
    </tr>
  );
}

function Products() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState(EMPTY);
  const [preview, setPreview] = useState<any>(null);
  const [saved, setSaved] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api("/api/v1/seller/listings").then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const body = () => ({ title: f.title.trim(), category: f.category, weight: f.weight.trim(), price_toman: +toLatin(f.price) || 0,
    available: f.available, url: f.url.trim() || null });
  const ready = f.title.trim().length >= 5 && +toLatin(f.price) >= 1000;

  // live preview: the real matching pipeline, run as a dry run while the seller types
  useEffect(() => {
    if (!ready) { setPreview(null); return; }
    const t = setTimeout(() => {
      api("/api/v1/seller/listings/preview", { method: "POST", json: body() }).then(setPreview).catch(() => setPreview(null));
    }, 500);
    return () => clearTimeout(t);
  }, [f.title, f.category, f.weight, f.price]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="notice" style={{ marginTop: 24 }}>{err}</div>;
  if (!data) return <div className="skeleton" style={{ height: 420, marginTop: 24 }} />;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <>
      <div className="dash-head">
        <span className="logo-tile" style={{ background: "var(--brand)" }}><Ui n="box" s={28} /></span>
        <div><h1>محصولات و افزودن محصول</h1>
          <div className="meta">محصولی که اینجا اضافه می‌کنید از همان مسیر فیدها می‌گذرد: یکسان‌سازی، استخراج ویژگی و تطبیق با کاتالوگ.</div></div>
      </div>

      <div className="grid2">
        <form className="card-p add-form" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api("/api/v1/seller/listings", { method: "POST", json: body() });
            setSaved(r); setF(EMPTY); setPreview(null); toast("محصول اضافه شد"); load();
          } catch (e: any) { toast(e.message); }
          finally { setBusy(false); }
        }}>
          <h3>افزودن محصول جدید</h3>
          <div className="sub">عنوان را همان‌طور بنویسید که در سایت خودتان است؛ برند، سن و وزن را از آن تشخیص می‌دهیم.</div>
          <div className="field"><label htmlFor="t">عنوان محصول</label>
            <input id="t" type="text" value={f.title} onChange={set("title")} placeholder="مثلاً: غذای خشک گربه رویال کنین ایندور ۲۷" required minLength={5} maxLength={120} /></div>
          <div className="form-row">
            <div className="field"><label htmlFor="c">دسته</label>
              <select id="c" value={f.category} onChange={set("category")}>{data.categories.map((c: string) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label htmlFor="w">وزن یا حجم بسته</label>
              <input id="w" type="text" value={f.weight} onChange={set("weight")} placeholder="۲ کیلو، ۴۰۰ گرم، ۱۰ لیتر" maxLength={30} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="p">قیمت (تومان)</label>
              <input id="p" type="text" inputMode="numeric" value={f.price} onChange={set("price")} placeholder="3400000" required />
              {+toLatin(f.price) >= 1000 && <small className="muted">{fa(+toLatin(f.price))} تومان</small>}</div>
            <div className="field"><label htmlFor="u">لینک محصول در سایت شما <small className="muted">(اختیاری)</small></label>
              <input id="u" type="text" dir="ltr" value={f.url} onChange={set("url")} placeholder={`${data.website}/p/...`} maxLength={200} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={f.available} onChange={set("available")} /> موجود در انبار</label>
          <MatchBox m={preview} live />
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={!ready || busy}>{busy ? "در حال ثبت…" : "ثبت محصول"}</button>
        </form>

        <div className="card-p">
          <h3>بعد از ثبت چه می‌شود؟</h3>
          <div className="sub">همان تصمیمی که برای فیدهای CSV و API گرفته می‌شود</div>
          <div className="alerts">
            <div className="alert info"><b>وصل به محصول موجود:</b> اگر همان محصول را فروشگاه دیگری دارد (شباهت ≥ ۰٫۹۵ و بدون اختلاف وزن، مدل یا طعم)، پیشنهاد شما کنارش در جدول مقایسه می‌آید.</div>
            <div className="alert info"><b>محصول جدید:</b> اگر مشابهی نبود، یک محصول تازه در کاتالوگ ساخته می‌شود.</div>
            <div className="alert warn"><b>صف بررسی:</b> اگر شبیه است ولی اطلاعات مهمی (مثل وزن یا مدل) ناقص است، مدیر تصمیم می‌گیرد؛ ادغام اشتباه از ادغام‌نکردن بدتر است.</div>
            <div className="alert warn"><b>قیمت مشکوک:</b> قیمت ۳۵٪ زیر میانه بازار پیشنهاد اول نمی‌شود.</div>
          </div>
          {saved && <><h3 style={{ marginTop: 16 }}>آخرین ثبت</h3><MatchBox m={saved.match} /></>}
        </div>
      </div>

      <section className="sec">
        <div className="sec-h"><div><h2>محصولاتی که دستی اضافه کرده‌اید</h2>
          <div className="sub">قیمت و موجودی را همین‌جا به‌روز کنید؛ هر تغییر زمان «آخرین بررسی قیمت» را تازه می‌کند. محصولات فید از خود فید به‌روز می‌شوند.</div></div></div>
        {data.items.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>محصول</th><th>نتیجه تطبیق</th><th>قیمت (تومان)</th><th>موجودی</th><th></th></tr></thead>
            <tbody>{data.items.map((r: any) => <Row key={r.id + r.updated_at} r={r} onChange={load} />)}</tbody>
          </table></div>
        ) : <p className="hint">هنوز محصولی دستی اضافه نکرده‌اید.</p>}
      </section>
    </>
  );
}

export default function SellerProductsPage() {
  return <Guard role="seller"><Products /></Guard>;
}

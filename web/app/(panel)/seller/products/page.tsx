"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Guard from "@/components/Guard";
import { Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/client";
import { fa, fd } from "@/lib/format";

const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");
type Form = { title: string; category: string; weight: string; price: string; available: boolean; url: string };
const EMPTY: Form = { title: "", category: "غذای خشک گربه", weight: "", price: "", available: true, url: "" };
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

function validate(f: Form, feed: boolean) {
  const e: Record<string, string> = {};
  if (f.title.trim().length < 5) e.title = "عنوان را کامل بنویسید (حداقل ۵ حرف)، مثلاً «غذای خشک گربه رویال کنین ایندور ۲۷».";
  const p = +toLatin(f.price);
  if (!f.price.trim()) e.price = "قیمت را وارد کنید.";
  else if (!Number.isFinite(p) || p < 1000) e.price = "قیمت باید عدد و حداقل ۱٬۰۰۰ تومان باشد.";
  if (!feed && f.url.trim() && !f.url.trim().startsWith("https://")) e.url = "لینک باید با https:// شروع شود.";
  return e;
}

/** Add a new product, or edit an existing one (`editing`). Feed products: only title, price and stock. */
function ProductForm({ data, editing, onDone, onCancel }: { data: any; editing: any | null; onDone: (r: any) => void; onCancel: () => void }) {
  const feed = editing?.source === "feed";
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setErrors({}); setPreview(null);
    setF(editing ? { title: editing.title, category: editing.category || EMPTY.category, weight: editing.weight || "",
      price: String(editing.price_toman), available: editing.available, url: editing.source === "manual" ? editing.url : "" } : EMPTY);
  }, [editing]);

  const body = () => ({ title: f.title.trim(), category: f.category, weight: f.weight.trim(), price_toman: +toLatin(f.price) || 0,
    available: f.available, url: f.url.trim() || null });

  // live preview: the real matching pipeline, run as a dry run while the seller types (not for feed products:
  // their category and weight come from the feed)
  useEffect(() => {
    if (feed || Object.keys(validate(f, false)).length) { setPreview(null); return; }
    const t = setTimeout(() => {
      api("/api/v1/seller/listings/preview", { method: "POST", json: { ...body(), replaces: editing?.id || null } })
        .then(setPreview).catch(() => setPreview(null));
    }, 500);
    return () => clearTimeout(t);
  }, [f.title, f.category, f.weight, f.price, feed]);   // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Form) => (e: any) => {
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: "" });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(f, feed);
    setErrors(errs);
    if (Object.keys(errs).length) { toast("چند فیلد کامل نیست؛ پیام قرمز زیر هر فیلد را ببینید."); return; }
    setBusy(true);
    try {
      const b = body();
      const r = editing
        ? await api(`/api/v1/seller/listings/${editing.id}`, { method: "PATCH",
            json: feed ? { title: b.title, price_toman: b.price_toman, available: b.available } : { ...b, url: b.url || editing.url } })
        : await api("/api/v1/seller/listings", { method: "POST", json: b });
      toast(editing ? "تغییرات ذخیره شد" : "محصول اضافه شد");
      setF(EMPTY); setPreview(null);
      onDone(r);
    } catch (err: any) { toast(err.message); setErrors({ form: err.message }); }
    finally { setBusy(false); }
  }

  const Err = ({ k }: { k: string }) => (errors[k] ? <div className="err-msg">{errors[k]}</div> : null);
  return (
    <form id="product-form" className={`card-p add-form ${editing ? "editing" : ""}`} onSubmit={submit} noValidate>
      <h3>{editing ? "ویرایش محصول" : "افزودن محصول جدید"}</h3>
      <div className="sub">{editing
        ? feed ? `این محصول از فید فروشگاه (${data.feed_format}) می‌آید؛ عنوان، قیمت و موجودی را اینجا می‌شود عوض کرد.` : "همه فیلدها قابل ویرایش است؛ بعد از ذخیره دوباره تطبیق داده می‌شود."
        : "عنوان را همان‌طور بنویسید که در سایت خودتان است؛ برند، سن و وزن را از آن تشخیص می‌دهیم."}</div>
      <div className="field"><label htmlFor="t">عنوان محصول</label>
        <input id="t" type="text" value={f.title} onChange={set("title")} placeholder="مثلاً: غذای خشک گربه رویال کنین ایندور ۲۷" maxLength={120} aria-invalid={!!errors.title} /><Err k="title" /></div>
      {!feed && (
        <div className="form-row">
          <div className="field"><label htmlFor="c">دسته</label>
            <select id="c" value={f.category} onChange={set("category")}>{data.categories.map((c: string) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="w">وزن یا حجم بسته</label>
            <input id="w" type="text" value={f.weight} onChange={set("weight")} placeholder="۲ کیلو، ۴۰۰ گرم، ۱۰ لیتر" maxLength={30} /></div>
        </div>
      )}
      <div className="form-row">
        <div className="field"><label htmlFor="p">قیمت (تومان)</label>
          <input id="p" type="text" inputMode="numeric" value={f.price} onChange={set("price")} placeholder="مثلاً ۳۴۰۰۰۰۰" aria-invalid={!!errors.price} />
          {+toLatin(f.price) >= 1000 ? <small className="muted">{fa(+toLatin(f.price))} تومان</small> : null}<Err k="price" /></div>
        {!feed && <div className="field"><label htmlFor="u">لینک محصول در سایت شما <small className="muted">(اختیاری)</small></label>
          <input id="u" type="text" dir="ltr" value={f.url} onChange={set("url")} placeholder={`${data.website}/p/...`} maxLength={200} aria-invalid={!!errors.url} /><Err k="url" /></div>}
      </div>
      <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={f.available} onChange={set("available")} /> موجود در انبار</label>
      <MatchBox m={preview} live />
      {errors.form && <div className="alert bad" style={{ marginTop: 10 }}>{errors.form}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={busy}>
          {busy ? "در حال ذخیره…" : editing ? "ذخیره تغییرات" : "ثبت محصول"}</button>
        {editing && <button type="button" className="btn btn-ghost" onClick={onCancel}>انصراف</button>}
      </div>
    </form>
  );
}

const FILTERS: [string, string][] = [["all", "همه"], ["manual", "دستی"], ["feed", "از فید"], ["hidden", "حذف‌شده"]];

function Products() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [saved, setSaved] = useState<any>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const wantEdit = useRef<string | null>(null);
  const load = useCallback(() => api("/api/v1/seller/listings").then((d) => {
    setData(d);
    if (wantEdit.current) { setEditing(d.items.find((i: any) => i.id === wantEdit.current) || null); wantEdit.current = null; }
  }).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    wantEdit.current = new URLSearchParams(window.location.search).get("edit");   // from the dashboard's "ویرایش"
    load();
  }, [load]);

  const edit = (it: any) => {
    setEditing(it); setSaved(null);
    setTimeout(() => document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const remove = async (it: any) => {
    const feed = it.source === "feed";
    if (!confirm(feed ? `«${it.title}» از پت‌مچ برداشته شود؟ (فید هنوز آن را می‌فرستد؛ بعداً می‌توانید برگردانید)` : `«${it.title}» برای همیشه حذف شود؟`)) return;
    try { await api(`/api/v1/seller/listings/${it.id}`, { method: "DELETE" }); toast(feed ? "از پت‌مچ برداشته شد" : "محصول حذف شد"); if (editing?.id === it.id) setEditing(null); load(); }
    catch (e: any) { toast(e.message); }
  };
  const restore = async (it: any) => {
    try { await api(`/api/v1/seller/listings/${it.id}`, { method: "PATCH", json: { hidden: false } }); toast("محصول برگشت"); load(); }
    catch (e: any) { toast(e.message); }
  };

  if (err) return <div className="notice" style={{ marginTop: 24 }}>{err}</div>;
  if (!data) return <div className="skeleton" style={{ height: 420, marginTop: 24 }} />;
  const count = (k: string) => data.items.filter((i: any) => (k === "all" ? !i.hidden : k === "hidden" ? i.hidden : i.source === k && !i.hidden)).length;
  const rows = data.items.filter((i: any) => (filter === "all" ? !i.hidden : filter === "hidden" ? i.hidden : i.source === filter && !i.hidden)
    && (!q.trim() || fd(i.title).includes(fd(q.trim()))));

  return (
    <>
      <div className="dash-head">
        <span className="logo-tile" style={{ background: "var(--brand)" }}><Ui n="box" s={28} /></span>
        <div><h1>محصولات من</h1>
          <div className="meta">افزودن، ویرایش و حذف محصول. هر تغییر از همان مسیر فیدها می‌گذرد: یکسان‌سازی، استخراج ویژگی و تطبیق با کاتالوگ.</div></div>
      </div>

      <div className="grid2">
        <ProductForm data={data} editing={editing} onCancel={() => setEditing(null)}
          onDone={(r) => { setSaved(r); setEditing(null); load(); }} />
        <div className="card-p">
          <h3>بعد از ثبت چه می‌شود؟</h3>
          <div className="sub">همان تصمیمی که برای فیدهای CSV و API گرفته می‌شود</div>
          <div className="alerts">
            <div className="alert info"><b>وصل به محصول موجود:</b> اگر همان محصول را فروشگاه دیگری دارد (شباهت ≥ ۰٫۹۵ و بدون اختلاف وزن، مدل یا طعم)، پیشنهاد شما کنارش در جدول مقایسه می‌آید.</div>
            <div className="alert info"><b>محصول جدید:</b> اگر مشابهی نبود، یک محصول تازه در کاتالوگ ساخته می‌شود.</div>
            <div className="alert warn"><b>صف بررسی:</b> اگر شبیه است ولی اطلاعات مهمی ناقص است، مدیر تصمیم می‌گیرد؛ ادغام اشتباه از ادغام‌نکردن بدتر است.</div>
            <div className="alert warn"><b>قیمت مشکوک:</b> قیمت ۳۵٪ زیر میانه بازار پیشنهاد اول نمی‌شود.</div>
          </div>
          {saved && <><h3 style={{ marginTop: 16 }}>آخرین ذخیره: {fd(saved.title)}</h3><MatchBox m={saved.match} /></>}
        </div>
      </div>

      <section className="sec">
        <div className="sec-h"><div><h2>همه محصولات شما</h2>
          <div className="sub">«ویرایش» فرم بالا را با اطلاعات همان محصول پر می‌کند. محصول فید با «حذف» فقط از پت‌مچ برداشته می‌شود و قابل برگشت است.</div></div></div>
        <div className="list-tools">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در محصولات شما" aria-label="جست‌وجو در محصولات" />
          <div className="sortbar" style={{ margin: 0 }}>{FILTERS.map(([k, l]) => (
            <button key={k} className="sort" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} ({fa(count(k))})</button>))}</div>
        </div>
        {rows.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>محصول</th><th>نتیجه تطبیق</th><th>قیمت</th><th>موجودی</th><th></th></tr></thead>
            <tbody>{rows.map((it: any) => {
              const [cls, label] = it.match ? DECISION[it.match.decision] || ["", ""] : ["", ""];
              return (
                <tr key={it.id} className={editing?.id === it.id ? "row-editing" : ""}>
                  <td style={{ minWidth: 260 }}>
                    <b>{fd(it.title)}</b>
                    <div className="row-meta">
                      <span className={`pill ${it.source === "manual" ? "brand" : ""}`}>{it.source === "manual" ? "دستی" : "فید"}</span>
                      {it.edited && <span className="pill warn">ویرایش‌شده در پنل</span>}
                      {it.category && <span>{it.category}{it.weight ? ` · ${fd(it.weight)}` : ""}</span>}
                    </div>
                  </td>
                  <td>{it.hidden ? <span className="pill">برداشته‌شده از پت‌مچ</span> : <span className={`pill ${cls}`}>{label}</span>}
                    {it.match?.product_id && <div><Link className="linkish" href={`/p/${it.match.product_id}`} style={{ fontSize: 12 }}>دیدن در مقایسه</Link></div>}</td>
                  <td>{fa(it.price_toman)} <small className="muted">تومان</small></td>
                  <td>{it.available ? <span className="pill good">موجود</span> : <span className="pill">ناموجود</span>}</td>
                  <td><div className="row-acts">
                    {it.hidden ? <button className="btn btn-ghost btn-sm" onClick={() => restore(it)}>بازگرداندن</button> : <>
                      <button className="btn btn-ghost btn-sm" onClick={() => edit(it)}>ویرایش</button>
                      <button className="btn btn-bad btn-sm" onClick={() => remove(it)}>حذف</button></>}
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <p className="hint">محصولی با این فیلتر نیست.</p>}
      </section>
    </>
  );
}

export default function SellerProductsPage() {
  return <Guard role="seller"><Products /></Guard>;
}

"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/client";
import { fa } from "@/lib/format";

const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");
const EMPTY = { name: "", website: "https://", shipping_flat: "0", free_over: "0", color: "#13566c", owner_phone: "" };

/** Admin: every store, block / unblock, add a new one (optionally activating a waiting seller account).
 * Products still only come from feeds: a new store shows its products once its feed is connected. */
export default function AdminStores() {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api("/api/v1/admin/stores").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const block = async (s: any) => {
    const reason = prompt(`دلیل مسدود کردن «${s.name}» (برای فروشنده نمایش داده می‌شود؛ اختیاری):`, "");
    if (reason === null) return;
    try { await api(`/api/v1/admin/stores/${s.id}/block`, { method: "POST", json: { reason } }); toast(`«${s.name}» مسدود شد؛ پیشنهادهایش از مقایسه حذف شد.`); load(); }
    catch (e: any) { toast(e.message); }
  };
  const unblock = async (s: any) => {
    try { await api(`/api/v1/admin/stores/${s.id}/unblock`, { method: "POST" }); toast(`«${s.name}» دوباره فعال شد.`); load(); }
    catch (e: any) { toast(e.message); }
  };
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (f.name.trim().length < 2) { setErr("نام فروشگاه را وارد کنید."); return; }
    if (!/^https:\/\/[^/]+\.[^/]+/.test(f.website.trim())) { setErr("آدرس سایت باید کامل و با https:// باشد، مثلاً https://petland.ir"); return; }
    setBusy(true);
    try {
      const s = await api("/api/v1/admin/stores", { method: "POST", json: {
        name: f.name.trim(), website: f.website.trim(), shipping_flat: +toLatin(f.shipping_flat) || 0,
        free_over: +toLatin(f.free_over) || 0, color: f.color, owner_phone: f.owner_phone || null } });
      toast(`فروشگاه «${s.name}» اضافه شد.`); setF(EMPTY); load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  const set = (k: keyof typeof EMPTY) => (e: any) => setF({ ...f, [k]: e.target.value });

  if (!d) return err ? <div className="notice">{err}</div> : <div className="skeleton" style={{ height: 400 }} />;
  const active = d.stores.filter((s: any) => s.status === "active").length;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="v">{fa(d.stores.length)}</div><div className="k">فروشگاه</div></div>
        <div className="kpi"><div className="v">{fa(active)}</div><div className="k">فعال</div></div>
        <div className="kpi"><div className="v">{fa(d.stores.length - active)}</div><div className="k">مسدود</div></div>
        <div className="kpi"><div className="v">{fa(d.pending_sellers.length)}</div><div className="k">فروشنده در انتظار تأیید</div></div>
      </div>

      <section className="sec">
        <div className="sec-h"><div><h2>همه <b>فروشگاه‌ها</b></h2>
          <div className="sub">مسدود کردن، همه پیشنهادهای فروشگاه را بلافاصله از جست‌وجو، صفحه محصول و کلیک خرید برمی‌دارد؛ فید آن دیگر خوانده نمی‌شود.</div></div></div>
        <div className="table-wrap"><table>
          <thead><tr><th>فروشگاه</th><th>وضعیت</th><th>آگهی در فید</th><th>پیشنهاد فعال</th><th>ارسال</th><th>حساب فروشنده</th><th></th></tr></thead>
          <tbody>{d.stores.map((s: any) => (
            <tr key={s.id} className={s.status === "blocked" ? "row-blocked" : ""}>
              <td style={{ minWidth: 180 }}><i className="dot" style={{ background: s.color }} /><b>{s.name}</b>
                <div className="muted ltr" style={{ fontSize: 12, direction: "ltr", textAlign: "right" }}>{s.website.replace("https://", "")}</div>
                <small className="muted">{s.source === "admin" ? "اضافه‌شده توسط مدیر · " : ""}فرمت فید: {s.format}</small></td>
              <td>{s.status === "blocked"
                ? <><span className="pill bad">مسدود</span>{s.blocked?.reason && <div className="muted" style={{ fontSize: 12 }}>{s.blocked.reason}</div>}</>
                : <span className="pill good">فعال</span>}</td>
              <td>{fa(s.feed_listings)}</td>
              <td>{fa(s.live_offers)}</td>
              <td style={{ fontSize: 12.5 }}>{s.shipping.flat ? `${fa(s.shipping.flat)} تومان` : "رایگان"}{s.shipping.free_over ? <><br /><span className="muted">رایگان از {fa(s.shipping.free_over)}</span></> : null}</td>
              <td style={{ fontSize: 12.5 }}>{s.accounts.length ? s.accounts.map((u: any) => <div key={u.phone}>{u.name}</div>) : <span className="muted">—</span>}</td>
              <td>{s.status === "blocked"
                ? <button className="btn btn-good btn-sm" onClick={() => unblock(s)}>رفع مسدودی</button>
                : <button className="btn btn-bad btn-sm" onClick={() => block(s)}>مسدود کردن</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      <div className="grid2 sec">
        <form className="card-p store-form" onSubmit={add} noValidate>
          <h3>افزودن فروشگاه</h3>
          <div className="sub">فروشگاه ثبت می‌شود و محصولاتش بعد از اتصال فید (CSV، JSON یا API) وارد پایپ‌لاین تطبیق می‌شوند.</div>
          <div className="form-row">
            <div className="field"><label htmlFor="sn">نام فروشگاه</label><input id="sn" type="text" value={f.name} onChange={set("name")} maxLength={40} placeholder="مثلاً پت‌لند" /></div>
            <div className="field"><label htmlFor="sw">آدرس سایت</label><input id="sw" type="text" dir="ltr" value={f.website} onChange={set("website")} maxLength={80} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="ss">هزینه ارسال (تومان)</label><input id="ss" type="text" inputMode="numeric" value={f.shipping_flat} onChange={set("shipping_flat")} /></div>
            <div className="field"><label htmlFor="sf">ارسال رایگان از (تومان، ۰ = ندارد)</label><input id="sf" type="text" inputMode="numeric" value={f.free_over} onChange={set("free_over")} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="so">حساب فروشنده <small className="muted">(اختیاری)</small></label>
              <select id="so" value={f.owner_phone} onChange={(e) => {
                const u = d.pending_sellers.find((x: any) => x.phone === e.target.value);
                setF({ ...f, owner_phone: e.target.value, name: f.name || u?.store_name || "" });
              }}>
                <option value="">بدون حساب</option>
                {d.pending_sellers.map((u: any) => <option key={u.phone} value={u.phone}>{u.store_name || "بی‌نام"} · {u.name}</option>)}
              </select>
              <small className="muted">{d.pending_sellers.length ? "حساب انتخاب‌شده تأیید و به این فروشگاه وصل می‌شود." : "فروشنده‌ای در انتظار تأیید نیست."}</small></div>
            <div className="field"><label htmlFor="sc">رنگ فروشگاه</label><input id="sc" type="color" value={f.color} onChange={set("color")} className="color-in" /></div>
          </div>
          {err && <div className="err-msg">{err}</div>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy}>{busy ? "در حال ثبت…" : "افزودن فروشگاه"}</button>
        </form>
        <div className="card-p">
          <h3>فروشندگان در انتظار تأیید</h3>
          <div className="sub">کسانی که از فرم ثبت‌نام، فروشنده شده‌اند</div>
          {d.pending_sellers.length ? <div className="qlist">{d.pending_sellers.map((u: any) => (
            <div key={u.phone} className="qrow"><span><b>{u.store_name || "بی‌نام"}</b> · {u.name} <span className="ltr" style={{ direction: "ltr" }}>{u.phone}</span></span>
              <button className="linkish" onClick={() => setF({ ...f, owner_phone: u.phone, name: u.store_name || f.name })}>ساخت فروشگاه</button></div>))}</div>
            : <p className="hint">فعلاً کسی منتظر نیست.</p>}
        </div>
      </div>
    </>
  );
}

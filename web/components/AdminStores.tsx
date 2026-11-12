"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/client";
import { fa } from "@/lib/format";

/** One waiting seller signup: open the link, check the store's own shipping rule, approve (creates the store) or reject. */
function Approval({ u, onDone }: { u: any; onDone: () => void }) {
  const [color, setColor] = useState("#13566c");
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      const s = await api(`/api/v1/admin/sellers/${u.phone}/approve`, { method: "POST", json: { color } });
      toast(`فروشگاه «${s.name}» تأیید و اضافه شد.`); onDone();
    } catch (e: any) { toast(e.message); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    const reason = prompt(`دلیل رد درخواست «${u.store_name}» (به فروشنده نشان داده می‌شود؛ اختیاری):`, "");
    if (reason === null) return;
    try { await api(`/api/v1/admin/sellers/${u.phone}/reject`, { method: "POST", json: { reason } }); toast("درخواست رد شد."); onDone(); }
    catch (e: any) { toast(e.message); }
  };
  return (
    <div className="card-p approval">
      <div className="ap-head">
        <div><h3>{u.store_name || "بی‌نام"}</h3>
          <div className="muted" style={{ fontSize: 13 }}>{u.name} · <span className="ltr" style={{ direction: "ltr" }}>{u.phone}</span>
            {u.created_at && ` · ${new Date(u.created_at).toLocaleDateString("fa-IR")}`}</div></div>
        {u.website ? <a className="btn btn-ghost btn-sm" href={u.website} target="_blank" rel="noopener noreferrer nofollow" dir="ltr">{u.website.replace("https://", "")} ↗</a>
          : <span className="pill bad">بدون لینک</span>}
      </div>
      <div className="ap-ship">
        <span><small>هزینه ارسال اعلام‌شده</small><b>{u.shipping ? (u.shipping.flat ? `${fa(u.shipping.flat)} تومان` : "رایگان") : "—"}</b></span>
        <span><small>ارسال رایگان از</small><b>{u.shipping?.free_over ? `${fa(u.shipping.free_over)} تومان` : "ندارد"}</b></span>
      </div>
      {!u.shipping && <div className="alert warn" style={{ marginTop: 8 }}>این درخواست قبل از اجباری شدن هزینه ارسال ثبت شده؛ قابل تأیید نیست.</div>}
      <div className="ap-acts">
        <label className="muted" style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>رنگ <input type="color" className="color-in" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <button className="btn btn-good btn-sm" disabled={busy || !u.website || !u.shipping} onClick={approve}>{busy ? "…" : "تأیید و ساخت فروشگاه"}</button>
        <button className="btn btn-bad btn-sm" disabled={busy} onClick={reject}>رد درخواست</button>
      </div>
    </div>
  );
}

/** Admin: every store with block / unblock, and seller signups waiting for approval.
 * A store is only added by approving a signup; products still only come from feeds. */
export default function AdminStores() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
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
  if (!d) return err ? <div className="notice">{err}</div> : <div className="skeleton" style={{ height: 400 }} />;
  const active = d.stores.filter((s: any) => s.status === "active").length;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="v">{fa(d.stores.length)}</div><div className="k">فروشگاه</div></div>
        <div className="kpi"><div className="v">{fa(active)}</div><div className="k">فعال</div></div>
        <div className="kpi"><div className="v">{fa(d.stores.length - active)}</div><div className="k">مسدود</div></div>
        <div className="kpi"><div className="v">{fa(d.pending_sellers.length)}</div><div className="k">درخواست در انتظار تأیید</div></div>
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

      <section className="sec">
        <div className="sec-h"><div><h2>درخواست‌های <b>ثبت فروشگاه</b></h2>
          <div className="sub">فروشگاه فقط با تأیید مدیر اضافه می‌شود. نام و لینک فروشگاه را خود فروشنده در ثبت‌نام وارد کرده؛ قبل از تأیید لینک را باز کنید.</div></div></div>
        {d.pending_sellers.length ? <div className="approvals">{d.pending_sellers.map((u: any) => <Approval key={u.phone} u={u} onDone={load} />)}</div>
          : <div className="panel muted">درخواستی در انتظار نیست. فروشنده‌ها از «ثبت‌نام ← فروشنده» با نام و لینک فروشگاه درخواست می‌دهند.</div>}
        {d.rejected_sellers.length > 0 && <>
          <h3 style={{ marginTop: 16, fontSize: 15 }}>ردشده‌ها</h3>
          <div className="qlist" style={{ marginTop: 6 }}>{d.rejected_sellers.map((u: any) => (
            <div key={u.phone} className="qrow"><span><b>{u.store_name}</b> · {u.name}{u.reject_reason ? ` · دلیل: ${u.reject_reason}` : ""}</span>
              <span className="ltr" style={{ direction: "ltr" }}>{(u.website || "").replace("https://", "")}</span></div>))}</div></>}
      </section>
    </>
  );
}

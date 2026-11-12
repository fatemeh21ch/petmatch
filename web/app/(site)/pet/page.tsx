"use client";
import { useEffect, useState } from "react";
import { ProductCard, Svg, Ui } from "@/components/ui";
import { api } from "@/lib/api";
import { petArt } from "@/lib/art";
import { ageMonths, jalaliToday, MAX_PETS, MONTHS, Pet, petQuery, toast, usePets } from "@/lib/client";
import { fa, SP } from "@/lib/format";

const ALLERGENS: [string, string][] = [["chicken", "مرغ"], ["salmon", "سالمون"], ["lamb", "بره"], ["tuna", "تن ماهی"], ["duck", "اردک"], ["beef", "گوشت گاو"]];
type Breed = { key: string; fa: string; why?: string | null; adult_at: number; size?: string | null };
type Breeds = Record<"cat" | "dog", Breed[]>;
let breedsCache: Promise<Breeds> | null = null;
/** Breed list comes from the API, the same table the ranking uses (kb.BREEDS). */
function useBreeds() {
  const [b, setB] = useState<Breeds | null>(null);
  useEffect(() => {
    breedsCache ??= api<Breeds>("/api/v1/breeds");
    breedsCache.then(setB).catch(() => { breedsCache = null; });
  }, []);
  return b;
}
const breedOf = (b: Breeds | null, p: Partial<Pet>) => (b && p.species && p.breed ? b[p.species].find((x) => x.key === p.breed) : undefined);
function ageText(m: number | null) {
  if (m == null) return "نامشخص";
  const y = Math.floor(m / 12), mm = m % 12;
  return [y ? `${fa(y)} سال` : "", mm ? `${fa(mm)} ماه` : ""].filter(Boolean).join(" و ") || "کمتر از ۱ ماه";
}
function stageOf(p: Pet, br?: Breed) {
  const m = ageMonths(p);
  if (m == null) return null;
  if (m < (br?.adult_at || 12)) return p.species === "cat" ? "بچه‌گربه" : "توله‌سگ";
  return m >= 84 ? "مسن" : "بالغ";
}
function stageHint(p: Pet, br?: Breed) {
  const m = ageMonths(p), n = p.name || (p.species === "cat" ? "گربه‌ات" : "سگت");
  const adult = br?.adult_at || 12;
  if (m == null) return "";
  if (m >= adult - 2 && m < adult) return `${n} ${fa(m)} ماهه است؛ ${fa(adult - m)} ماه دیگر پیشنهادها خودکار به غذای «بالغ» تغییر می‌کند. تغییر غذا را تدریجی انجام بده.`;
  if (adult > 12 && m >= 12 && m < adult - 2) return `${n} ${fa(m)} ماهه است؛ نژاد ${br!.fa} دیرتر بالغ می‌شود، پس تا ${fa(adult)} ماهگی غذای ${p.species === "cat" ? "بچه‌گربه" : "توله"} پیشنهاد می‌دهیم.`;
  if (m >= 78 && m < 84) return `${n} به‌زودی ۷ ساله می‌شود و پیشنهادها غذاهای مناسب حیوانات مسن را هم در نظر می‌گیرند.`;
  return "";
}

function PetForm({ editing, onDone }: { editing: Pet | null; onDone: (id?: string) => void }) {
  const { pets, setPets, setActive } = usePets();
  const t = jalaliToday();
  const [v, setV] = useState<Partial<Pet>>(editing || { species: "cat", allergies: [], sterilised: false, breed: null });
  const breeds = useBreeds();
  const br = breedOf(breeds, v);
  const years = Array.from({ length: 26 }, (_, i) => t.y - i);
  const future = v.birth_year === t.y && (v.birth_month || 1) > t.m;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (future) { toast("تاریخ تولد نمی‌تواند در آینده باشد."); return; }
    const data = { ...v, name: (v.name || "").trim().slice(0, 20), birth_month: v.birth_year ? v.birth_month || 1 : null } as Pet;
    let id = editing?.id;
    if (editing) setPets(pets.map((p) => (p.id === editing.id ? { ...p, ...data } : p)));
    else {
      if (pets.length >= MAX_PETS) { toast(`حداکثر ${fa(MAX_PETS)} حیوان`); return; }
      id = Date.now().toString(36);
      setPets([...pets, { ...data, id }]);
    }
    setActive(id!);
    toast(editing ? "تغییرات ذخیره شد." : "حیوان اضافه شد.");
    onDone(id);
  };
  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>{editing ? `ویرایش ${editing.name}` : "افزودن حیوان"}</h1>
      <p className="muted" style={{ margin: "4px 0 16px" }}>ماه و سال تولد را ثبت کن تا سن هر ماه خودکار محاسبه شود. همه‌چیز فقط روی همین دستگاه ذخیره می‌شود.</p>
      <form className="form panel" onSubmit={save}>
        <div className="field"><fieldset><legend>نوع حیوان</legend><div className="seg">
          {(["cat", "dog"] as const).map((s) => <label key={s}><input type="radio" name="sp" checked={v.species === s} onChange={() => setV({ ...v, species: s, breed: null })} />{s === "cat" ? "🐱 گربه" : "🐶 سگ"}</label>)}
        </div></fieldset></div>
        <div className="field"><label htmlFor="pb">نژاد</label>
          <div className="breed-pick">
            <Svg className="breed-prev" html={petArt({ ...v, id: v.id || "new" })} />
            <select id="pb" value={v.breed || ""} onChange={(e) => setV({ ...v, breed: e.target.value || null })}>
              <option value="">نمی‌دانم</option>
              {(breeds?.[v.species || "cat"] || []).map((b) => <option key={b.key} value={b.key}>{b.fa}</option>)}
            </select>
          </div>
          <div className="hint">{br?.why ? `پیشنهادها برای ${br.fa}: ${br.why}.` : "نژادها نیاز غذایی متفاوتی دارند (مثلاً پرشین کراکت مخصوص و خاک کم‌گرد، نژادهای بزرگ غذای توله تا دیرتر). عکس پروفایل هم از روی نژاد کشیده می‌شود."}</div></div>
        <div className="field"><label htmlFor="pn">نام</label><input id="pn" type="text" maxLength={20} required value={v.name || ""} placeholder="مثلاً پیشی" onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div className="row2">
          <div className="field"><label htmlFor="bm">ماه تولد</label>
            <select id="bm" value={v.birth_month || ""} onChange={(e) => setV({ ...v, birth_month: +e.target.value || null })}><option value="">نمی‌دانم</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div className="field"><label htmlFor="by">سال تولد (شمسی)</label>
            <select id="by" value={v.birth_year || ""} onChange={(e) => setV({ ...v, birth_year: +e.target.value || null })}><option value="">نمی‌دانم</option>{years.map((y) => <option key={y} value={y}>{fa(y)}</option>)}</select></div>
        </div>
        <div className="hint" style={{ marginTop: -6 }}>{!v.birth_year ? "بدون تاریخ تولد، رده سنی در پیشنهادها لحاظ نمی‌شود." : future ? "این تاریخ هنوز نرسیده است." : `سن امروز: ${ageText(ageMonths(v))}`}</div>
        <div className="field"><label htmlFor="pw">وزن (کیلوگرم)</label>
          <input id="pw" type="number" min={0.2} max={120} step={0.1} value={v.weight_kg ?? ""} onChange={(e) => setV({ ...v, weight_kg: e.target.value ? +e.target.value : null })} />
          <div className="hint">با وزن، هزینه ماهانه تغذیه و مدت کافی بودن هر بسته تخمین زده می‌شود. برای سگ‌ها جثه هم از وزن به دست می‌آید.</div></div>
        <div className="field"><fieldset><legend>عقیم شده؟</legend><div className="seg">
          <label><input type="radio" name="st" checked={!!v.sterilised} onChange={() => setV({ ...v, sterilised: true })} />بله</label>
          <label><input type="radio" name="st" checked={!v.sterilised} onChange={() => setV({ ...v, sterilised: false })} />خیر</label></div></fieldset></div>
        <div className="field"><fieldset><legend>حساسیت غذایی گزارش‌شده</legend><div className="seg">
          {ALLERGENS.map(([k, l]) => <label key={k}><input type="checkbox" checked={!!v.allergies?.includes(k)}
            onChange={() => setV({ ...v, allergies: v.allergies?.includes(k) ? v.allergies.filter((x) => x !== k) : [...(v.allergies || []), k] })} />{l}</label>)}
        </div></fieldset><div className="hint">فقط برای فیلتر کردن محصولات استفاده می‌شود؛ برای رژیم درمانی با دامپزشک مشورت کن.</div></div>
        <div style={{ display: "flex", gap: 10 }}><button className="btn btn-primary" type="submit">{editing ? "ذخیره تغییرات" : "افزودن و دیدن پیشنهادها"}</button>
          {pets.length > 0 && <button className="btn btn-ghost" type="button" onClick={() => onDone()}>انصراف</button>}</div>
      </form>
    </>
  );
}

export default function PetPage() {
  const { pets, active, setActive, setPets } = usePets();
  const [mode, setMode] = useState<"view" | "new" | "edit">("view");
  const [recs, setRecs] = useState<any[] | null>(null);
  const [extra, setExtra] = useState<any[] | null>(null);
  const breeds = useBreeds();
  const shown = mode === "new" ? null : active;
  const m = mode === "view" && !pets.length ? "new" : mode;

  useEffect(() => {
    if (m !== "view" || !shown) return;
    setRecs(null);
    setExtra(null);
    api(`/api/v1/search?q=${encodeURIComponent(shown.species === "cat" ? "غذای خشک گربه" : "غذای خشک سگ")}${petQuery(shown)}`)
      .then((d) => setRecs(d.results.slice(0, 6))).catch(() => setRecs([]));
    // second row: litter for cats, treats for dogs — also ranked for this breed
    api(`/api/v1/search?q=${encodeURIComponent(shown.species === "cat" ? "خاک گربه" : "تشویقی سگ")}${petQuery(shown)}`)
      .then((d) => setExtra(d.results.slice(0, 3))).catch(() => setExtra([]));
  }, [m, shown?.id, shown?.weight_kg, shown?.birth_year, shown?.birth_month, shown?.sterilised, shown?.allergies?.join(), shown?.breed]);  // eslint-disable-line

  const card = m === "new" ? { species: "cat", id: "new" } as any : shown!;
  const br = breedOf(breeds, card);
  const SIZE_FA: Record<string, string> = { mini: "نژاد کوچک", medium: "نژاد متوسط", large: "نژاد بزرگ" };
  const size = card.species !== "dog" ? null : br?.size ? SIZE_FA[br.size]
    : card.weight_kg ? (card.weight_kg < 10 ? "نژاد کوچک" : card.weight_kg < 25 ? "نژاد متوسط" : "نژاد بزرگ") : null;
  const hint = m === "view" && shown ? stageHint(shown, br) : "";

  return (
    <>
      {pets.length > 0 && (
        <div className="pet-bar" role="tablist" aria-label="حیوان‌های من">
          {pets.map((p) => (
            <button key={p.id} className={`pet-chip ${m !== "new" && p.id === shown?.id ? "on" : ""}`} role="tab" aria-selected={p.id === shown?.id} onClick={() => { setActive(p.id); setMode("view"); }}>
              <Svg className="pa" html={petArt(p)} /><span><b>{p.name}</b><small>{breedOf(breeds, p)?.fa || SP[p.species]} · {ageText(ageMonths(p))}</small></span></button>
          ))}
          {pets.length < MAX_PETS && <button className={`pet-chip add ${m === "new" ? "on" : ""}`} onClick={() => setMode("new")}><span className="pa plus">＋</span><span><b>افزودن حیوان</b><small>تا {fa(MAX_PETS)} حیوان</small></span></button>}
        </div>
      )}
      <div className="pet-wrap">
        <div className="phone">
          <div className="sky"><div className="greet"><span>سلام 👋<b>{m === "new" ? "حیوان جدید" : `پروفایل ${card.name}`}</b></span><span className="bell"><Ui n="paw" s={18} /></span></div>
            <Svg className="art" html={petArt(card)} /></div>
          <div className="sheet"><div className="grab" />
            <h2>{card.name || (card.species === "dog" ? "هاپو" : "پیشی")}</h2>
            <div className="breed">{SP[card.species]}{br ? ` · ${br.fa}` : ""}{size ? ` · ${size}` : ""}{card.sterilised ? " · عقیم‌شده" : ""}</div>
            <div className="tiles2">
              <div className="tile2"><span className="ic" style={{ background: "#e8579b" }}><Ui n="clock" s={18} /></span><small>سن (امروز)</small><b>{ageText(ageMonths(card))}</b></div>
              <div className="tile2"><span className="ic" style={{ background: "#4f9ac2" }}><Ui n="star" s={18} /></span><small>تولد</small><b>{card.birth_year ? `${MONTHS[(card.birth_month || 1) - 1]} ${fa(card.birth_year)}` : "نامشخص"}</b></div>
              <div className="tile2"><span className="ic" style={{ background: "#f08a24" }}><Ui n="chart" s={18} /></span><small>وزن</small><b>{card.weight_kg ? `${fa(card.weight_kg)} کیلو` : "نامشخص"}</b></div>
              <div className="tile2"><span className="ic" style={{ background: "#2e9b62" }}><Ui n="shield" s={18} /></span><small>حساسیت</small><b>{card.allergies?.length ? card.allergies.map((a: string) => ALLERGENS.find((x) => x[0] === a)?.[1]).join("، ") : "ندارد"}</b></div>
            </div>
            <div className="health-chips">{m === "new" ? <span>پروفایل را کامل کن</span> : <>
              {stageOf(card, br) && <span>رده غذایی: {stageOf(card, br)}</span>}
              {(card.allergies || []).map((a: string) => <span key={a} className="warn">بدون {ALLERGENS.find((x) => x[0] === a)?.[1]}</span>)}</>}</div>
          </div>
        </div>
        <div>
          {m === "view" && shown ? (
            <>
              <div className="sec-h" style={{ marginTop: 6 }}>
                <div><h2>پیشنهادهای <b>مناسب {shown.name}</b></h2><div className="sub">بر اساس سنِ امروز، {br ? `نژاد ${br.fa}، ` : ""}جثه و حساسیت‌ها · با گذشت هر ماه خودکار به‌روز می‌شود</div></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMode("edit")}>ویرایش</button>
                  <button className="btn btn-bad btn-sm" onClick={() => {
                    if (!confirm(`پروفایل «${shown.name}» حذف شود؟`)) return;
                    const rest = pets.filter((p) => p.id !== shown.id);
                    setPets(rest); setActive(rest[0]?.id || null); toast("پروفایل حذف شد.");
                  }}>حذف</button>
                </div>
              </div>
              {hint && <div className="notice"><Ui n="clock" s={16} /> {hint}</div>}
              {br?.why && <div className="notice info"><Ui n="paw" s={16} /> نژاد {br.fa}: {br.why}. پیشنهادهای زیر همین را در نظر گرفته‌اند.</div>}
              {!shown.breed && <div className="notice info">نژاد {shown.name} را در «ویرایش» انتخاب کن تا غذا و {shown.species === "cat" ? "خاک" : "تشویقی"} مناسب همان نژاد پیشنهاد شود و عکس پروفایل هم شبیه‌تر شود.</div>}
              <div className="grid">{recs === null ? Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 330 }} />)
                : recs.map((r, i) => <ProductCard key={r.id} r={r} tag={i === 0 ? "بهترین برای او" : undefined} tagCls="sun" />)}</div>
              <div className="sec-h" style={{ marginTop: 22 }}><div><h2>{shown.species === "cat" ? "خاک" : "تشویقی"} <b>مناسب {shown.name}</b></h2>
                <div className="sub">{shown.species === "cat" ? "نوع خاک هم به نژاد و موی حیوان بستگی دارد" : "بر اساس جثه و حساسیت‌ها"}</div></div></div>
              <div className="grid">{extra === null ? Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 330 }} />)
                : extra.map((r) => <ProductCard key={r.id} r={r} />)}</div>
              <p className="hint">اطلاعات فقط روی همین دستگاه ذخیره می‌شود. به سرور فقط سن به ماه، وزن، نژاد و حساسیت‌ها فرستاده می‌شود؛ نام و تاریخ تولد هرگز ارسال نمی‌شوند. پت‌مچ تشخیص پزشکی نمی‌دهد.</p>
            </>
          ) : (
            <PetForm key={m + (shown?.id || "")} editing={m === "edit" ? shown : null} onDone={() => setMode("view")} />
          )}
        </div>
      </div>
    </>
  );
}

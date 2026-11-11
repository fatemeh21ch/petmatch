"use strict";

/* ================================================================ utils */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");
const nf = new Intl.NumberFormat("fa-IR");
const fa = (n) => (n == null ? "—" : nf.format(n));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Persian digits for display text that comes from the API
const fd = (s) => esc(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]).replace(/([۰-۹]),(?=[۰-۹])/g, "$1٬").replace(/([۰-۹])\.(?=[۰-۹])/g, "$1٫");
const toman = (n) => (n == null ? "—" : `${fa(n)} <small>تومان</small>`);
const ago = (h) => (h < 1 ? "کمتر از ۱ ساعت پیش" : h < 24 ? `${fa(Math.round(h))} ساعت پیش` : `${fa(Math.round(h / 24))} روز پیش`);
// "۱٫۳ میلیون" / "۴۵۰ هزار" — compact money for estimates
const shortToman = (n) => (n >= 1e6 ? `${fa(+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1))} میلیون` : `${fa(Math.round(n / 1000))} هزار`);
const weeksText = (w) => (w < 1.5 ? `${fa(Math.round(w * 7))} روز` : `${fa(+w.toFixed(w < 10 ? 1 : 0))} هفته`);
function feedLine(f) {
  if (!f) return "";
  return `<div class="feed" title="تخمینی، بر اساس وزن و سن حیوان و میانگین انرژی ${"غذای خشک/تر"}">
    ${ui("paw", 14)}<span>~${shortToman(f.monthly_cost)} <small>در ماه</small></span><span class="sep">·</span><span>هر بسته ~${weeksText(f.weeks_per_pack)}</span>
    ${f.freshness_warning ? `<span class="fresh" title="بسته بزرگ است؛ غذای خشک بعد از باز شدن معمولاً تا ۶ تا ۸ هفته بهترین کیفیت را دارد">!</span>` : ""}</div>`;
}
const unitLabel = (u) => (u === "ml" ? "لیتر" : "کیلو");
const SP = { cat: "گربه", dog: "سگ" };
const TYPE = { dry: "غذای خشک", wet: "غذای تر", litter: "خاک", treat: "تشویقی" };

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

const q2h = (q, sort) => `#/search?q=${encodeURIComponent(q)}${sort ? "&sort=" + sort : ""}`;
const go = (q, sort) => (location.hash = q2h(q, sort));

/* ================================================================ pet + favorites (device only) */
/* Pets are stored with their birth year/month in the Persian (Jalali) calendar, not a fixed age.
   Age is recomputed from today's date on every request, so suggestions change as the pet grows. */
const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const MAX_PETS = 6;
function jalaliToday() {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric", month: "numeric" }).formatToParts(new Date());
  return { y: +parts.find((p) => p.type === "year").value, m: +parts.find((p) => p.type === "month").value };
}
function ageMonths(p) {
  if (!p || !p.birth_year) return null;
  const t = jalaliToday();
  return Math.max(0, (t.y - p.birth_year) * 12 + (t.m - (p.birth_month || 1)));
}
function migratePets() {
  // one-time upgrade from the old single-pet format that stored a fixed age
  const old = store.get("pm_pet", null);
  if (old && !store.get("pm_pets", null)) {
    const t = jalaliToday();
    const pet = { ...old, id: Date.now().toString(36) };
    if (old.age_months != null) {
      const total = t.y * 12 + (t.m - 1) - old.age_months;
      pet.birth_year = Math.floor(total / 12);
      pet.birth_month = (total % 12) + 1;
    }
    delete pet.age_months;
    store.set("pm_pets", [pet]);
    store.set("pm_active", pet.id);
  }
  store.del("pm_pet");
}
const getPets = () => store.get("pm_pets", []);
const setPets = (list) => store.set("pm_pets", list);
function getPet() {
  const id = store.get("pm_active", null);
  const pets = getPets();
  if (id === "none") return null;
  return pets.find((p) => p.id === id) || pets[0] || null;
}
const setActive = (id) => store.set("pm_active", id);
function petParam() {
  const p = getPet();
  if (!p) return "";
  // only what ranking needs is sent — never the name or birth date itself
  const payload = { species: p.species, age_months: ageMonths(p), weight_kg: p.weight_kg ?? null, sterilised: !!p.sterilised, allergies: p.allergies || [] };
  return "&pet=" + encodeURIComponent(JSON.stringify(payload));
}
const favs = () => store.get("pm_favs", {});
function toggleFav(card) {
  const f = favs();
  // a saved estimate would go stale when the pet's age or weight changes, so favorites don't keep it
  if (f[card.id]) delete f[card.id]; else { const { feeding, ...rest } = card; f[card.id] = rest; }
  store.set("pm_favs", f);
  renderChrome();
  return !!f[card.id];
}

/* ================================================================ chrome */
// Dropdown contents come from /api/v1/nav (built from the catalog), so cat and dog menus share one
// structure — product type, age, body size or condition — and only list entries that have products.
const NAV = [
  { label: "گربه", menuKey: "cat" }, { label: "سگ", menuKey: "dog" }, { label: "برندها", menuKey: "brands" },
  { label: "بیشترین اختلاف قیمت", href: "#/#deals", hot: true },
  { label: "راهنمای خرید", href: "#/guide/unit-price" }, { label: "پشت صحنه داده", href: "#/admin" },
];
let navMenus = null;
function menuHTML(groups) {
  if (!groups) return '<div class="hint" style="padding:8px 12px">در حال بارگذاری…</div>';
  let n = 0;
  return groups.map((g) => `<div class="menu-group">${esc(g.title)}</div>` + g.items.map((it) =>
    `<a href="${q2h(it.q)}"><span class="mi" style="background:var(--t${(n++ % 8) + 1})">${icon(it.icon, 22)}</span>${esc(it.label)}<small>${fa(it.count)}</small></a>`).join("")).join("");
}
async function loadNav() {
  try {
    navMenus = await api("/api/v1/nav");
    $$("[data-menu]").forEach((m) => (m.innerHTML = menuHTML(navMenus[m.dataset.menu])));
  } catch { /* menus keep the loading hint; plain links still work */ }
}

function renderChrome() {
  $("#logoPaw").innerHTML = ui("paw", 24);
  $("#goBtn").innerHTML = ui("search", 20);
  const p = getPet();
  const pa = $("#petAct");
  pa.innerHTML = p ? `${ui("paw", 20)}<span class="lbl">${esc(p.name || "حیوان من")}</span>` : `${ui("user", 20)}<span class="lbl">پروفایل حیوان</span>`;
  pa.classList.toggle("pet-on", !!p);
  const n = Object.keys(favs()).length;
  $("#favAct").innerHTML = `${ui("heart", 22)}<span class="lbl">علاقه‌مندی</span>${n ? `<span class="count">${fa(n)}</span>` : ""}`;
  if (!$("#navrow").children.length) {
    $("#navrow").innerHTML = NAV.map((n) => n.menuKey
      ? `<div class="navitem"><button class="navlink" aria-haspopup="true" aria-expanded="false">${n.label} ${ui("chevD", 16)}</button>
          <div class="menu" data-menu="${n.menuKey}">${menuHTML(navMenus?.[n.menuKey])}</div></div>`
      : `<a class="navlink ${n.hot ? "hot" : ""}" href="${n.href}">${n.label}</a>`).join("");
    if (!navMenus) loadNav();
  }
  const h = location.hash || "#/";
  const tabs = [["#/", "home", "خانه"], ["#/favorites", "heart", "علاقه‌مندی"], ["#/search?q=", "search", "جست‌وجو", true], ["#/pet", "paw", "حیوان من"], ["#/admin", "chart", "داده"]];
  $("#tabbar").innerHTML = tabs.map(([href, ic, l, c]) =>
    `<a href="${href}" aria-label="${l}" class="${c ? "center" : ""} ${h === href || (href !== "#/" && !c && h.startsWith(href)) ? "on" : ""}">${ui(ic, 22)}</a>`).join("");
}

// Dropdowns use position:fixed so the horizontally scrollable nav row cannot clip them.
function openMenu(item) {
  closeMenus(item);
  const btn = item.querySelector(".navlink"), menu = item.querySelector(".menu");
  const r = btn.getBoundingClientRect();
  menu.style.top = `${r.bottom + 4}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  item.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
}
function closeMenus(except) {
  $$(".navitem.open").forEach((i) => {
    if (i === except) return;
    i.classList.remove("open");
    i.querySelector(".navlink").setAttribute("aria-expanded", "false");
  });
}
$("#navrow").addEventListener("click", (e) => {
  const btn = e.target.closest(".navitem > .navlink");
  if (!btn) return;
  const item = btn.parentElement;
  // with a mouse, hover already opened it — a click must not toggle it shut again
  if (item.classList.contains("open") && !matchMedia("(hover: hover)").matches) closeMenus(); else openMenu(item);
});
$("#navrow").addEventListener("mouseover", (e) => {
  const item = e.target.closest(".navitem");
  if (item && matchMedia("(hover: hover)").matches && !item.classList.contains("open")) openMenu(item);
});
$("#navrow").addEventListener("mouseleave", () => { if (matchMedia("(hover: hover)").matches) closeMenus(); });
$("#navrow").addEventListener("scroll", () => closeMenus(), { passive: true });
document.addEventListener("click", (e) => { if (!e.target.closest(".navitem")) closeMenus(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });

// Clicking a link to the page you're already on should still refresh it.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (a && a.getAttribute("href") === location.hash && !a.hasAttribute("data-buy")) { e.preventDefault(); closeMenus(); router(); }
});

$("#topSearch").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = [$("#topQ").value.trim(), $("#topCat").value].filter(Boolean).join(" ");
  if (q) go(q);
});

/* ================================================================ shared components */
function stars(r) {
  const full = Math.round(r);
  return `<span class="stars">${Array.from({ length: 5 }, (_, i) => `<span style="opacity:${i < full ? 1 : .25}">${ui("star", 13)}</span>`).join("")}</span>`;
}

function productCard(r, tag = "", tagCls = "") {
  const b = r.best;
  const isFav = !!favs()[r.id];
  const fit = (r.fit_notes || []).slice(0, 1).map(([t, ok]) => `<div class="fit ${ok ? "ok" : "no"}">${ok ? "✓" : "!"} ${fd(t)}</div>`).join("");
  return `<article class="pcard ${b ? "" : "out"}">
    ${tag ? `<span class="tag ${tagCls}">${tag}</span>` : ""}
    <button class="fav ${isFav ? "on" : ""}" data-fav="${r.id}" aria-label="${isFav ? "حذف از" : "افزودن به"} علاقه‌مندی" aria-pressed="${isFav}">${ui(isFav ? "heartFill" : "heart", 18)}</button>
    <a href="#/p/${r.id}" class="img" aria-hidden="true" tabindex="-1">${pkgSVG(r)}</a>
    <div class="rating">${b ? `${stars(b.seller_rating)}<span>${fa(b.seller_rating)}</span>` : ""}${r.value ? `<span class="value-pill" title="امتیاز ارزش خرید">ارزش ${fa(r.value)}</span>` : ""}</div>
    <h3><a href="#/p/${r.id}">${fd(r.name_fa)}</a></h3>
    <div class="en">${esc(r.name_en)}</div>
    ${fit}
    ${feedLine(r.feeding)}
    <div class="foot">
      <div class="price">${b ? `<span class="from">بهترین قیمت با ارسال</span>${toman(b.total)}` : '<span class="muted" style="font-size:13px">فعلاً ناموجود</span>'}</div>
      <span class="stores">${fa(r.available_count)} فروشگاه</span>
    </div>
  </article>`;
}

function bindFavs(list) {
  const byId = Object.fromEntries(list.map((r) => [r.id, r]));
  $$("[data-fav]").forEach((btn) => btn.addEventListener("click", (e) => {
    e.preventDefault();
    const card = byId[btn.dataset.fav] || favs()[btn.dataset.fav];
    if (!card) return;
    const on = toggleFav(card);
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on);
    btn.innerHTML = ui(on ? "heartFill" : "heart", 18);
    toast(on ? "به علاقه‌مندی‌ها اضافه شد" : "از علاقه‌مندی‌ها حذف شد");
  }));
}

function rail(id, title, sub, items, tagFn) {
  return `<section class="sec" id="${id}">
    <div class="sec-h"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
      <div class="arrows"><button data-rail="${id}" data-dir="1" aria-label="بعدی">${ui("chevR", 18)}</button><button data-rail="${id}" data-dir="-1" aria-label="قبلی">${ui("chevL", 18)}</button></div></div>
    <div class="rail" id="${id}-rail">${items.map((r) => productCard(r, ...(tagFn ? tagFn(r) : []))).join("")}</div>
  </section>`;
}
function bindRails() {
  $$("[data-rail]").forEach((b) => b.addEventListener("click", () => {
    const el = $(`#${b.dataset.rail}-rail`);
    el.scrollBy({ left: (b.dataset.dir === "1" ? 1 : -1) * el.clientWidth * 0.8, behavior: "smooth" });
  }));
}

function errorBox() {
  setTimeout(() => $("#retry")?.addEventListener("click", router), 0);
  return `<div class="empty"><div class="ill">${dogArt({ sweater: "#b8d7e9" })}</div><p>ارتباط با سرور برقرار نشد.</p><button class="btn btn-primary" id="retry">تلاش دوباره</button></div>`;
}

/* ================================================================ router */
const routes = [
  [/^#\/?(#deals)?$/, home],
  [/^#\/search\?(.*)$/, (m) => searchPage(new URLSearchParams(m[1]))],
  [/^#\/p\/([\w-]+)$/, (m) => productPage(m[1])],
  [/^#\/pet$/, () => petPage()],
  [/^#\/favorites$/, favoritesPage],
  [/^#\/guide\/([\w-]+)$/, (m) => guidePage(m[1])],
  [/^#\/admin$/, adminPage],
];
function router() {
  const h = location.hash || "#/";
  clearInterval(home._timer);
  closeMenus();
  renderChrome();
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { if (!h.includes("#deals")) window.scrollTo(0, 0); return fn(m); }
  }
  app.innerHTML = `<div class="empty"><div class="ill">${catArt()}</div><p>این صفحه پیدا نشد.</p><a class="btn btn-primary" href="#/">صفحه اصلی</a></div>`;
}
window.addEventListener("hashchange", router);

/* ================================================================ home */
const EXAMPLES = ["رويال كنين کیتن ۲ کیلو", "خاک گربه بدون عطر ارزون‌ترین", "غذای سگ توله زیر ۳ میلیون", "رویل کنن ایندور", "غذای خشک گربه بدون مرغ"];
const CATS = [
  ["dry", "غذای خشک گربه", "غذای خشک گربه"], ["dry", "غذای خشک سگ", "غذای خشک سگ"], ["wet", "غذای تر", "غذای تر گربه"],
  ["treat", "تشویقی گربه", "تشویقی گربه"], ["treat", "تشویقی سگ", "تشویقی سگ"], ["litter", "خاک گربه", "خاک گربه"],
  ["cat", "بچه‌گربه", "غذای بچه گربه"], ["dog", "توله‌سگ", "غذای توله سگ"],
];
const GUIDES = {
  "kitten-food": {
    kicker: "تغذیه", title: "غذای بچه‌گربه یا بالغ؟ کِی باید عوض کرد", bg: "var(--t4)", art: () => catArt({ color: "#f3f3f3", belly: "#fff" }),
    body: ["بچه‌گربه‌ها در ماه‌های اول رشد به انرژی و پروتئین بیشتری نسبت به گربه بالغ نیاز دارند؛ برای همین برندها فرمول جداگانه «کیتن» تولید می‌کنند.",
      "معمولاً حوالی یک‌سالگی (و در نژادهای درشت کمی دیرتر) سراغ فرمول بالغ می‌روند. تغییر غذا بهتر است تدریجی و طی یک تا دو هفته باشد.",
      "در پت‌مچ اگر سن حیوانت را در پروفایل وارد کنی، غذاهای مناسب رده سنی‌اش بالاتر نمایش داده می‌شوند و بقیه برچسب «برای رده سنی دیگری است» می‌گیرند. برای شرایط خاص سلامتی حتماً با دامپزشک مشورت کن."],
    q: "غذای بچه گربه",
  },
  "unit-price": {
    kicker: "خرید هوشمند", title: "چرا «قیمت هر کیلو» از قیمت بسته مهم‌تر است", bg: "var(--t2)", art: bowlArt,
    body: ["یک بسته ۴۰۰ گرمی همیشه ارزان‌تر از بسته ۲ کیلویی به نظر می‌رسد؛ ولی وقتی قیمت را بر وزن تقسیم کنیم، معمولاً بسته بزرگ‌تر به‌صرفه‌تر است.",
      "پت‌مچ برای هر پیشنهاد «قیمت نهایی» را با احتساب هزینه ارسال محاسبه می‌کند و بعد آن را بر وزن یا حجم تقسیم می‌کند. «امتیاز ارزش خرید» ترکیبی از قیمت هر کیلو، تناسب با حیوان تو، اعتبار فروشنده و فاصله قیمت از میانه بازار است.",
      "قیمت‌هایی که خیلی پایین‌تر از بازارند (مثلاً ۶۵٪ زیر میانه) پیشنهاد نمی‌شوند، چون معمولاً خطای داده یا قیمت طعمه‌اند، نه تخفیف واقعی."],
    q: "غذای خشک گربه",
  },
  litter: {
    kicker: "بهداشت", title: "خاک بنتونیت یا گیاهی؟ راهنمای انتخاب خاک گربه", bg: "var(--t5)", art: () => catArt({ color: "#9aa7ad", belly: "#dfe5e8" }),
    body: ["خاک‌های بنتونیتی گلوله‌ای می‌شوند و جمع‌کردنشان ساده است؛ معمولاً قیمت هر کیلوی پایین‌تری دارند.",
      "خاک‌های گیاهی سبک‌ترند و اغلب بر اساس لیتر فروخته می‌شوند. برای همین پت‌مچ قیمت آن‌ها را «هر لیتر» نشان می‌دهد و با خاک‌های کیلویی مستقیم مقایسه نمی‌کند.",
      "اگر گربه‌ات به بو حساس است، عبارت «بدون عطر» را در جست‌وجو بنویس."],
    q: "خاک گربه بدون عطر",
  },
};

async function home() {
  $("#topQ").value = "";
  app.innerHTML = `
  <section class="hero" aria-label="پیشنهادهای ویژه">
    <div class="hero-main">
      <div class="slide on" data-slide="0">
        <div><div class="pre">تا</div><div class="big" id="maxSave">— <small>٪</small></div>
          <div class="uline"></div><div class="sub">اختلاف قیمت برای یک محصول یکسان،<br>بین فروشگاه‌های مختلف</div>
          <a class="btn btn-dark cta" href="#/#deals" id="toDeals">مقایسه کن ${ui("chevL", 16)}</a></div>
        <div class="art">${bowlArt()}</div>
      </div>
      <div class="slide" data-slide="1">
        <div><div class="pre">برای</div><div class="big" style="font-size:clamp(34px,5vw,54px)">حیوان خودت</div>
          <div class="uline"></div><div class="sub">سن، جثه و حساسیت غذایی‌اش را بگو؛<br>بقیه‌اش با ما</div>
          <a class="btn btn-dark cta" href="#/pet">ساخت پروفایل ${ui("chevL", 16)}</a></div>
        <div class="art">${catArt({ color: "#f5f5f5", belly: "#fff" })}</div>
      </div>
      <div class="slide" data-slide="2">
        <div><div class="pre">هر طور راحتی</div><div class="big" style="font-size:clamp(34px,5vw,54px)">بنویس</div>
          <div class="uline"></div><div class="sub">«غذای توله زیر ۳ میلیون» یا حتی<br>«رویل کنن» با غلط تایپی</div>
          <a class="btn btn-dark cta" href="${q2h("غذای سگ توله زیر ۳ میلیون")}">امتحان کن ${ui("chevL", 16)}</a></div>
        <div class="art">${dogArt({ sweater: "#f4c430" })}</div>
      </div>
      <div class="dots">${[0, 1, 2].map((i) => `<button data-dot="${i}" class="${i ? "" : "on"}" aria-label="اسلاید ${fa(i + 1)}"></button>`).join("")}</div>
    </div>
    <div class="hero-side">
      <a class="promo teal" href="${q2h("غذای خشک گربه")}"><div><h3>دنبال وسایل<br>پیشی هستی؟</h3><span class="btn-outline-w">ببین ${ui("chevL", 14)}</span></div>
        <div class="art">${catArt({ glasses: true })}</div></a>
      <a class="promo blue" href="${q2h("غذای خشک سگ")}"><div><h3>دنبال وسایل<br>هاپو هستی؟</h3><span class="btn-outline-w">ببین ${ui("chevL", 14)}</span></div>
        <div class="art">${dogArt()}</div></a>
    </div>
  </section>

  <div class="smart"><span class="lbl">${ui("spark", 20)} جست‌وجوی هوشمند:</span>
    <div class="chips">${EXAMPLES.map((e) => `<a class="qchip" href="${q2h(e)}">${esc(e)}</a>`).join("")}</div></div>

  <section class="sec">
    <div class="sec-h"><div><h2>دسته‌های <b>محبوب</b></h2><div class="sub">تمرکز نسخه اول: خریدهای تکرارشونده</div></div></div>
    <div class="cats">${CATS.map(([ic, l, q], i) => `<a class="cat" href="${q2h(q)}"><div class="tile" style="background:var(--t${i + 1})">${icon(ic, 54)}</div><span class="nm">${l}</span></a>`).join("")}</div>
  </section>

  <div id="rails"><div class="sec"><div class="skeleton" style="height:340px"></div></div></div>

  <section class="sec banners">
    <a class="banner yellow" href="#/pet"><div><h3>غذای مناسبِ خودِ حیوانت</h3><p>پروفایل بساز تا رده سنی و حساسیت‌ها لحاظ شوند</p><span class="btn btn-dark btn-sm">ساخت پروفایل</span></div><div class="art">${catArt({ color: "#3b3b3b", belly: "#6b6b6b" })}</div></a>
    <a class="banner light" href="#/admin"><div><h3>به رتبه‌بندی ما شک داری؟</h3><p>ببین چطور ۱۰۵ آگهی نامرتب به ۲۸ محصول تبدیل شد</p><span class="btn btn-dark btn-sm">پشت صحنه داده</span></div><div class="art">${dogArt({ sweater: "#13566c", color: "#e2b57f" })}</div></a>
  </section>

  <div id="rails2"></div>

  <section class="sec"><div class="sec-h"><div><h2>برندهای <b>برتر</b></h2></div></div><div class="brands" id="brands"></div></section>

  <section class="sec">
    <div class="sec-h"><div><h2>راهنمای <b>خرید</b></h2></div></div>
    <div class="articles">${Object.entries(GUIDES).map(([id, g]) => `<a class="article" href="#/guide/${id}">
      <div class="cover" style="background:${g.bg}">${g.art()}</div>
      <div class="body"><span class="kicker">${g.kicker}</span><h3>${g.title}</h3><p>${esc(g.body[0].slice(0, 90))}…</p></div></a>`).join("")}</div>
  </section>

  <section class="sec trust">
    <div>${ui("truck", 26)}<span><b>قیمت نهایی</b>با احتساب هزینه ارسال</span></div>
    <div>${ui("clock", 26)}<span><b>تازگی قیمت</b>زمان آخرین بررسی کنار هر قیمت</span></div>
    <div>${ui("shield", 26)}<span><b>قیمت مشکوک؟</b>پیشنهاد نمی‌شود</span></div>
    <div>${ui("paw", 26)}<span><b>متناسب با حیوانت</b>سن، جثه، حساسیت</span></div>
  </section>`;

  let cur = 0;
  const show = (i) => {
    cur = i;
    $$(".slide").forEach((s) => s.classList.toggle("on", +s.dataset.slide === i));
    $$("[data-dot]").forEach((d) => d.classList.toggle("on", +d.dataset.dot === i));
  };
  $$("[data-dot]").forEach((d) => d.addEventListener("click", () => { show(+d.dataset.dot); clearInterval(home._timer); }));
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) home._timer = setInterval(() => show((cur + 1) % 3), 6000);
  $("#toDeals").addEventListener("click", (e) => { e.preventDefault(); $("#deals")?.scrollIntoView({ behavior: "smooth" }); });

  try {
    const d = await api("/api/v1/home");
    $("#maxSave").innerHTML = `${fa(d.max_saving)}<small>٪</small>`;
    $("#rails").innerHTML = rail("popular", "محصولات <b>پرطرفدار</b>", "موجود در بیشترین فروشگاه‌ها", d.popular, (r) => (r.trend < -1 ? ["ارزان‌تر شد", "sun"] : []));
    $("#rails2").innerHTML = rail("deals", "بیشترین <b>اختلاف قیمت</b> امروز", "جایی که مقایسه بیشترین صرفه‌جویی را دارد", d.deals,
      (r) => (r.saving_pct > 0 ? [`${fa(r.saving_pct)}٪ اختلاف`] : []));
    $("#brands").innerHTML = d.brands.map((b) => `<a class="brand" href="${q2h(b.fa)}"><span><b style="color:${(BRAND_COLORS[b.key] || ["#13566c"])[0]}">${esc(b.en)}</b><small>${esc(b.fa)} · ${fa(b.count)} محصول</small></span></a>`).join("");
    bindRails();
    bindFavs([...d.popular, ...d.deals]);
    if (location.hash.includes("#deals")) $("#deals").scrollIntoView();
  } catch {
    $("#rails").innerHTML = errorBox();
  }
}

/* ================================================================ search */
const SORTS = [["best", "بهترین ارزش خرید"], ["monthly", "کمترین هزینه ماهانه"], ["cheapest", "ارزان‌ترین قیمت نهایی"], ["unit_price", "قیمت هر کیلو"], ["rating", "معتبرترین فروشنده"]];

async function searchPage(params) {
  const q = params.get("q") || "";
  const sort = params.get("sort");
  $("#topQ").value = q;
  if (!q) {
    app.innerHTML = `<div class="sec"><h1 style="font-size:22px">دنبال چه می‌گردی؟</h1><div class="chips" style="margin-top:12px">${EXAMPLES.map((e) => `<a class="qchip" href="${q2h(e)}">${esc(e)}</a>`).join("")}</div></div>`;
    $("#topQ").focus();
    return;
  }
  app.innerHTML = `<div class="crumbs"><span class="skeleton" style="width:200px;height:18px;display:inline-block"></span></div>
    <div class="s-layout"><div class="skeleton" style="height:420px"></div><div><div class="skeleton" style="height:180px"></div>
    <div class="grid" style="margin-top:16px">${'<div class="skeleton" style="height:330px"></div>'.repeat(6)}</div></div></div>`;
  let d;
  try { d = await api(`/api/v1/search?q=${encodeURIComponent(q)}${sort ? "&sort=" + sort : ""}${petParam()}`); }
  catch { app.innerHTML = errorBox(); return; }

  const chips = d.chips.filter((c) => c.key !== "sort").map((c) =>
    `<span class="chip ${c.from_profile ? "profile" : ""}" title="${c.from_profile ? "از پروفایل حیوان شما" : "از متن جست‌وجو"}">${c.from_profile ? ui("paw", 14) : ""}${fd(c.label)}</span>`).join("");
  const top = d.results[0];
  const brands = [...new Map(d.results.map((r) => [r.brand, r.brand_fa])).entries()];
  const types = [...new Set(d.results.map((r) => r.type))];
  const prices = d.results.filter((r) => r.best).map((r) => r.best.total);
  const maxP = Math.max(0, ...prices);
  const minP = prices.length > 1 ? Math.floor(Math.min(...prices) / 10000) * 10000 : 0;
  const profileExcl = d.chips.filter((c) => c.key === "exclude" && c.from_profile);
  const outCount = d.results.filter((r) => !r.best).length;

  app.innerHTML = `
  <div class="crumbs"><a href="#/">پت‌مچ</a> ‹ <span>جست‌وجو</span></div>
  <h1 style="font-size:24px;font-weight:800">نتایج «${esc(q)}»</h1>
  <div class="understood"><span class="lbl">فهمیدیم دنبال این هستی:</span>${chips || '<span class="muted">—</span>'}
    ${d.ai_used ? `<span class="chip ai">${ui("spark", 14)} تفسیر با AI</span>` : ""}
    ${getPets().length ? `<label class="pet-switch">${ui("paw", 15)} پیشنهاد برای:
      <select id="petSel"><option value="none">بدون پروفایل</option>${getPets().map((p) => `<option value="${p.id}" ${getPet()?.id === p.id ? "selected" : ""}>${esc(p.name || SP[p.species])}</option>`).join("")}</select></label>` : ""}</div>
  ${d.not_understood ? `<div class="notice">منظورت از «${esc(d.intent.unknown.join(" ") || q)}» را متوجه نشدیم${d.total ? "؛ فقط محصولاتی را نشان می‌دهیم که نامشان خیلی شبیه این کلمه است." : "."} نام برند، نوع حیوان یا محصول (مثلاً «غذای گربه»، «خاک»، «تشویقی سگ») را امتحان کن.</div>` : ""}
  ${d.relaxed.length ? `<div class="notice">محصولی با همه شرایط پیدا نشد؛ شرط «${d.relaxed.map(esc).join("، ")}» را برداشتیم تا نزدیک‌ترین گزینه‌ها را ببینی.</div>` : ""}
  ${d.intent.sort === "monthly" && d.feeding_available ? `<div class="notice info">${ui("paw", 15)} هزینه ماهانه برای ${esc(getPet()?.name || "حیوانت")} تخمین زده شده: از وزن، سن و عقیم بودنش انرژی روزانه حساب می‌شود و با میانگین انرژی غذای خشک/تر به گرم در روز تبدیل می‌شود. عدد تقریبی است، نه از برچسب همین محصول.</div>` : ""}
  ${d.intent.sort === "monthly" && !d.feeding_available ? `<div class="notice">برای «کمترین هزینه ماهانه» وزن حیوان لازم است. <a href="#/pet">وزن را در پروفایل وارد کن</a>.</div>` : ""}
  ${d.pet_needs_weight && d.intent.sort !== "monthly" ? `<div class="notice info">${ui("paw", 15)} اگر وزن ${esc(getPet()?.name || "حیوانت")} را در <a href="#/pet">پروفایل</a> وارد کنی، هزینه ماهانه تغذیه هر غذا را هم می‌بینی.</div>` : ""}
  ${profileExcl.length ? `<div class="notice info">بر اساس پروفایل حیوانت، محصولات حاوی ${profileExcl.map((c) => esc(c.label.replace("بدون ", ""))).join("، ")} حذف شدند.</div>` : ""}
  <div class="s-layout">
    <aside class="filters" id="filters" aria-label="فیلترها">
      <h4>نوع محصول</h4>${types.map((t) => `<label><input type="checkbox" data-f="type" value="${t}" checked> ${TYPE[t] || "سایر"}<small>${fa(d.results.filter((r) => r.type === t).length)}</small></label>`).join("")}
      <h4>برند</h4>${brands.map(([k, l]) => `<label><input type="checkbox" data-f="brand" value="${k}" checked> ${esc(l)}<small>${fa(d.results.filter((r) => r.brand === k).length)}</small></label>`).join("")}
      <h4>حداکثر قیمت نهایی</h4><input type="range" id="fPrice" min="${minP}" max="${maxP}" step="10000" value="${maxP}" aria-label="حداکثر قیمت">
      <div class="range-ends"><span>${fa(minP)}</span><span>${fa(maxP)}</span></div><div class="hint" id="fPriceL">تا ${fa(maxP)} تومان</div>
      <h4>موجودی</h4><label class="${outCount ? "" : "muted"}"><input type="checkbox" id="fStock" ${outCount ? "" : "disabled"}> فقط موجودها<small>${outCount ? fa(outCount) + " ناموجود" : "همه موجودند"}</small></label>
      <button class="btn btn-ghost btn-sm btn-block" id="fReset" style="margin-top:14px" hidden>حذف فیلترها</button>
    </aside>
    <div>
      <div class="sortbar" role="group" aria-label="مرتب‌سازی"><span class="lbl">مرتب‌سازی:</span>
        ${SORTS.filter(([k]) => k !== "monthly" || d.feeding_available).map(([k, l]) => `<button class="sort" aria-pressed="${k === d.intent.sort}" data-s="${k}">${k === "monthly" ? ui("paw", 14) + " " : ""}${l}</button>`).join("")}
        <button class="sort mobile-filter" id="mf">${ui("filter", 16)} فیلترها</button></div>
      ${top && top.best ? pickBox(d, top) : ""}
      <div class="meta-line" id="metaLine"></div>
      <div class="grid" id="results"></div>
    </div>
  </div>`;

  const renderGrid = () => {
    const on = (f) => $$(`[data-f="${f}"]:checked`).map((x) => x.value);
    const ts = on("type"), bs = on("brand"), mx = +$("#fPrice").value, stock = $("#fStock").checked;
    const list = d.results.filter((r) => ts.includes(r.type) && bs.includes(r.brand) && (!r.best || r.best.total <= mx) && (!stock || r.best));
    const active = ts.length < types.length || bs.length < brands.length || mx < maxP || stock;
    $("#fReset").hidden = !active;
    // the "best pick" box only makes sense if that product survives the filters
    const pick = $(".pick");
    if (pick) pick.hidden = !list.some((r) => r.id === top.id);
    // live counts: what each option would show with the other filters applied
    const base = (skip) => d.results.filter((r) => (skip === "type" || ts.includes(r.type)) && (skip === "brand" || bs.includes(r.brand))
      && (!r.best || r.best.total <= mx) && (!stock || r.best));
    $$('[data-f="type"]').forEach((x) => (x.closest("label").querySelector("small").textContent = fa(base("type").filter((r) => r.type === x.value).length)));
    $$('[data-f="brand"]').forEach((x) => (x.closest("label").querySelector("small").textContent = fa(base("brand").filter((r) => r.brand === x.value).length)));
    $("#metaLine").textContent = active
      ? `${fa(list.length)} از ${fa(d.results.length)} محصول (فیلترشده) · قیمت‌ها با احتساب هزینه ارسال`
      : `${fa(list.length)} محصول · قیمت‌ها با احتساب هزینه ارسال`;
    $("#results").innerHTML = list.length
      ? list.map((r) => productCard(r, r.best && r.id === top?.id ? "انتخاب اول" : "")).join("")
      : `<div class="empty" style="grid-column:1/-1"><div class="ill">${catArt({ glasses: true })}</div><p>محصول موردنظر پیدا نشد. شاید بتوانی با نام برند یا وزن متفاوت جست‌وجو کنی.</p>
         <div class="chips" style="justify-content:center">${EXAMPLES.slice(0, 3).map((e) => `<a class="qchip" href="${q2h(e)}">${esc(e)}</a>`).join("")}</div></div>`;
    bindFavs(d.results);
  };
  renderGrid();
  $$("#filters input").forEach((i) => i.addEventListener("input", () => {
    $("#fPriceL").textContent = `تا ${fa(+$("#fPrice").value)} تومان`;
    renderGrid();
  }));
  $("#petSel")?.addEventListener("change", (e) => { setActive(e.target.value); renderChrome(); searchPage(params); });
  $("#fReset").addEventListener("click", () => {
    $$("[data-f]").forEach((x) => (x.checked = true));
    $("#fPrice").value = maxP;
    $("#fStock").checked = false;
    $("#fPriceL").textContent = `تا ${fa(maxP)} تومان`;
    renderGrid();
  });
  $$(".sort[data-s]").forEach((b) => b.addEventListener("click", () => go(q, b.dataset.s)));
  $("#mf").addEventListener("click", () => $("#filters").classList.toggle("open"));
  const pm = $(".pick-main");
  if (pm) {
    const open = () => (location.hash = `#/p/${top.id}`);
    pm.addEventListener("click", open);
    pm.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
  }
  if (top && top.best && d.ai_available) loadAiExplain(q, sort);
}

function pickBox(d, r) {
  const b = r.best;
  return `<section class="pick" aria-label="بهترین انتخاب">
    <div class="pick-main" role="link" tabindex="0">
      <div class="img">${pkgSVG(r, 112)}</div>
      <div><span class="pick-badge">${ui("star", 13)} بهترین انتخاب برای این جست‌وجو</span>
        <h3>${fd(r.name_fa)}</h3>
        <div class="price">${toman(b.total)}</div>
        <div class="hint" style="color:var(--brand-2)">از ${esc(b.seller)} · هر ${unitLabel(r.unit)} ${fa(b.unit_price)} تومان · ارزش خرید ${fa(r.value)}</div></div>
    </div>
    <div class="pick-why"><h4><span class="bar"></span>چرا این گزینه؟</h4>
      <ul>${(d.top_pick?.reasons || []).map((x) => `<li>${fd(x)}</li>`).join("")}</ul>
      <div id="aiBox">${d.ai_available ? '<div class="hint">در حال نوشتن توضیح…</div>' : ""}</div></div>
  </section>`;
}

async function loadAiExplain(q, sort) {
  try {
    const d = await api(`/api/v1/explain?q=${encodeURIComponent(q)}${sort ? "&sort=" + sort : ""}${petParam()}`);
    const box = $("#aiBox");
    if (box) box.innerHTML = d.text ? `<div class="ai-text"><span class="tag">${ui("spark", 13)} خلاصه AI (فقط بر اساس داده‌های بالا)</span>${fd(d.text)}</div>` : "";
  } catch { const box = $("#aiBox"); if (box) box.innerHTML = ""; }
}

/* ================================================================ product */
async function productPage(id) {
  app.innerHTML = `<div class="pp" style="margin-top:24px"><div class="skeleton" style="aspect-ratio:1"></div><div class="skeleton" style="height:420px"></div></div>`;
  let d;
  try { d = await api(`/api/v1/products/${id}?v=1${petParam()}`); }
  catch (e) {
    app.innerHTML = e.status === 404 ? `<div class="empty"><div class="ill">${catArt()}</div><p>این محصول پیدا نشد.</p><a class="btn btn-primary" href="#/">صفحه اصلی</a></div>` : errorBox();
    return;
  }
  const p = d.product;
  p.brand_en = d.brand_en;
  const best = d.offers.find((o) => o.listing_id === d.best_id);
  const cheapest = d.offers.find((o) => o.listing_id === d.cheapest_id);
  const live = d.offers.filter((o) => o.available && !o.anomaly);
  const spread = live.length > 1 ? Math.max(...live.map((o) => o.total)) - Math.min(...live.map((o) => o.total)) : 0;
  const avgR = d.offers.reduce((s, o) => s + o.seller_rating, 0) / d.offers.length;
  const cardData = { ...p, available_count: live.length, offers_count: d.offers.length, best: best || null, value: null };
  const isFav = !!favs()[p.id];
  const views = [pkgSVG(p, 300), p.type === "litter" ? catArt({ color: "#9aa7ad", belly: "#dfe5e8" }) : bowlArt(), p.species === "dog" ? dogArt() : catArt()];
  const desc = `${TYPE[p.type] || "محصول"} ${SP[p.species]} از برند ${p.brand_fa}${d.attributes.length ? `، ${d.attributes.join("، ")}` : ""}، در بسته‌بندی ${p.qty_label}. قیمت این محصول در ${d.offers.length} فروشگاه بررسی و مقایسه شده است.`;

  app.innerHTML = `
  <div class="crumbs"><a href="#/">پت‌مچ</a> ‹ <a href="${q2h(SP[p.species])}">${SP[p.species]}</a> ‹ <a href="${q2h(`${TYPE[p.type]} ${SP[p.species]}`)}">${TYPE[p.type]}</a> ‹ <a href="${q2h(p.brand_fa)}">${esc(p.brand_fa)}</a></div>
  <section class="pp">
    <div class="gallery">
      <div class="thumbs" aria-label="تصاویر">${views.map((v, i) => `<button class="${i ? "" : "on"}" data-view="${i}" aria-label="تصویر ${fa(i + 1)}">${v}</button>`).join("")}</div>
      <div class="stage" id="stage"><div id="stageArt" style="width:74%">${views[0]}</div><button class="fav ${isFav ? "on" : ""}" data-fav="${p.id}" aria-label="علاقه‌مندی">${ui(isFav ? "heartFill" : "heart", 20)}</button></div>
    </div>
    <div class="pp-info">
      <a class="brand-link" href="${q2h(p.brand_fa)}">${esc(p.brand_fa)}</a>
      <h1>${fd(p.name_fa)}</h1>
      <div class="en">${esc(p.name_en)} · ${esc(p.qty_label)}</div>
      <div class="rating" style="margin-top:8px;font-size:13px">${stars(avgR)}<span>${fa(+avgR.toFixed(1))} میانگین امتیاز فروشندگان</span><span>·</span><span>${fa(d.offers.length)} فروشگاه</span></div>
      <p class="desc">${fd(desc)}</p>
      <div class="tabs-line" role="tablist">
        <button role="tab" aria-selected="true" data-tab="spec">مشخصات</button>
        <button role="tab" aria-selected="false" data-tab="src">منبع داده</button>
      </div>
      <div id="tab-spec"><dl class="spec">
        <dt>حیوان</dt><dd>${SP[p.species]}</dd><dt>نوع</dt><dd>${TYPE[p.type] || "—"}</dd>
        <dt>وزن / حجم</dt><dd>${fd(p.qty_label)}</dd>
        ${d.attributes.length ? `<dt>ویژگی‌ها</dt><dd>${d.attributes.map(fd).join("، ")}</dd>` : ""}
      </dl></div>
      <div id="tab-src" hidden><p class="hint" style="margin:4px 0">${fa(d.offers.length)} آگهی با عنوان‌های متفاوت به‌عنوان یک محصول شناسایی شدند:</p>
        <ul class="prov">${d.offers.map((o) => `<li><span><b>${esc(o.seller)}:</b> «${esc(o.raw_title)}»</span><span class="pill">${o.match.decision === "new" ? "مرجع" : o.match.decision === "approved" ? "تأیید انسانی" : "شباهت " + fa(Math.round(o.match.score * 100)) + "٪"}</span></li>`).join("")}</ul></div>
      <div class="buybox">
        ${best ? `<div class="row"><div><div class="hint">بهترین پیشنهاد · ${esc(best.seller)}</div><div class="big">${toman(best.total)}</div></div>
          <a class="btn btn-primary" href="${esc(best.url)}" data-buy target="_blank" rel="nofollow noopener">خرید از ${esc(best.seller)} ${ui("chevL", 16)}</a></div>
          <div class="lines"><div>${ui("truck", 18)} ${best.shipping ? `ارسال ${fa(best.shipping)} تومان (در قیمت لحاظ شده)` : "ارسال رایگان"}</div>
            <div>${ui("clock", 18)} آخرین بررسی قیمت: ${ago(best.age_hours)}</div>
            <div>${ui("shield", 18)} ${best.seller_verified ? "فروشگاه تأییدشده" : "فروشگاه تأییدنشده"} · امتیاز ${fa(best.seller_rating)}</div></div>`
          : `<div class="big" style="font-size:20px">فعلاً در هیچ فروشگاهی موجود نیست</div>`}
        ${d.caveat ? `<div class="notice">${esc(d.caveat)}</div>` : ""}
        ${d.feeding ? feedBox(d.feeding) : d.pet_needs_weight ? `<div class="notice info" style="margin-top:12px">وزن ${esc(getPet()?.name || "حیوانت")} را در <a href="#/pet">پروفایل</a> وارد کن تا ببینی این بسته چند هفته کافی است و ماهی چقدر خرج دارد.</div>` : ""}
        <div class="statgrid"><div><small>اختلاف قیمت فروشگاه‌ها</small><b>${toman(spread)}</b></div>
          <div><small>قیمت هر ${unitLabel(p.unit)}</small><b>${best ? toman(best.unit_price) : "—"}</b></div>
          <div><small>کمترین ۹۰ روز</small><b>${d.history_stats ? toman(d.history_stats.min) : "—"}</b></div></div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-h"><div><h2>مقایسه <b>فروشگاه‌ها</b></h2><div class="sub">مرتب‌شده بر اساس قیمت نهایی (کالا + ارسال)</div></div></div>
    <div class="offers">${d.offers.map((o) => offerRow(o, d, p)).join("")}</div>
    ${best && cheapest && best.listing_id !== cheapest.listing_id ? `<p class="hint">چرا ارزان‌ترین را پیشنهاد اول نکردیم؟ ${esc(cheapest.seller)} فقط ${fa(best.total - cheapest.total)} تومان ارزان‌تر است، اما امتیاز فروشنده ${fa(cheapest.seller_rating)} و دقت اطلاعات قیمتش ${fa(Math.round(cheapest.seller_accuracy * 100))}٪ است.</p>` : ""}
  </section>

  <section class="sec panel">
    <div class="sec-h"><div><h2>روند <b>کمترین قیمت</b></h2><div class="sub">۹۰ روز گذشته · قیمت‌های مشکوک حذف شده‌اند</div></div></div>
    ${d.history.length ? chart(d.history) : '<p class="muted">داده تاریخی کافی نداریم.</p>'}
    ${d.history_stats ? `<div class="legend"><span>کمترین: <b>${fa(d.history_stats.min)}</b></span><span>بیشترین: <b>${fa(d.history_stats.max)}</b></span><span>امروز: <b>${fa(d.history_stats.now)}</b></span></div>` : ""}
  </section>`;

  $$("[data-view]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-view]").forEach((x) => x.classList.toggle("on", x === b));
    $("#stageArt").innerHTML = views[+b.dataset.view];
  }));
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b));
    $("#tab-spec").hidden = b.dataset.tab !== "spec";
    $("#tab-src").hidden = b.dataset.tab !== "src";
  }));
  bindFavs([cardData]);
  $$("[data-report]").forEach((b) => b.addEventListener("click", () => report(b.dataset.report)));
  $$("[data-buy]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); toast("لینک نمایشی است — در نسخه واقعی به صفحه فروشگاه هدایت می‌شوید."); }));
}

function feedBox(f) {
  const pet = getPet();
  return `<div class="feedbox">
    <div class="fb-h">${ui("paw", 18)} هزینه تغذیه برای ${esc(pet?.name || "حیوانت")} <span class="pill">تخمینی</span></div>
    <div class="fb-grid">
      <div><small>روزانه</small><b>~${fa(f.grams_per_day)} گرم</b></div>
      <div><small>این بسته کافی است برای</small><b>~${weeksText(f.weeks_per_pack)}</b></div>
      <div><small>هزینه ماهانه</small><b>~${shortToman(f.monthly_cost)}</b></div>
    </div>
    ${f.freshness_warning ? `<div class="fb-warn">بسته بزرگ است؛ غذای خشک بعد از باز شدن معمولاً تا ۶ تا ۸ هفته بهترین کیفیت را دارد. اگر ظرف دربسته ندارید، بسته کوچک‌تر را هم در نظر بگیرید.</div>` : ""}
    <details><summary>چطور حساب شد؟</summary>
      <p>انرژی پایه = ۷۰ × وزن<sup>۰٫۷۵</sup> = ${fa(f.rer)} کیلوکالری · ضریب «${esc(f.factor_label)}» = ${fa(f.factor)} ← ${fa(f.kcal_per_day)} کیلوکالری در روز.
      با میانگین ${fa(f.density)} کیلوکالری در هر گرم برای این نوع غذا ← ${fa(f.grams_per_day)} گرم در روز. هزینه = قیمت نهایی بهترین پیشنهاد ÷ روزهای مصرف × ۳۰.</p>
      <p>این عدد از برچسب همین محصول نیست؛ مقدار روی بسته و نظر دامپزشک مقدم است، به‌خصوص برای حیوانی که اضافه‌وزن یا شرایط خاص دارد.</p>
    </details>
  </div>`;
}

function offerRow(o, d, p) {
  const isBest = o.listing_id === d.best_id;
  const cls = [isBest ? "best" : "", o.anomaly ? "flagged" : "", !o.available ? "dim" : ""].join(" ");
  return `<div class="offer ${cls}">
    <div><div class="seller">${esc(o.seller)} ${o.seller_verified ? `<span class="pill good">${ui("shield", 12)} تأییدشده</span>` : '<span class="pill">تأییدنشده</span>'}${isBest ? '<span class="pill brand">پیشنهاد ما</span>' : ""}</div>
      <div class="rating" style="margin-top:4px">${stars(o.seller_rating)} <span>${fa(o.seller_rating)}</span> · <span class="${o.stale ? "fit no" : ""}">بررسی ${ago(o.age_hours)}</span></div></div>
    <div><span class="k">قیمت کالا</span><span class="v">${fa(o.price)}</span></div>
    <div><span class="k">ارسال</span><span class="v">${o.shipping ? fa(o.shipping) : "رایگان"}</span></div>
    <div><span class="k">قیمت نهایی</span><span class="total">${o.available ? fa(o.total) : '<span class="muted">ناموجود</span>'}</span><span class="k">هر ${unitLabel(p.unit)}: ${fa(o.unit_price)}${d.feeding_for_offers?.[o.listing_id] ? ` · ماهانه ~${shortToman(d.feeding_for_offers[o.listing_id])}` : ""}</span></div>
    <div class="actions">${o.available ? `<a class="btn ${isBest ? "btn-primary" : "btn-ghost"} btn-sm" href="${esc(o.url)}" data-buy rel="nofollow noopener" target="_blank">خرید از فروشگاه</a>` : ""}
      <button class="linkish" data-report="${o.listing_id}">گزارش قیمت اشتباه</button></div>
    ${o.anomaly ? `<div class="flag">⚠️ ${fd(o.anomaly)} — در پیشنهادها لحاظ نشد.</div>` : ""}
  </div>`;
}

async function report(listingId) {
  try {
    await api("/api/v1/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing_id: listingId, reason: "wrong_price" }) });
    toast("ممنون! گزارش ثبت شد و قیمت دوباره بررسی می‌شود.");
  } catch { toast("ثبت گزارش ناموفق بود. دوباره تلاش کن."); }
}

function chart(hist) {
  const W = 760, H = 220, pad = { l: 10, r: 70, t: 14, b: 26 };
  const ys = hist.map((h) => h[1]);
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  // time flows right-to-left like the text: 90 days ago on the right, today on the left
  const x = (i) => W - pad.l - (i / (hist.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const pts = hist.map((h, i) => `${x(i).toFixed(1)},${y(h[1]).toFixed(1)}`);
  const last = hist.length - 1;
  return `<svg class="chart" style="direction:ltr" viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار کمترین قیمت از ${fa(hist[0][1])} تا ${fa(hist[last][1])} تومان">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13566c" stop-opacity=".22"/><stop offset="1" stop-color="#13566c" stop-opacity="0"/></linearGradient></defs>
    ${[0, .5, 1].map((t) => `<line x1="${pad.r - 6}" x2="${W - pad.l}" y1="${y(min + t * span)}" y2="${y(min + t * span)}" stroke="#e6edf0" stroke-dasharray="3 5"/>
      <text x="4" y="${y(min + t * span) + 4}" font-size="12" fill="#84979e">${fa(+((min + t * span) / 1e6).toFixed(2))}م</text>`).join("")}
    <path d="M${x(0)},${H - pad.b} L${pts.join(" L")} L${x(last)},${H - pad.b} Z" fill="url(#cg)"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="#13566c" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="${x(last)}" cy="${y(hist[last][1])}" r="6" fill="#f4c542" stroke="#fff" stroke-width="2"/>
    <text x="${W - pad.l}" y="${H - 6}" font-size="12" fill="#84979e" text-anchor="end">۹۰ روز پیش</text>
    <text x="${x(last)}" y="${H - 6}" font-size="12" fill="#84979e" text-anchor="middle">امروز</text>
  </svg>`;
}

/* ================================================================ pet profiles (app-style card) */
const ALLERGENS = [["chicken", "مرغ"], ["salmon", "سالمون"], ["lamb", "بره"], ["tuna", "تن ماهی"], ["duck", "اردک"]];
const PET_COLORS = { cat: ["#f0a35e", "#9aa7ad", "#3b3b3b", "#f5f5f5"], dog: ["#c98a4b", "#e2b57f", "#7a4f2a", "#d9c3a0"] };
function petArt(p) {
  const i = (p.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  return p.species === "dog" ? dogArt({ sweater: ["#f4c430", "#13566c", "#e8579b", "#4f9ac2"][i], color: PET_COLORS.dog[i] })
    : catArt({ color: PET_COLORS.cat[i], belly: i === 2 ? "#6b6b6b" : "#fbe3c6" });
}
function ageText(m) {
  if (m == null) return "نامشخص";
  const y = Math.floor(m / 12), mm = m % 12;
  return [y ? `${fa(y)} سال` : "", mm ? `${fa(mm)} ماه` : ""].filter(Boolean).join(" و ") || "کمتر از ۱ ماه";
}
function stageOf(p) {
  const m = ageMonths(p);
  if (m == null) return null;
  if (m < 12) return p.species === "cat" ? "بچه‌گربه" : "توله‌سگ";
  return m >= 84 ? "مسن" : "بالغ";
}
function stageHint(p) {
  // tell the owner before the food recommendation changes
  const m = ageMonths(p), n = esc(p.name || (p.species === "cat" ? "گربه‌ات" : "سگت"));
  if (m == null) return "";
  if (m >= 10 && m < 12) return `${n} ${fa(m)} ماهه است؛ ${fa(12 - m)} ماه دیگر پیشنهادها خودکار به غذای «بالغ» تغییر می‌کند. تغییر غذا را تدریجی انجام بده.`;
  if (m >= 78 && m < 84) return `${n} به‌زودی ${fa(7)} ساله می‌شود و پیشنهادها غذاهای مناسب حیوانات مسن را هم در نظر می‌گیرند.`;
  return "";
}

function petPage(mode = "view", editId = null) {
  const pets = getPets();
  if (!pets.length && mode === "view") mode = "new";
  const active = getPet() || pets[0];
  const editing = mode === "edit" ? pets.find((p) => p.id === editId) : null;
  const shown = mode === "new" ? { species: "cat", allergies: [], id: "new" } : (editing || active);
  const sizeTxt = shown.species === "dog" && shown.weight_kg ? (shown.weight_kg < 10 ? "نژاد کوچک" : shown.weight_kg < 25 ? "نژاد متوسط" : "نژاد بزرگ") : null;
  const birth = shown.birth_year ? `${MONTHS[(shown.birth_month || 1) - 1]} ${fa(shown.birth_year)}` : "نامشخص";
  const hint = mode === "view" ? stageHint(shown) : "";

  app.innerHTML = `
  ${pets.length ? `<div class="pet-bar" role="tablist" aria-label="حیوان‌های من">
    ${pets.map((p) => `<button class="pet-chip ${mode !== "new" && p.id === shown.id ? "on" : ""}" data-pet="${p.id}" role="tab" aria-selected="${p.id === shown.id}">
      <span class="pa">${petArt(p)}</span><span><b>${esc(p.name || SP[p.species])}</b><small>${SP[p.species]} · ${ageText(ageMonths(p))}</small></span></button>`).join("")}
    ${pets.length < MAX_PETS ? `<button class="pet-chip add ${mode === "new" ? "on" : ""}" id="addPet"><span class="pa plus">＋</span><span><b>افزودن حیوان</b><small>تا ${fa(MAX_PETS)} حیوان</small></span></button>` : ""}
  </div>` : ""}
  <div class="pet-wrap">
    <div class="phone">
      <div class="sky"><div class="greet"><span>سلام 👋<b>${mode === "new" ? "حیوان جدید" : "پروفایل " + esc(shown.name || "حیوانت")}</b></span><span class="bell">${ui("paw", 18)}</span></div>
        <div class="art" id="phoneArt">${petArt(shown)}</div></div>
      <div class="sheet"><div class="grab"></div>
        <h2>${esc(shown.name || (shown.species === "dog" ? "هاپو" : "پیشی"))}</h2>
        <div class="breed">${SP[shown.species]}${sizeTxt ? " · " + sizeTxt : ""}${shown.sterilised ? " · عقیم‌شده" : ""}</div>
        <div class="tiles2">
          <div class="tile2"><span class="ic" style="background:#e8579b">${ui("clock", 18)}</span><small>سن (امروز)</small><b>${ageText(ageMonths(shown))}</b></div>
          <div class="tile2"><span class="ic" style="background:#4f9ac2">${ui("star", 18)}</span><small>تولد</small><b>${birth}</b></div>
          <div class="tile2"><span class="ic" style="background:#f08a24">${ui("chart", 18)}</span><small>وزن</small><b>${shown.weight_kg ? fa(shown.weight_kg) + " کیلو" : "نامشخص"}</b></div>
          <div class="tile2"><span class="ic" style="background:#2e9b62">${ui("shield", 18)}</span><small>حساسیت</small><b>${(shown.allergies || []).length ? shown.allergies.map((a) => ALLERGENS.find((x) => x[0] === a)?.[1]).join("، ") : "ندارد"}</b></div>
        </div>
        <div class="health-chips">${mode === "new" ? "<span>پروفایل را کامل کن</span>"
          : [stageOf(shown) && `<span>رده غذایی: ${stageOf(shown)}</span>`, ...(shown.allergies || []).map((a) => `<span class="warn">بدون ${ALLERGENS.find((x) => x[0] === a)?.[1]}</span>`)].filter(Boolean).join("")}</div>
      </div>
    </div>
    <div>${mode === "view" ? `
      <div class="sec-h" style="margin-top:6px"><div><h2>پیشنهادهای <b>مناسب ${esc(shown.name || "حیوانت")}</b></h2><div class="sub">بر اساس سنِ امروز، جثه و حساسیت‌ها · با گذشت هر ماه خودکار به‌روز می‌شود</div></div>
        <div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" id="editPet">ویرایش</button><button class="btn btn-bad btn-sm" id="delPet">حذف</button></div></div>
      ${hint ? `<div class="notice">${ui("clock", 16)} ${hint}</div>` : ""}
      <div class="grid" id="petRecs"><div class="skeleton" style="height:330px"></div><div class="skeleton" style="height:330px"></div><div class="skeleton" style="height:330px"></div></div>
      <p class="hint">اطلاعات فقط روی همین دستگاه ذخیره می‌شود. به سرور فقط سن به ماه، وزن و حساسیت‌ها فرستاده می‌شود؛ نام و تاریخ تولد هرگز ارسال نمی‌شوند. پت‌مچ تشخیص پزشکی نمی‌دهد.</p>`
      : petForm(mode === "new" ? null : editing)}</div>
  </div>`;

  $$("[data-pet]").forEach((b) => b.addEventListener("click", () => { setActive(b.dataset.pet); renderChrome(); petPage(); }));
  $("#addPet")?.addEventListener("click", () => petPage("new"));
  if (mode === "view") {
    $("#editPet").addEventListener("click", () => petPage("edit", shown.id));
    $("#delPet").addEventListener("click", () => {
      if (!confirm(`پروفایل «${shown.name || SP[shown.species]}» حذف شود؟`)) return;
      const rest = getPets().filter((p) => p.id !== shown.id);
      setPets(rest);
      setActive(rest[0]?.id || null);
      renderChrome();
      toast("پروفایل حذف شد.");
      petPage();
    });
    setActive(shown.id);
    api(`/api/v1/search?q=${encodeURIComponent(shown.species === "cat" ? "غذای خشک گربه" : "غذای خشک سگ")}${petParam()}`).then((d) => {
      $("#petRecs").innerHTML = d.results.slice(0, 6).map((r, i) => productCard(r, i === 0 ? "بهترین برای او" : "", i === 0 ? "sun" : "")).join("");
      bindFavs(d.results);
    }).catch(() => ($("#petRecs").innerHTML = errorBox()));
  } else bindPetForm(editing);
}

function petForm(p) {
  const t = jalaliToday();
  const v = p || { species: "cat", allergies: [] };
  const years = Array.from({ length: 26 }, (_, i) => t.y - i);
  return `<h1 style="font-size:24px;font-weight:800">${p ? "ویرایش " + esc(p.name || "پروفایل") : "افزودن حیوان"}</h1>
    <p class="muted" style="margin:4px 0 16px">ماه و سال تولد را ثبت کن تا سن هر ماه خودکار محاسبه شود و پیشنهادها با بزرگ شدنش عوض شوند. همه‌چیز فقط روی همین دستگاه ذخیره می‌شود.</p>
    <form class="form panel" id="petForm">
      <div class="field"><fieldset><legend>نوع حیوان</legend><div class="seg">
        <label><input type="radio" name="species" value="cat" ${v.species === "cat" ? "checked" : ""}>🐱 گربه</label>
        <label><input type="radio" name="species" value="dog" ${v.species === "dog" ? "checked" : ""}>🐶 سگ</label></div></fieldset></div>
      <div class="field"><label for="pn">نام</label><input id="pn" type="text" name="name" maxlength="20" value="${esc(v.name || "")}" placeholder="مثلاً پیشی" required></div>
      <div class="row2">
        <div class="field"><label for="bm">ماه تولد</label><select id="bm" name="bmonth"><option value="">نمی‌دانم</option>
          ${MONTHS.map((m, i) => `<option value="${i + 1}" ${v.birth_month === i + 1 ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        <div class="field"><label for="by">سال تولد (شمسی)</label><select id="by" name="byear"><option value="">نمی‌دانم</option>
          ${years.map((y) => `<option value="${y}" ${v.birth_year === y ? "selected" : ""}>${fa(y)}</option>`).join("")}</select></div>
      </div>
      <div class="hint" id="ageLive" style="margin-top:-6px"></div>
      <div class="field"><label for="pw">وزن (کیلوگرم)</label><input id="pw" type="number" name="weight" min="0.2" max="120" step="0.1" value="${v.weight_kg ?? ""}">
        <div class="hint">با وزن، هزینه ماهانه تغذیه و مدت کافی بودن هر بسته تخمین زده می‌شود. برای سگ‌ها جثه (نژاد کوچک، متوسط یا بزرگ) هم از وزن به دست می‌آید.</div></div>
      <div class="field"><fieldset><legend>عقیم شده؟</legend><div class="seg">
        <label><input type="radio" name="ster" value="1" ${v.sterilised ? "checked" : ""}>بله</label>
        <label><input type="radio" name="ster" value="0" ${!v.sterilised ? "checked" : ""}>خیر</label></div></fieldset></div>
      <div class="field"><fieldset><legend>حساسیت غذایی گزارش‌شده</legend><div class="seg">
        ${ALLERGENS.map(([k, l]) => `<label><input type="checkbox" name="allergy" value="${k}" ${v.allergies?.includes(k) ? "checked" : ""}>${l}</label>`).join("")}</div></fieldset>
        <div class="hint">این گزینه‌ها فقط برای فیلتر کردن محصولات استفاده می‌شوند؛ برای رژیم درمانی با دامپزشک مشورت کن.</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" type="submit">${p ? "ذخیره تغییرات" : "افزودن و دیدن پیشنهادها"}</button>
        ${getPets().length ? '<button class="btn btn-ghost" type="button" id="petCancel">انصراف</button>' : ""}</div>
    </form>`;
}

function bindPetForm(editing) {
  const t = jalaliToday();
  const live = () => {
    const y = +$("#by").value, m = +$("#bm").value || 1;
    const el = $("#ageLive");
    if (!y) { el.textContent = "بدون تاریخ تولد، رده سنی در پیشنهادها لحاظ نمی‌شود."; return; }
    if (y === t.y && m > t.m) { el.textContent = "این تاریخ هنوز نرسیده است."; return; }
    el.textContent = `سن امروز: ${ageText(ageMonths({ birth_year: y, birth_month: m }))}`;
  };
  $("#by").addEventListener("change", live);
  $("#bm").addEventListener("change", live);
  live();
  $("#petForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const y = +f.get("byear") || null, m = +f.get("bmonth") || null;
    if (y === t.y && (m || 1) > t.m) { toast("تاریخ تولد نمی‌تواند در آینده باشد."); return; }
    const data = {
      species: f.get("species"), name: (f.get("name") || "").trim().slice(0, 20),
      birth_year: y, birth_month: y ? (m || 1) : null,
      weight_kg: f.get("weight") ? +f.get("weight") : null, sterilised: f.get("ster") === "1", allergies: f.getAll("allergy"),
    };
    const pets = getPets();
    let id;
    if (editing) { id = editing.id; setPets(pets.map((p) => (p.id === id ? { ...p, ...data } : p))); }
    else {
      if (pets.length >= MAX_PETS) { toast(`حداکثر ${fa(MAX_PETS)} حیوان`); return; }
      id = Date.now().toString(36);
      setPets([...pets, { id, ...data }]);
    }
    setActive(id);
    toast(editing ? "تغییرات ذخیره شد." : "حیوان اضافه شد.");
    renderChrome();
    petPage();
  });
  $("#petCancel")?.addEventListener("click", () => petPage());
  $$('#petForm input[name="species"]').forEach((r) => r.addEventListener("change", () => {
    $("#phoneArt").innerHTML = petArt({ species: r.value, id: editing?.id || "new" });
  }));
}

/* ================================================================ favorites */
function favoritesPage() {
  const list = Object.values(favs());
  app.innerHTML = `<div class="sec"><div class="sec-h"><div><h2>علاقه‌<b>مندی‌ها</b></h2><div class="sub">روی همین دستگاه ذخیره شده‌اند</div></div></div>
    ${list.length ? `<div class="grid">${list.map((r) => productCard(r)).join("")}</div>`
      : `<div class="empty"><div class="ill">${catArt({ color: "#f5f5f5", belly: "#fff" })}</div><p>هنوز چیزی ذخیره نکرده‌ای. روی ♡ هر محصول بزن تا اینجا بیاید.</p><a class="btn btn-primary" href="#/">گشتن در محصولات</a></div>`}</div>`;
  bindFavs(list);
  $$("[data-fav]").forEach((b) => b.addEventListener("click", () => setTimeout(favoritesPage, 300)));
}

/* ================================================================ guide */
function guidePage(id) {
  const g = GUIDES[id];
  if (!g) { app.innerHTML = `<div class="empty"><p>این راهنما پیدا نشد.</p></div>`; return; }
  app.innerHTML = `<article class="art-page">
    <div class="crumbs"><a href="#/">پت‌مچ</a> ‹ <span>راهنمای خرید</span></div>
    <div class="cover" style="background:${g.bg}">${g.art()}</div>
    <span class="kicker pill" style="margin-top:16px">${g.kicker}</span>
    <h1>${g.title}</h1>${g.body.map((t) => `<p>${esc(t)}</p>`).join("")}
    <a class="btn btn-primary" href="${q2h(g.q)}">دیدن محصولات مرتبط ${ui("chevL", 16)}</a></article>`;
}

/* ================================================================ admin */
async function adminPage() {
  const token = sessionStorage.getItem("pm_admin");
  if (!token) return adminLogin();
  app.innerHTML = `<div class="skeleton" style="height:140px;margin-top:24px"></div>`;
  let d;
  try { d = await api("/api/v1/admin/pipeline", { headers: { "X-Admin-Token": token } }); }
  catch (e) {
    if (e.status === 401) { sessionStorage.removeItem("pm_admin"); return adminLogin("توکن نادرست است."); }
    app.innerHTML = errorBox(); return;
  }
  const s = d.stats, ev = s.evaluation;
  const L = { brand: "برند", species: "حیوان", type: "نوع", amount: "وزن/حجم", stage: "رده سنی" };
  app.innerHTML = `
  <div class="sec">
    <div class="sec-h"><div><h2>پنل <b>داده و تطبیق محصول</b></h2>
      <div class="sub">فیدهای خام ← اعتبارسنجی ← یکسان‌سازی ← استخراج ویژگی ← تطبیق ← کاتالوگ · ادغام خودکار از ${fa(d.thresholds.auto)}، بررسی انسانی از ${fa(d.thresholds.review)}</div></div>
      <button class="btn btn-ghost btn-sm" id="resetBtn">بازنشانی تصمیم‌ها</button></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${fa(s.raw)}</div><div class="k">آگهی خام از ${fa(d.sellers.length)} فروشگاه</div></div>
      <div class="kpi"><div class="v">${fa(s.products)}</div><div class="k">محصول یکتا</div></div>
      <div class="kpi"><div class="v">${fa(s.auto)}</div><div class="k">ادغام خودکار</div></div>
      <div class="kpi"><div class="v">${fa(s.review)}</div><div class="k">منتظر بررسی انسانی</div></div>
      <div class="kpi"><div class="v">${fa(s.blocked)}</div><div class="k">ادغام اشتباهِ جلوگیری‌شده</div></div>
      ${ev ? `<div class="kpi"><div class="v">${fa(Math.round(ev.precision * 1000) / 10)}٪</div><div class="k">Precision تطبیق</div></div>
      <div class="kpi"><div class="v">${fa(Math.round(ev.recall * 1000) / 10)}٪</div><div class="k">Recall تطبیق</div></div>` : ""}
    </div>
    <p class="hint">Precision و Recall روی جفت آگهی‌ها و در برابر برچسب‌های مرجع محاسبه شده‌اند (آگهی‌های منتظر بررسی لحاظ نشده‌اند). False Positive خطرناک‌تر است؛ هر جا اطلاعات حیاتی ناقص باشد، سیستم به‌جای حدس زدن از انسان می‌پرسد.<br>
      درصد پرشدن ویژگی‌ها پس از یکسان‌سازی: ${Object.entries(s.fill_rate).map(([k, v]) => `${L[k]} ${fa(v)}٪`).join(" · ")}</p>
  </div>
  <section class="sec"><div class="sec-h"><div><h2>صف <b>بررسی تطبیق</b></h2><div class="sub">هر تصمیم شما کاتالوگ را فوراً بازسازی می‌کند</div></div></div>
    ${d.review.length ? `<div style="display:grid;gap:12px">${d.review.map(reviewCard).join("")}</div>` : '<div class="panel muted">صف خالی است. 🎉</div>'}</section>
  <section class="sec"><div class="sec-h"><div><h2>ادغام‌هایی که <b>جلویشان گرفته شد</b></h2><div class="sub">عنوان‌های شبیه، ولی محصول متفاوت</div></div></div>
    <div class="table-wrap"><table><thead><tr><th>آگهی</th><th>شبیه به</th><th>دلیل عدم ادغام</th></tr></thead><tbody>
      ${d.blocked.map((b) => `<tr><td>${esc(b.title)}</td><td>${esc(b.vs)}</td><td>${b.why.map(esc).join("، ")}</td></tr>`).join("")}</tbody></table></div></section>
  <section class="sec"><div class="sec-h"><div><h2>نمونه <b>یکسان‌سازی داده خام</b></h2><div class="sub">هر فروشگاه فرمت خودش را دارد</div></div></div>
    <div class="table-wrap"><table><thead><tr><th>فروشگاه</th><th>عنوان خام</th><th>قیمت خام</th><th>متن یکسان‌شده</th><th>ویژگی‌ها</th><th>تصمیم</th></tr></thead><tbody>
      ${d.samples.map((x) => `<tr><td>${esc(x.seller)}</td><td>${esc(x.raw)}${x.extra ? `<br><small class="muted">${esc(x.extra)}</small>` : ""}</td>
        <td>${esc(x.raw_price)}<br><small class="muted">← ${fa(x.price)} تومان</small></td><td><code>${esc(x.normalized)}</code></td>
        <td>${Object.entries(x.attrs).filter(([, v]) => v).map(([k, v]) => `<code>${k}=${esc(v)}${x.inferred.includes(k) ? "*" : ""}</code>`).join(" ")}</td>
        <td>${{ auto: "ادغام خودکار", new: "محصول جدید", review: "بررسی", approved: "تأیید انسانی" }[x.decision]}</td></tr>`).join("")}</tbody></table></div>
    <p class="hint">* استنتاج‌شده (مثلاً نوع «غذای خشک» از وزن بالای ۳۰۰ گرم بدون نشانه غذای تر).</p></section>
  <section class="sec"><div class="sec-h"><div><h2>فروشگاه‌ها و <b>فیدها</b></h2></div></div>
    <div class="table-wrap"><table><thead><tr><th>فروشگاه</th><th>فرمت فید</th><th>امتیاز</th><th>دقت تاریخی قیمت</th><th>ارسال</th></tr></thead><tbody>
      ${d.sellers.map((x) => `<tr><td>${esc(x.name)} ${x.verified ? "✓" : ""}</td><td><code>${esc(x.format)}</code></td><td>${fa(x.rating)}</td><td>${fa(Math.round(x.accuracy * 100))}٪</td>
        <td>${x.shipping.flat ? fa(x.shipping.flat) + " تومان" : "رایگان"}${x.shipping.free_over ? ` · رایگان بالای ${fa(x.shipping.free_over)}` : ""}</td></tr>`).join("")}</tbody></table></div>
    ${d.reports.length ? `<p class="hint">گزارش‌های اخیر کاربران: ${d.reports.map((r) => esc(r.listing_id)).join("، ")}</p>` : ""}</section>`;
  $$("[data-decide]").forEach((b) => b.addEventListener("click", () => decide(b.dataset.lid, b.dataset.decide, b.dataset.pid)));
  $("#resetBtn").addEventListener("click", async () => {
    await api("/api/v1/admin/reset", { method: "POST", headers: { "X-Admin-Token": token } });
    toast("تصمیم‌ها بازنشانی شد."); adminPage();
  });
}

function reviewCard(r) {
  const known = Object.entries(r.attrs).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `<code>${k}=${esc(Array.isArray(v) ? v.join("+") : v)}</code>`).join(" ");
  return `<div class="review">
    <div class="rating"><span class="pill">${esc(r.seller)}</span><span class="pill">${fa(r.price)} تومان</span><span class="value-pill">شباهت ${fa(Math.round(r.score * 100))}٪</span></div>
    <div class="raw-title">«${esc(r.title)}»</div><div>${known}</div>
    <ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="cands">${r.candidates.map((c) => `<div class="cand"><div><b>${fd(c.name)}</b><small>${fa(c.offers)} آگهی · مثل: ${c.titles.map(esc).join(" | ")}</small></div>
      <button class="btn btn-good btn-sm" data-decide="approve" data-lid="${r.listing_id}" data-pid="${c.pid}">همین محصول است</button></div>`).join("")}</div>
    <div><button class="btn btn-bad btn-sm" data-decide="reject" data-lid="${r.listing_id}">هیچ‌کدام، محصول جداگانه است</button></div></div>`;
}

async function decide(lid, action, pid) {
  const token = sessionStorage.getItem("pm_admin");
  try {
    await api("/api/v1/admin/decisions", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": token },
      body: JSON.stringify({ listing_id: lid, action, product_id: pid || null }) });
    toast(action === "approve" ? "ادغام شد؛ کاتالوگ به‌روز شد." : "به‌عنوان محصول جداگانه ثبت شد.");
    adminPage();
  } catch { toast("ثبت تصمیم ناموفق بود."); }
}

function adminLogin(err = "") {
  app.innerHTML = `<div class="sec" style="max-width:440px;margin-inline:auto">
    <div class="ill" style="width:150px;margin:0 auto">${dogArt({ sweater: "#13566c", color: "#e2b57f" })}</div>
    <h1 style="font-size:22px;font-weight:800;text-align:center;margin-top:10px">ورود مدیر</h1>
    <p class="muted" style="text-align:center">دسترسی این بخش در سمت سرور کنترل می‌شود، نه با مخفی کردن دکمه.</p>
    <form class="form panel" id="adm"><div class="field"><label for="tk">توکن مدیر</label><input id="tk" type="text" autocomplete="off" required>
      ${err ? `<div class="hint" style="color:var(--bad)">${esc(err)}</div>` : ""}</div>
      <button class="btn btn-primary btn-block" type="submit">ورود</button></form></div>`;
  $("#adm").addEventListener("submit", (e) => { e.preventDefault(); sessionStorage.setItem("pm_admin", $("#tk").value.trim()); adminPage(); });
  $("#tk").focus();
}

/* ================================================================ boot */
migratePets();
router();

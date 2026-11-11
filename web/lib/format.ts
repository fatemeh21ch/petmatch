// Number / text formatting for a Persian RTL UI.
const nf = new Intl.NumberFormat("fa-IR");
export const fa = (n: number | null | undefined) => (n == null ? "—" : nf.format(n));
/** Persian digits + Persian thousands/decimal separators for text coming from the API. */
export const fd = (s: string | number | null | undefined) =>
  String(s ?? "")
    .replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d])
    .replace(/([۰-۹]),(?=[۰-۹])/g, "$1٬")
    .replace(/([۰-۹])\.(?=[۰-۹])/g, "$1٫");
export const ago = (h: number) =>
  h < 1 ? "کمتر از ۱ ساعت پیش" : h < 24 ? `${fa(Math.round(h))} ساعت پیش` : `${fa(Math.round(h / 24))} روز پیش`;
export const unitLabel = (u: string) => (u === "ml" ? "لیتر" : "کیلو");
export const shortToman = (n: number) =>
  n >= 1e6 ? `${fa(+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1))} میلیون` : `${fa(Math.round(n / 1000))} هزار`;
export const weeksText = (w: number) => (w < 1.5 ? `${fa(Math.round(w * 7))} روز` : `${fa(+w.toFixed(w < 10 ? 1 : 0))} هفته`);
export const SP: Record<string, string> = { cat: "گربه", dog: "سگ" };
export const TYPE: Record<string, string> = { dry: "غذای خشک", wet: "غذای تر", litter: "خاک", treat: "تشویقی" };
export const q2h = (q: string, sort?: string | null) => `/search?q=${encodeURIComponent(q)}${sort ? "&sort=" + sort : ""}`;
export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", day: "numeric" }).format(new Date(iso));

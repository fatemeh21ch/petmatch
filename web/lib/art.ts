/* Hand-drawn SVG art (ported from the first vanilla version). Every string interpolated from data goes
   through svgEsc, so these are safe to render with dangerouslySetInnerHTML. */
/* Hand-drawn SVG art: product packages, pets for banners, category line icons.
   No stock photos or brand logos — every package is generated from catalog data. */

export const BRAND_COLORS: Record<string, any> = {
  royal_canin: ["#c62f3b", "#9e1f2a"], reflex: ["#2f6fb5", "#1f4f86"], josera: ["#3f8b4e", "#2c6638"],
  brit: ["#6a4aa5", "#4e3480"], farmina: ["#e0892b", "#b86a18"], monge: ["#1f8f8a", "#166b67"],
  ever_clean: ["#3b8fd0", "#2a6ea4"], cats_best: ["#7f9b3a", "#5f7a26"], pars_litter: ["#8a6f55", "#6a523c"],
  dreamies: ["#7b3fa0", "#5a2a7a"], catit: ["#ef6f6c", "#cf4f4c"], pedigree: ["#d8a31c", "#b5850e"],
  gimcat: ["#e5543d", "#bf3c28"],
  whiskas: ["#7b2d8e", "#5b1f6a"], proplan: ["#1d3f7a", "#122a55"], hills: ["#1f6fb2", "#165287"],
};
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const svgEsc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ESC[c]);

export function petBadge(species: string, x: number, y: number, s = 1, color = "#fff") {
  // tiny cat/dog face used on package labels
  if (species === "dog") {
    return `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}">
      <ellipse cx="0" cy="2" rx="9" ry="8"/><ellipse cx="-9" cy="0" rx="4" ry="7" transform="rotate(20 -9 0)"/>
      <ellipse cx="9" cy="0" rx="4" ry="7" transform="rotate(-20 9 0)"/></g>`;
  }
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}">
    <path d="M-9 -2 L-8 -12 L-2 -6 L2 -6 L8 -12 L9 -2 A9 8 0 1 1 -9 -2 Z"/></g>`;
}

export function pkgSVG(p: any, size = 200) {
  const [c1, c2] = BRAND_COLORS[p.brand] || ["#5b7c8a", "#3e5c69"];
  const name = svgEsc(p.brand_en || "");
  const qty = svgEsc((p.qty_label || "").replace(/کیلوگرم/, "kg").replace(/گرم/, "g").replace(/لیتر/, "L"));
  // deterministic id: the same markup must come out on the server and in the browser (hydration)
  const id = "g" + [p.brand, p.type, p.qty_label, size].join("-").replace(/[^a-z0-9-]/gi, "");
  const defs = `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
  const label = (y: number, w = 84) => `<rect x="${100 - w / 2}" y="${y}" width="${w}" height="34" rx="8" fill="#fff" opacity=".95"/>
     <text x="100" y="${y + 15}" text-anchor="middle" font-size="12" font-weight="800" fill="${c2}" font-family="Arial, sans-serif">${name}</text>
     <text x="100" y="${y + 28}" text-anchor="middle" font-size="9.5" fill="#5a6a70" font-family="Arial, sans-serif">${qty}</text>`;
  let body = "";
  if (p.type === "dry") {
    body = `<ellipse cx="100" cy="182" rx="60" ry="7" fill="#000" opacity=".08"/>
      <path d="M52 34 L148 34 L160 172 Q100 184 40 172 Z" fill="url(#${id})"/>
      <rect x="50" y="26" width="100" height="14" rx="3" fill="${c2}"/>
      <path d="M58 30 h84" stroke="#fff" stroke-opacity=".35" stroke-dasharray="3 4"/>
      <path d="M70 44 L66 166" stroke="#fff" stroke-opacity=".18" stroke-width="10"/>
      ${petBadge(p.species, 100, 70, 1.5)}
      ${label(96)}
      <circle cx="74" cy="150" r="5" fill="#8a5a2b"/><circle cx="88" cy="155" r="5" fill="#a26a35"/><circle cx="81" cy="146" r="4" fill="#7a4d22"/>`;
  } else if (p.type === "wet") {
    body = `<ellipse cx="100" cy="170" rx="50" ry="8" fill="#000" opacity=".08"/>
      <rect x="54" y="70" width="92" height="96" rx="10" fill="url(#${id})"/>
      <ellipse cx="100" cy="70" rx="46" ry="10" fill="#d9dee1"/><ellipse cx="100" cy="70" rx="38" ry="7" fill="#bfc7cb"/>
      <rect x="78" y="66" width="22" height="6" rx="3" fill="#9aa5aa"/>
      ${petBadge(p.species, 100, 90, 1.1)}
      ${label(108, 80)}
      <rect x="54" y="150" width="92" height="6" fill="#000" opacity=".1"/>`;
  } else if (p.type === "litter") {
    body = `<ellipse cx="100" cy="180" rx="58" ry="7" fill="#000" opacity=".08"/>
      <path d="M66 48 Q100 10 134 48" fill="none" stroke="${c2}" stroke-width="7" stroke-linecap="round"/>
      <path d="M48 50 L152 50 L142 174 Q100 182 58 174 Z" fill="url(#${id})"/>
      <rect x="44" y="44" width="112" height="14" rx="5" fill="${c2}"/>
      ${petBadge("cat", 100, 80, 1.4)}
      ${label(104)}
      <path d="M62 160 q10 -8 20 0 t20 0 t20 0 t18 0" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2"/>`;
  } else {
    body = `<ellipse cx="100" cy="176" rx="48" ry="7" fill="#000" opacity=".08"/>
      <path d="M58 46 L142 46 L148 168 Q100 176 52 168 Z" fill="url(#${id})"/>
      <rect x="56" y="40" width="88" height="12" rx="4" fill="${c2}"/>
      <rect x="56" y="54" width="88" height="3" fill="#fff" opacity=".35"/>
      <g transform="translate(100 78)" fill="#fff"><rect x="-18" y="-4" width="36" height="8" rx="4"/>
        <circle cx="-19" cy="-5" r="5.5"/><circle cx="-19" cy="5" r="5.5"/><circle cx="19" cy="-5" r="5.5"/><circle cx="19" cy="5" r="5.5"/></g>
      ${label(102, 78)}`;
  }
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" style="direction:ltr" aria-hidden="true">${defs}${body}</svg>`;
}

/* ---------- banner pets ---------- */
export function catArt({ glasses = false, color = "#f0a35e", belly = "#fbe3c6" } = {}) {
  return `<svg viewBox="0 0 220 220" aria-hidden="true" style="direction:ltr">
    <ellipse cx="110" cy="206" rx="70" ry="9" fill="#000" opacity=".12"/>
    <path d="M150 190 C200 190 205 140 178 128" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"/>
    <ellipse cx="110" cy="160" rx="52" ry="46" fill="${color}"/>
    <ellipse cx="110" cy="170" rx="28" ry="30" fill="${belly}"/>
    <path d="M60 80 L66 30 L98 62 Z" fill="${color}"/><path d="M160 80 L154 30 L122 62 Z" fill="${color}"/>
    <path d="M70 70 L72 44 L90 62 Z" fill="#f7c3b0"/><path d="M150 70 L148 44 L130 62 Z" fill="${color === "#fff" ? "#f7c3b0" : "#f7c3b0"}"/>
    <ellipse cx="110" cy="92" rx="54" ry="46" fill="${color}"/>
    <path d="M86 58 q4 10 0 18 M110 54 q4 12 0 22 M134 58 q4 10 0 18" stroke="#c97a3a" stroke-width="5" stroke-linecap="round" fill="none" opacity=".5"/>
    <ellipse cx="110" cy="112" rx="26" ry="18" fill="${belly}"/>
    ${glasses
      ? `<g><rect x="70" y="80" width="32" height="20" rx="9" fill="#1b2a30"/><rect x="118" y="80" width="32" height="20" rx="9" fill="#1b2a30"/>
         <path d="M102 88 h16" stroke="#1b2a30" stroke-width="4"/><path d="M76 84 l8 -2" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/></g>`
      : `<ellipse cx="88" cy="90" rx="7" ry="9" fill="#24343a"/><ellipse cx="132" cy="90" rx="7" ry="9" fill="#24343a"/>
         <circle cx="90" cy="87" r="2.5" fill="#fff"/><circle cx="134" cy="87" r="2.5" fill="#fff"/>`}
    <path d="M104 108 h12 l-6 7 z" fill="#e57d7d"/>
    <path d="M110 115 q-6 8 -13 4 M110 115 q6 8 13 4" stroke="#24343a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M78 112 h-26 M78 118 l-24 6 M142 112 h26 M142 118 l24 6" stroke="#24343a" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    <path d="M84 196 v-14 M136 196 v-14" stroke="${belly}" stroke-width="16" stroke-linecap="round"/>
  </svg>`;
}

export function dogArt({ sweater = "#f4c430", color = "#c98a4b" } = {}) {
  return `<svg viewBox="0 0 220 220" aria-hidden="true" style="direction:ltr">
    <ellipse cx="110" cy="208" rx="72" ry="9" fill="#000" opacity=".12"/>
    <path d="M58 150 Q60 120 110 118 Q160 120 162 150 L166 200 L54 200 Z" fill="${sweater}"/>
    <path d="M62 150 Q110 168 158 150" stroke="#fff" stroke-opacity=".5" stroke-width="5" fill="none"/>
    <path d="M70 176 h80 M68 190 h84" stroke="#000" stroke-opacity=".08" stroke-width="5"/>
    <ellipse cx="110" cy="84" rx="50" ry="48" fill="${color}"/>
    <path d="M64 60 C34 60 30 120 50 132 C64 140 72 110 72 84 Z" fill="#7a4f2a"/>
    <path d="M156 60 C186 60 190 120 170 132 C156 140 148 110 148 84 Z" fill="#7a4f2a"/>
    <ellipse cx="110" cy="108" rx="30" ry="22" fill="#f1d3b0"/>
    <ellipse cx="90" cy="80" rx="7" ry="8" fill="#24343a"/><ellipse cx="130" cy="80" rx="7" ry="8" fill="#24343a"/>
    <circle cx="92" cy="77" r="2.5" fill="#fff"/><circle cx="132" cy="77" r="2.5" fill="#fff"/>
    <ellipse cx="110" cy="98" rx="11" ry="8" fill="#24343a"/>
    <path d="M110 106 v8 q-8 8 -16 2 M110 114 q8 8 16 2" stroke="#24343a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M104 118 q6 14 12 0 z" fill="#e8737a"/>
  </svg>`;
}

export function bowlArt() {
  return `<svg viewBox="0 0 220 160" aria-hidden="true" style="direction:ltr">
    <ellipse cx="110" cy="146" rx="90" ry="10" fill="#000" opacity=".12"/>
    <path d="M20 78 L200 78 Q190 140 110 142 Q30 140 20 78 Z" fill="#1d6f8c"/>
    <path d="M20 78 L200 78 Q196 92 190 100 L30 100 Q24 92 20 78 Z" fill="#000" opacity=".08"/>
    <ellipse cx="110" cy="78" rx="90" ry="16" fill="#2a87a8"/>
    ${Array.from({ length: 38 }, (_, i) => {
      const a = (i * 137.5) % 360, r = 6 + (i * 2.1) % 70, x = 110 + Math.cos(a) * r, y = 72 + Math.sin(a) * r * 0.18 - (i % 5) * 2;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${5 + (i % 3)}" fill="${["#8a5a2b", "#a66b33", "#74461f"][i % 3]}"/>`;
    }).join("")}
  </svg>`;
}

/* ---------- line icons for categories (stroke = currentColor) ---------- */
export const ICONS: Record<string, any> = {
  dry: `<path d="M16 10h32l4 44c-12 4-28 4-40 0z"/><path d="M15 10h34v6H15z"/><path d="M27 32c0-3 2-5 5-5s5 2 5 5-2 6-5 6-5-3-5-6zM24 28l2-4M40 28l-2-4"/>`,
  wet: `<ellipse cx="32" cy="18" rx="16" ry="5"/><path d="M16 18v26c0 3 7 6 16 6s16-3 16-6V18"/><path d="M16 30c4 2 28 2 32 0"/><path d="M26 15h10"/>`,
  treat: `<path d="M18 26a5 5 0 1 1 6-6l16 16a5 5 0 1 1 6 6 5 5 0 1 1-6 6 5 5 0 1 1-6-6L18 26a5 5 0 1 1-6-6"/>`,
  litter: `<path d="M8 30h48l-5 20H13z"/><path d="M8 30l6-10h36l6 10"/><path d="M22 40h20"/>`,
  toy: `<circle cx="30" cy="34" r="16"/><path d="M16 28c8 4 20 4 28 0M18 42c8-4 18-4 26 0M30 18c-4 8-4 24 0 32"/><path d="M44 22c4-6 10-6 12-2"/>`,
  bowl: `<path d="M8 32h48c-2 12-12 18-24 18S10 44 8 32z"/><path d="M22 28c0-4 4-8 10-8s10 4 10 8"/>`,
  dog: `<path d="M20 22c-6-2-10 6-8 14 1 4 5 4 7 0M44 22c6-2 10 6 8 14-1 4-5 4-7 0"/><path d="M20 22c3-6 21-6 24 0 3 6 2 18-4 24-4 4-12 4-16 0-6-6-7-18-4-24z"/><circle cx="27" cy="31" r="1.5"/><circle cx="37" cy="31" r="1.5"/><path d="M30 39h4l-2 2z"/>`,
  cat: `<path d="M14 18l6 10M50 18l-6 10M14 18c-2 10-2 18 4 26 6 7 22 7 28 0 6-8 6-16 4-26l-8 8c-6-3-14-3-20 0z"/><circle cx="26" cy="34" r="1.5"/><circle cx="38" cy="34" r="1.5"/><path d="M30 40h4l-2 2zM22 40h-8M42 40h8"/>`,
};
export function icon(name: string, size = 48) {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

/* ---------- UI glyphs ---------- */
export const UI: Record<string, any> = {
  search: '<path d="M10.5 4a6.5 6.5 0 1 0 4 11.6l4.4 4.4 1.4-1.4-4.4-4.4A6.5 6.5 0 0 0 10.5 4zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z" fill="currentColor"/>',
  heart: '<path d="M12 20s-7-4.4-9-9.2C1.6 7.4 3.8 4 7.2 4c2 0 3.4 1 4.8 2.7C13.4 5 14.8 4 16.8 4c3.4 0 5.6 3.4 4.2 6.8C19 15.6 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  heartFill: '<path d="M12 20s-7-4.4-9-9.2C1.6 7.4 3.8 4 7.2 4c2 0 3.4 1 4.8 2.7C13.4 5 14.8 4 16.8 4c3.4 0 5.6 3.4 4.2 6.8C19 15.6 12 20 12 20z" fill="currentColor"/>',
  user: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  paw: '<g fill="currentColor"><ellipse cx="7" cy="9" rx="2" ry="2.6"/><ellipse cx="17" cy="9" rx="2" ry="2.6"/><ellipse cx="10.3" cy="5.5" rx="2" ry="2.6"/><ellipse cx="13.7" cy="5.5" rx="2" ry="2.6"/><path d="M12 11c-3 0-6 4-6 6.5 0 1.6 1.4 2.5 3 2 1.2-.4 2-.8 3-.8s1.8.4 3 .8c1.6.5 3-.4 3-2C18 15 15 11 12 11z"/></g>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  chevL: '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chevR: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chevD: '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6" cy="17.5" r="1.8" fill="currentColor"/><circle cx="17" cy="17.5" r="1.8" fill="currentColor"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8L3.6 9.6l5.8-.8z" fill="currentColor"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
};
export const ui = (n: string, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${UI[n]}</svg>`;

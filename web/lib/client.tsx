"use client";
// Client-side state: auth (server session cookie), pets and favorites (device-only localStorage).
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";

/* ------------------------------------------------------------------ localStorage store */
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; val: any }>();

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* private mode */ }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.val ?? fallback;   // stable reference for useSyncExternalStore
  let val: any = fallback;
  try { val = raw ? JSON.parse(raw) : fallback; } catch { val = fallback; }
  cache.set(key, { raw, val });
  return val;
}
export function write(key: string, val: unknown) {
  try {
    if (val === null || val === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}
export function useLocal<T>(key: string, fallback: T): T {
  return useSyncExternalStore(subscribe, () => read(key, fallback), () => fallback);
}

/* ------------------------------------------------------------------ pets (Jalali birth date, age recomputed every time) */
export type Pet = {
  id: string; name: string; species: "cat" | "dog"; birth_year: number | null; birth_month: number | null;
  weight_kg: number | null; sterilised: boolean; allergies: string[]; breed?: string | null;
};
export const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export const MAX_PETS = 6;
const EMPTY: any[] = [];

export function jalaliToday() {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric", month: "numeric" }).formatToParts(new Date());
  return { y: +parts.find((p) => p.type === "year")!.value, m: +parts.find((p) => p.type === "month")!.value };
}
export function ageMonths(p: Partial<Pet> | null | undefined) {
  if (!p || !p.birth_year) return null;
  const t = jalaliToday();
  return Math.max(0, (t.y - p.birth_year) * 12 + (t.m - (p.birth_month || 1)));
}
export function usePets() {
  const pets = useLocal<Pet[]>("pm_pets", EMPTY);
  const activeId = useLocal<string | null>("pm_active", null);
  const active = activeId === "none" ? null : pets.find((p) => p.id === activeId) || pets[0] || null;
  return { pets, active, setActive: (id: string | null) => write("pm_active", id), setPets: (l: Pet[]) => write("pm_pets", l) };
}
/** Only what ranking needs leaves the device (species, age in months, weight, allergies, breed): never the name or the birth date. */
export function petQuery(p: Pet | null) {
  if (!p) return "";
  const payload = { species: p.species, age_months: ageMonths(p), weight_kg: p.weight_kg ?? null, sterilised: !!p.sterilised,
    allergies: p.allergies || [], breed: p.breed || null };
  return "&pet=" + encodeURIComponent(JSON.stringify(payload));
}

/* ------------------------------------------------------------------ favorites */
export function useFavs() {
  const favs = useLocal<Record<string, any>>("pm_favs", {} as Record<string, any>);
  const toggle = (card: any) => {
    const next = { ...favs };
    if (next[card.id]) delete next[card.id];
    else { const { feeding, ...rest } = card; next[card.id] = rest; }   // estimates go stale; don't keep them
    write("pm_favs", next);
    return !!next[card.id];
  };
  return { favs, toggle };
}

/* ------------------------------------------------------------------ compare (device only, up to 4 products) */
export const MAX_COMPARE = 4;
export function useCompare() {
  const ids = useLocal<string[]>("pm_compare", EMPTY);
  const has = (id: string) => ids.includes(id);
  /** Returns the new state, or "full" when the list already has MAX_COMPARE products. */
  const toggle = (id: string): boolean | "full" => {
    const now = read<string[]>("pm_compare", EMPTY);   // current list, not the one from the last render
    if (now.includes(id)) { write("pm_compare", now.filter((x) => x !== id)); return false; }
    if (now.length >= MAX_COMPARE) return "full";
    write("pm_compare", [...now, id]);
    return true;
  };
  return { ids, has, toggle, clear: () => write("pm_compare", []), set: (l: string[]) => write("pm_compare", l.slice(0, MAX_COMPARE)) };
}

/* ------------------------------------------------------------------ toast */
let toastFn: (m: string) => void = () => {};
export const toast = (m: string) => toastFn(m);
export function Toaster() {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  useEffect(() => {
    let t: any;
    toastFn = (m) => { setMsg(m); setShow(true); clearTimeout(t); t = setTimeout(() => setShow(false), 2600); };
  }, []);
  return <div id="toast" className={show ? "show" : ""} role="status" aria-live="polite">{msg}</div>;
}

/* ------------------------------------------------------------------ auth */
export type User = { phone: string; name: string; role: "buyer" | "seller" | "admin"; role_fa: string; seller_id: string | null; status?: string; store_name?: string };
type AuthCtx = { user: User | null; ready: boolean; refresh: () => Promise<void>; logout: () => Promise<void> };
const Ctx = createContext<AuthCtx>({ user: null, ready: false, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    let u: User | null = null;
    try { u = (await api<{ user: User | null }>("/api/v1/auth/me")).user; } catch { u = null; }
    if (u) write(LOGGED_OUT, null);   // any real login re-enables demo auto-entry
    setUser(u);
    setReady(true);
  }, []);
  const logout = useCallback(async () => {
    write(LOGGED_OUT, true);   // first, so a panel Guard still on screen doesn't sign straight back in
    try { await api("/api/v1/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setUser(null);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ user, ready, refresh, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
/** Set by an explicit logout: panels stop auto-signing in with a demo account until the next login. */
export const LOGGED_OUT = "pm_logged_out";
export const loggedOut = () => read<boolean>(LOGGED_OUT, false);

export const homeFor = (role?: string) => (role === "admin" ? "/admin" : role === "seller" ? "/seller" : "/");

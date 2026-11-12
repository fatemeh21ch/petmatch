"""Phone + OTP login with three roles (buyer, seller, admin).

Demo mode: there is no SMS gateway, so the OTP is returned in the API response
(`demo_code`) and the frontend autofills it, clearly labelled as a demo. Everything
else behaves like production: codes expire, attempts and resends are rate-limited,
codes are compared in constant time, sessions live in an httpOnly cookie and
access is checked on the server for every protected endpoint.
"""
import json
import os
import re
import secrets
import threading
import time
from datetime import datetime, timezone

from fastapi import Cookie, Header, HTTPException

from .pipeline import DATA

USERS_FILE = DATA / "users.json"
DEMO_MODE = os.environ.get("PETMATCH_DEMO_OTP", "1") == "1"
OTP_TTL = 120            # seconds a code stays valid
OTP_MAX_ATTEMPTS = 5     # wrong guesses before the code is burned
RESEND_GAP = 30          # seconds between two codes for the same phone
MAX_CODES_PER_HOUR = 6
SESSION_TTL = 7 * 24 * 3600
COOKIE = "pm_session"

ROLES = ("buyer", "seller", "admin")
ROLE_FA = {"buyer": "خریدار", "seller": "فروشنده", "admin": "مدیر سامانه"}

# Fixed demo accounts so the login page can offer one-click autofill for each role.
DEMO_ACCOUNTS = [
    {"phone": "09120000001", "name": "مریم رضایی", "role": "buyer", "seller_id": None},
    {"phone": "09120000002", "name": "علی محمدی (پت‌کده)", "role": "seller", "seller_id": "petkade"},
    {"phone": "09120000005", "name": "سارا احمدی (پنجه طلا)", "role": "seller", "seller_id": "panjetala"},
    {"phone": "09120000003", "name": "مدیر پت‌مچ", "role": "admin", "seller_id": None},
]

_lock = threading.Lock()
_otps: dict[str, dict] = {}       # phone -> {code, exp, attempts, purpose, signup}
_sends: dict[str, list] = {}      # phone -> [timestamps]
_sessions: dict[str, dict] = {}   # token -> {phone, exp}


def normalize_phone(raw: str) -> str:
    p = (raw or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
    p = re.sub(r"[\s\-()]", "", p)
    if p.startswith("+98"):
        p = "0" + p[3:]
    elif p.startswith("0098"):
        p = "0" + p[4:]
    elif p.startswith("98") and len(p) == 12:
        p = "0" + p[2:]
    if not re.fullmatch(r"09\d{9}", p):
        raise HTTPException(422, "شماره موبایل معتبر نیست (مثلاً ۰۹۱۲۱۲۳۴۵۶۷)")
    return p


# ---------------------------------------------------------------- users
def _load_users() -> dict:
    users = {u["phone"]: {**u, "created_at": "2026-01-01T00:00:00+00:00", "demo": True} for u in DEMO_ACCOUNTS}
    if USERS_FILE.exists():
        for u in json.loads(USERS_FILE.read_text("utf-8")):
            users[u["phone"]] = u
    return users


def _save_user(u: dict):
    with _lock:
        stored = json.loads(USERS_FILE.read_text("utf-8")) if USERS_FILE.exists() else []
        stored = [x for x in stored if x["phone"] != u["phone"]] + [u]
        USERS_FILE.write_text(json.dumps(stored, ensure_ascii=False, indent=1), "utf-8")


def get_user(phone: str) -> dict | None:
    return _load_users().get(phone)


def all_users() -> list:
    return list(_load_users().values())


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("phone", "name", "role", "seller_id", "store_name", "website", "shipping", "status", "reject_reason")} \
        | {"role_fa": ROLE_FA[u["role"]]}


# ---------------------------------------------------------------- OTP
def request_otp(phone: str, purpose: str, signup: dict | None = None) -> dict:
    now = time.time()
    with _lock:
        sent = [t for t in _sends.get(phone, []) if now - t < 3600]
        if sent and now - sent[-1] < RESEND_GAP:
            raise HTTPException(429, f"برای ارسال دوباره {int(RESEND_GAP - (now - sent[-1]))} ثانیه صبر کنید")
        if len(sent) >= MAX_CODES_PER_HOUR:
            raise HTTPException(429, "تعداد درخواست کد زیاد است؛ یک ساعت دیگر تلاش کنید")
        code = f"{secrets.randbelow(100000):05d}"
        _otps[phone] = {"code": code, "exp": now + OTP_TTL, "attempts": 0, "purpose": purpose, "signup": signup}
        _sends[phone] = sent + [now]
    out = {"sent": True, "expires_in": OTP_TTL, "resend_in": RESEND_GAP, "masked": phone[:4] + "•••" + phone[-4:]}
    if DEMO_MODE:
        out["demo_code"] = code   # no SMS gateway in the demo; never returned in production
    return out


def verify_otp(phone: str, code: str) -> dict:
    code = (code or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")).strip()
    with _lock:
        entry = _otps.get(phone)
        if not entry or time.time() > entry["exp"]:
            _otps.pop(phone, None)
            raise HTTPException(400, "کد منقضی شده؛ دوباره درخواست کنید")
        entry["attempts"] += 1
        if entry["attempts"] > OTP_MAX_ATTEMPTS:
            _otps.pop(phone, None)
            raise HTTPException(429, "تلاش‌های ناموفق زیاد بود؛ کد جدید بگیرید")
        if not secrets.compare_digest(entry["code"], code):
            left = OTP_MAX_ATTEMPTS - entry["attempts"]
            raise HTTPException(400, f"کد اشتباه است ({left} تلاش باقی مانده)")
        _otps.pop(phone, None)
    if entry["purpose"] == "signup":
        s = entry["signup"]
        user = {"phone": phone, "name": s["name"], "role": s["role"], "seller_id": None,
                "store_name": s.get("store_name"), "website": s.get("website"), "shipping": s.get("shipping"),
                "status": "pending" if s["role"] == "seller" else "active",
                "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        _save_user(user)
    return _new_session(phone)


def _new_session(phone: str) -> dict:
    token = secrets.token_urlsafe(32)
    with _lock:
        _sessions[token] = {"phone": phone, "exp": time.time() + SESSION_TTL}
    return {"token": token, "user": public_user(get_user(phone))}


def demo_login(phone: str) -> dict:
    """Demo mode only: open a session for one of the fixed demo accounts without an OTP, so the
    seller and admin panels can be explored with one click. Real or self-registered accounts
    always need the code, and with PETMATCH_DEMO_OTP=0 this endpoint does not exist."""
    if not DEMO_MODE:
        raise HTTPException(404, "not found")
    if phone not in {u["phone"] for u in DEMO_ACCOUNTS}:
        raise HTTPException(403, "فقط حساب‌های نمایشی بدون کد وارد می‌شوند")
    return _new_session(phone)


def logout(token: str | None):
    if token:
        with _lock:
            _sessions.pop(token, None)


# ---------------------------------------------------------------- FastAPI dependencies
def current_user(pm_session: str | None = Cookie(None)) -> dict | None:
    if not pm_session:
        return None
    s = _sessions.get(pm_session)
    if not s or time.time() > s["exp"]:
        return None
    return get_user(s["phone"])


def require_role(*roles):
    """Server-side access control: hiding a button is not security."""
    def dep(pm_session: str | None = Cookie(None), x_admin_token: str = Header("")):
        # service token for scripts/tests (admin only)
        if "admin" in roles and x_admin_token and secrets.compare_digest(
                x_admin_token, os.environ.get("PETMATCH_ADMIN_TOKEN", "petmatch-admin")):
            return {"phone": "service", "name": "service", "role": "admin", "seller_id": None}
        user = current_user(pm_session)
        if not user:
            raise HTTPException(401, "ابتدا وارد شوید")
        if user["role"] not in roles:
            raise HTTPException(403, "دسترسی به این بخش ندارید")
        return user
    return dep

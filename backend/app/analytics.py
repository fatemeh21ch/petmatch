"""Traffic and search analytics.

Seed history (30 synthetic days from seed/generate.py) + real events recorded while
the app runs (product views, outbound clicks through /go, searches). Events are
appended to small JSON files so they survive restarts in the demo; in production
this is an events table / analytics pipeline.
"""
import json
import threading
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from .pipeline import DATA

EVENTS = DATA / "events.json"
SEARCH_LOG = DATA / "search_log.json"
_lock = threading.Lock()


def _read(path, default):
    return json.loads(path.read_text("utf-8")) if path.exists() else default


def _seed_traffic():
    return _read(DATA / "traffic_history.json", {})


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def record(kind: str, listing_id: str):
    """kind: 'view' (product page shown) or 'click' (outbound click to the store)."""
    with _lock:
        ev = _read(EVENTS, [])
        ev.append({"t": datetime.now(timezone.utc).isoformat(timespec="seconds"), "k": kind, "l": listing_id})
        EVENTS.write_text(json.dumps(ev[-20000:]), "utf-8")


def log_search(q: str, results: int, understood: bool):
    if not q.strip():
        return
    with _lock:
        log = _read(SEARCH_LOG, [])
        log.append({"ts": datetime.now(timezone.utc).isoformat(timespec="minutes"), "q": q.strip()[:80],
                    "results": results, "understood": understood})
        SEARCH_LOG.write_text(json.dumps(log[-5000:], ensure_ascii=False), "utf-8")


def traffic(listing_ids=None, days=30) -> dict:
    """{listing_id: {date: [views, clicks]}} over the last `days` days, seed + live events."""
    start = (datetime.now(timezone.utc).date() - timedelta(days=days - 1)).isoformat()
    out = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    want = set(listing_ids) if listing_ids is not None else None
    for lid, series in _seed_traffic().items():
        if want is not None and lid not in want:
            continue
        for d, v, c in series:
            if d >= start:
                out[lid][d][0] += v
                out[lid][d][1] += c
    for e in _read(EVENTS, []):
        if want is not None and e["l"] not in want:
            continue
        d = e["t"][:10]
        if d >= start:
            out[e["l"]][d][0 if e["k"] == "view" else 1] += 1
    return out


def daily_series(listing_ids=None, days=30):
    """[[date, views, clicks], ...] summed over the given listings, one row per day (zeros included)."""
    t = traffic(listing_ids, days)
    today = datetime.now(timezone.utc).date()
    rows = []
    for i in range(days - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        v = sum(series.get(d, [0, 0])[0] for series in t.values())
        c = sum(series.get(d, [0, 0])[1] for series in t.values())
        rows.append([d, v, c])
    return rows


def per_listing_totals(listing_ids=None, days=30):
    t = traffic(listing_ids, days)
    return {lid: [sum(v for v, _ in s.values()), sum(c for _, c in s.values())] for lid, s in t.items()}


def search_stats(days=30):
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    log = [e for e in _read(DATA / "search_log_seed.json", []) + _read(SEARCH_LOG, []) if e["ts"] >= start]
    by_day = defaultdict(lambda: [0, 0])
    for e in log:
        by_day[e["ts"][:10]][0] += 1
        by_day[e["ts"][:10]][1] += e["results"] == 0
    today = datetime.now(timezone.utc).date()
    series = []
    for i in range(days - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        n, z = by_day.get(d, [0, 0])
        series.append([d, n, z])
    top = Counter(e["q"] for e in log).most_common(10)
    zero = Counter(e["q"] for e in log if e["results"] == 0).most_common(8)
    live = [e for e in _read(SEARCH_LOG, []) if e["ts"] >= start]
    return {
        "total": len(log), "zero": sum(e["results"] == 0 for e in log),
        "zero_rate": round(sum(e["results"] == 0 for e in log) / len(log), 3) if log else 0,
        "series": series, "top": top, "top_zero": zero,
        "recent": [{"ts": e["ts"], "q": e["q"], "results": e["results"]} for e in live[-8:][::-1]],
    }

"""Trending analysis — detect velocity and growth patterns in starring behavior."""

import json
from collections import Counter, defaultdict
from datetime import datetime

from starz.db.client import get_db


def compute_trends() -> dict:
    """Analyze starring patterns to detect trends."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT starred_at, category, language, topics FROM repos WHERE starred_at IS NOT NULL ORDER BY starred_at"
        ).fetchall()

    # Monthly breakdown by category
    monthly_cats: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    monthly_langs: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    monthly_topics: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    monthly_total: dict[str, int] = defaultdict(int)

    for r in rows:
        try:
            dt = datetime.fromisoformat(r["starred_at"].replace("Z", "+00:00"))
            month = dt.strftime("%Y-%m")
        except Exception:
            continue

        monthly_total[month] += 1

        cat = r["category"] or "Other"
        monthly_cats[month][cat] += 1

        lang = r["language"]
        if lang:
            monthly_langs[month][lang] += 1

        topics = json.loads(r["topics"]) if r["topics"] and r["topics"] != "[]" else []
        for t in topics:
            monthly_topics[month][t] += 1

    # Compute velocity: last 3 months vs previous 3 months
    months = sorted(monthly_total.keys())
    recent_months = months[-3:] if len(months) >= 3 else months
    prev_months = months[-6:-3] if len(months) >= 6 else []

    # Category velocity
    recent_cats: Counter[str] = Counter()
    prev_cats: Counter[str] = Counter()
    for m in recent_months:
        recent_cats.update(monthly_cats[m])
    for m in prev_months:
        prev_cats.update(monthly_cats[m])

    accelerating = []
    declining = []
    for cat in set(list(recent_cats.keys()) + list(prev_cats.keys())):
        recent = recent_cats.get(cat, 0)
        prev = prev_cats.get(cat, 0)
        if prev == 0 and recent > 0:
            accelerating.append(
                {"category": cat, "recent": recent, "previous": prev, "velocity": "new"}
            )
        elif recent > prev * 1.5:
            accelerating.append(
                {
                    "category": cat,
                    "recent": recent,
                    "previous": prev,
                    "velocity": "accelerating",
                }
            )
        elif prev > 0 and recent < prev * 0.5:
            declining.append(
                {
                    "category": cat,
                    "recent": recent,
                    "previous": prev,
                    "velocity": "declining",
                }
            )

    accelerating.sort(key=lambda x: x["recent"], reverse=True)
    declining.sort(key=lambda x: x["previous"], reverse=True)

    # Topic velocity (same approach)
    recent_topic_counts: Counter[str] = Counter()
    for m in recent_months:
        recent_topic_counts.update(monthly_topics[m])

    hot_topics = recent_topic_counts.most_common(10)

    # Timeline
    timeline = [{"month": m, "count": monthly_total[m]} for m in months]

    return {
        "timeline": timeline,
        "monthly_categories": {m: dict(monthly_cats[m]) for m in months[-6:]},
        "accelerating": accelerating[:5],
        "declining": declining[:5],
        "hot_topics": [{"topic": t, "count": c} for t, c in hot_topics],
        "recent_months": recent_months,
        "total_recent": sum(monthly_total[m] for m in recent_months),
        "total_previous": sum(monthly_total[m] for m in prev_months),
    }

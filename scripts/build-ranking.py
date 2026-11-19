#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the ranking payload (data.json) from the collected GitHub/catalog data."""
import json
import math
import os
import re
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
NOW = datetime.now(timezone.utc)

catalog = json.load(open(os.path.join(DATA, "catalog.json"), encoding="utf-8"))
cats_meta = catalog["metadata"]["categories"]
plugins = catalog["plugins"]
stars = json.load(open(os.path.join(DATA, "stars.json"), encoding="utf-8"))
downloads = json.load(open(os.path.join(DATA, "downloads.json"), encoding="utf-8"))
repo_meta = json.load(open(os.path.join(DATA, "repo_meta.json"), encoding="utf-8"))


def repo_key(p):
    return (repo_display(p) or "").lower()


def repo_display(p):
    url = (p.get("repository") or {}).get("url") or ""
    m = re.match(r"https?://github\.com/([^/]+/[^/#?]+)", url)
    return m.group(1) if m else None


def days_since(ts):
    if not ts:
        return 999
    try:
        d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return 999
    return max((NOW - d).days, 0)


def clean(s, n=110):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


# ---------------------------------------------------------------- plugin rows
rows = []
for p in plugins:
    key = repo_key(p)
    st = stars.get(key, 0) if key else 0
    dl = downloads.get(p["name"], 0)
    meta = repo_meta.get(key, {}) if key else {}
    pushed_days = days_since(meta.get("pushed"))
    ver = p["versions"][0] if p.get("versions") else {}
    pub_days = days_since(
        datetime.fromtimestamp(ver["publishTimestamp"], timezone.utc).isoformat()
        if ver.get("publishTimestamp")
        else None
    )
    rows.append(
        {
            "id": p["name"],
            "repo": repo_display(p) or "",
            "cat": p["metadata"].get("category") or "tools",
            "zh": clean(p["description"].get("zh") or p["description"].get("en") or ""),
            "en": clean(p["description"].get("en") or "", 140),
            "v": ver.get("version") or "",
            "stars": st,
            "dl": dl,
            "pushed": pushed_days,
            "pub": pub_days,
            "lic": meta.get("license") or "",
            "archived": bool(meta.get("archived")),
            "engines": (ver.get("engines") or {}).get("dsh") or "",
        }
    )


def lg(x):
    return math.log10(x + 1)


max_star = max(r["stars"] for r in rows) or 1
max_dl = max(r["dl"] for r in rows) or 1

for r in rows:
    s = lg(r["stars"]) / lg(max_star)
    d = lg(r["dl"]) / lg(max_dl)
    fresh = max(0.0, 1 - r["pushed"] / 120.0)  # pushed within 4 months
    score = 0.50 * s + 0.34 * d + 0.16 * fresh
    if r["archived"]:
        score *= 0.72
    r["score"] = round(score * 100, 1)

# ---------------------------------------------------------------- skill rows
skill_repos = {}
for f in os.listdir(DATA):
    if not f.startswith("search_skills_") and f != "search_awesome_lists.json":
        continue
    d = json.load(open(os.path.join(DATA, f), encoding="utf-8"))
    for it in d.get("items", []):
        k = it["full_name"].lower()
        skill_repos.setdefault(k, it)

# Repos that are applications/workspaces/platforms rather than drop-in skills.
NOT_A_SKILL = {
    "cherryhq/cherry-studio", "nocobase/nocobase", "paperclipai/paperclip",
    "nexu-io/open-design", "topoteretes/cognee", "pascalorg/editor",
    "nanocoai/nanoclaw", "reactive-resume/reactive-resume", "googleworkspace/cli",
    "guillaumemeyer/watermarks-remover", "alibaba/open-code-review",
    "hesreallyhim/awesome-claude-code", "github/awesome-copilot",
    "davila7/claude-code-templates", "wshobson/agents", "agentskills/agentskills",
    "cathrynlavery/diagram-design", "eclipse-theia/theia", "eigent-ai/eigent",
    "alibaba/zvec", "krillinai/opencreator", "jetbrains/thinkrail", "yaoapp/yao",
    "citrolabs/ego-lite", "aden-hive/hive", "mvschwarz/openrig",
}
skills = []
skill_max = max((it["stargazers_count"] for it in skill_repos.values()), default=1)
for k, it in skill_repos.items():
    topics = [t.lower() for t in (it.get("topics") or [])]
    if k in NOT_A_SKILL:
        continue
    desc = (it.get("description") or "").lower()
    looks_like_skill = (
        any(t in topics for t in ("agent-skills", "agent-skill", "claude-skills",
                                  "claude-code-skills", "codex-skills", "dsh-skill"))
        or "skill" in desc
        or "skills" in desc
    )
    if not looks_like_skill:
        continue
    st = it["stargazers_count"]
    d0 = days_since(it.get("pushed_at"))
    score = 0.62 * (lg(st) / lg(skill_max)) + 0.38 * max(0.0, 1 - d0 / 150.0)
    skills.append(
        {
            "id": it["full_name"],
            "owner": it["owner"]["login"],
            "name": it["name"],
            "desc": re.sub(r"\s+", " ", (it.get("description") or "")).strip()[:150],
            "stars": st,
            "forks": it["forks_count"],
            "pushed": d0,
            "lic": (it.get("license") or {}).get("spdx_id") or "",
            "url": it["html_url"],
            "score": round(score * 100, 1),
            "topics": topics[:6],
        }
    )
skills.sort(key=lambda r: -r["score"])

# ---------------------------------------------------------------- rising repos
# Repos created in the last 90 days that already gathered real traction.
rising = []
for k, it in repo_meta.items():
    age = days_since(it.get("created"))
    if age > 90 or it.get("archived"):
        continue
    st = it.get("stars", 0)
    if st < 250:
        continue
    rising.append(
        {
            "id": it["url"].replace("https://github.com/", ""),
            "desc": re.sub(r"\s+", " ", (it.get("desc") or "")).strip()[:130],
            "stars": st,
            "age": age,
            "pushed": days_since(it.get("pushed")),
            "lic": it.get("license") or "",
            "url": it["url"],
            "kind": "skill" if any(t in (it.get("topics") or []) for t in ("agent-skills", "agent-skill", "claude-skills")) else "plugin",
        }
    )
rising.sort(key=lambda r: (-r["stars"], r["age"]))

# ---------------------------------------------------------------- output
plugins_sorted = sorted(rows, key=lambda r: -r["score"])
keep = [r for r in plugins_sorted if r["stars"] >= 1 or r["dl"] >= 200][:1200]

payload = {
    "generated": NOW.strftime("%Y-%m-%d"),
    "counts": {
        "plugins_total": len(plugins),
        "plugins_ranked": len(keep),
        "skills_total": len(skill_repos),
        "skills_ranked": len(skills),
    },
    "cats": {k: v["title"]["zh"] for k, v in cats_meta.items()},
    "archived": [r["id"] for r in rows if r["archived"]],
    "plugins": [
        {k: r[k] for k in ("id", "repo", "cat", "zh", "v", "stars", "dl", "pushed", "score", "lic", "engines")}
        for r in keep
    ],
    "skills": [
        {k: r[k] for k in ("id", "owner", "name", "desc", "stars", "forks", "pushed", "lic", "url", "score")}
        for r in skills[:260]
    ],
    "rising": rising[:24],
}

# ------------------------------------------------- full scan corpus (discovery)
# Compact rows for every plugin and every skill, so the on-page discovery engine
# can scan the whole catalog instead of just the ranked slice.
full_plugins = [
    [r["id"], r["repo"], r["cat"], r["zh"][:72], r["en"][:90],
     r["stars"], r["dl"], r["pushed"], r["score"], r["lic"]]
    for r in plugins_sorted
]
full_skills = [
    [s["id"], s["owner"], s["name"], s["desc"][:88], s["stars"], s["pushed"], s["score"], s["lic"]]
    for s in skills
]
payload["full"] = {"plugins": full_plugins, "skills": full_skills}
json.dump(payload, open(os.path.join(ROOT, "payload.json"), "w", encoding="utf-8"),
          ensure_ascii=False)
print("plugins embedded:", len(payload["plugins"]))
print("skills embedded:", len(payload["skills"]))
print("size:", round(os.path.getsize(os.path.join(ROOT, "payload.json")) / 1024), "KB")
print("\nTOP 20 plugins")
for r in payload["plugins"][:20]:
    print(f'  {r["score"]:>5}  ★{r["stars"]:>6}  ⤓{r["dl"]:>8}  {r["id"]}')
print("\nTOP 15 skills")
for r in payload["skills"][:15]:
    print(f'  {r["score"]:>5}  ★{r["stars"]:>6}  {r["id"]}')

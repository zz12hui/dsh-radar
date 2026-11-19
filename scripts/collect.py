#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Collect GitHub repo data for the DSH ecosystem radar.

Uses unauthenticated GitHub search (10 req/min) plus raw HTTP for anything else.
Every query page is persisted under data/ so a rerun resumes instead of refetching.
"""
import json
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

HDRS = {
    "User-Agent": "dsh-radar/1.0",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# (slug, query) — each slug becomes data/search_<slug>.json with every page merged.
QUERIES = [
    # DSH plugins
    ("dsh_plugin_top", "topic:dsh-plugin stars:>50"),
    ("dsh_plugin_mid", "topic:dsh-plugin stars:>20 pushed:>2026-07-01"),
    ("dsh_topic_deepseek", "topic:deepseek-harness stars:>30"),
    ("dsh_topic_skill", "topic:dsh-skill"),
    ("dsh_topic_skills", "topic:dsh-skills"),
    # Agent skills (Claude / Codex / generic)
    ("skills_agent_hi", "topic:agent-skills stars:>900"),
    ("skills_agent_mid", "topic:agent-skills stars:>300"),
    ("skills_claude_hi", "topic:claude-skills stars:>800"),
    ("skills_claude_code", "topic:claude-code-skills stars:>200"),
    ("skills_agent_skill_single", "topic:agent-skill stars:>200"),
    # Curated lists worth pinning in the directory
    ("awesome_lists", "awesome dsh plugin in:name,description stars:>20"),
]

PAGES = 10  # GitHub caps search at 1000 results per query


def fetch(url, tries=4, wait=10):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HDRS)
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 - network flakiness is expected
            last = e
            time.sleep(wait * (i + 1))
    raise last


def run_query(slug, q):
    out = os.path.join(DATA, f"search_{slug}.json")
    if os.path.exists(out):
        with open(out, encoding="utf-8") as f:
            cached = json.load(f)
        print(f"[skip] {slug}: {len(cached['items'])} cached")
        return
    items, total = [], 0
    for page in range(1, PAGES + 1):
        url = (
            "https://api.github.com/search/repositories?sort=stars&order=desc"
            f"&per_page=100&page={page}&q={urllib.parse.quote(q)}"
        )
        try:
            d = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"[fail] {slug} p{page}: {e}")
            break
        total = d.get("total_count", 0)
        batch = d.get("items") or []
        items.extend(batch)
        print(f"[ok] {slug} p{page}: +{len(batch)} (total {total})")
        if len(batch) < 100 or len(items) >= min(total, PAGES * 100):
            break
        time.sleep(6.5)  # stay under the 10 searches/min unauthenticated budget
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"query": q, "total_count": total, "items": items}, f, ensure_ascii=False)
    print(f"[done] {slug}: {len(items)} repos")


def main():
    for slug, q in QUERIES:
        run_query(slug, q)


if __name__ == "__main__":
    main()

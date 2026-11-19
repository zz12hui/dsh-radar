#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fetch star counts for every catalog repo via shields.io (no token, no hard cap).

Writes data/stars.json incrementally so the run can be interrupted and resumed.
"""
import json
import os
import re
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "stars.json")
LOCK = threading.Lock()

catalog = json.load(open(os.path.join(DATA, "catalog.json"), encoding="utf-8"))["plugins"]


def repo_of(p):
    url = (p.get("repository") or {}).get("url") or ""
    m = re.match(r"https?://github\.com/([^/]+/[^/#?]+)", url)
    return m.group(1) if m else None


repos = []
seen = set()
for p in catalog:
    r = repo_of(p)
    if r and r.lower() not in seen:
        seen.add(r.lower())
        repos.append(r)

# Merge star counts already collected from the GitHub search API.
known = {}
import glob  # noqa: E402

for f in glob.glob(os.path.join(DATA, "search_*.json")):
    d = json.load(open(f, encoding="utf-8"))
    for it in d.get("items", []):
        known[it["full_name"].lower()] = it["stargazers_count"]

stars = {}
if os.path.exists(OUT):
    stars = json.load(open(OUT, encoding="utf-8"))
for k, v in known.items():
    stars.setdefault(k, v)

todo = [r for r in repos if r.lower() not in stars]
print(f"repos={len(repos)} known={len(repos)-len(todo)} todo={len(todo)}", flush=True)


def fetch(r, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(
                f"https://img.shields.io/github/stars/{r}.json",
                headers={"User-Agent": "dsh-radar/1.0"},
            )
            msg = json.load(urllib.request.urlopen(req, timeout=25)).get("message", "")
            msg = str(msg).replace(",", "").strip()
            if msg.endswith("k"):
                return int(float(msg[:-1]) * 1000)
            return int(float(msg))
        except Exception:  # noqa: BLE001
            time.sleep(1.5 * (i + 1))
    return None


done = 0
start = time.time()
with ThreadPoolExecutor(24) as ex:
    for r, v in zip(todo, ex.map(fetch, todo)):
        done += 1
        if v is not None:
            with LOCK:
                stars[r.lower()] = v
        if done % 200 == 0:
            with LOCK:
                json.dump(stars, open(OUT, "w", encoding="utf-8"))
            rate = done / max(time.time() - start, 1)
            print(f"{done}/{len(todo)}  {rate:.1f}/s  eta {(len(todo)-done)/max(rate,0.1)/60:.1f}min", flush=True)

json.dump(stars, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("saved", len(stars), flush=True)

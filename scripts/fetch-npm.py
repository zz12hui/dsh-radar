#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fetch last-month npm downloads for the best catalog packages (resumable)."""
import json
import os
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "downloads.json")
LOCK = threading.Lock()

catalog = json.load(open(os.path.join(DATA, "catalog.json"), encoding="utf-8"))["plugins"]
stars = json.load(open(os.path.join(DATA, "stars.json"), encoding="utf-8"))


def repo_key(p):
    url = (p.get("repository") or {}).get("url") or ""
    if "github.com/" not in url:
        return None
    return url.split("github.com/")[1].strip("/").split("/")[0].lower() + "/" + url.split("github.com/")[1].strip("/").split("/")[1].lower()


cands = []
for p in catalog:
    k = repo_key(p)
    s = stars.get(k, 0) if k else 0
    if s >= 5:
        cands.append((s, p["name"]))
cands.sort(reverse=True)
cands = [n for _, n in cands][:1600]

dl = {}
if os.path.exists(OUT):
    dl = json.load(open(OUT, encoding="utf-8"))
todo = [n for n in cands if n not in dl]
print(f"candidates={len(cands)} todo={len(todo)}", flush=True)


def fetch(n):
    for i in range(3):
        try:
            u = f"https://api.npmjs.org/downloads/point/last-month/{n}"
            r = json.load(urllib.request.urlopen(u, timeout=25))
            return n, r.get("downloads", 0)
        except Exception:  # noqa: BLE001
            time.sleep(1 + i)
    return n, None


done = 0
start = time.time()
with ThreadPoolExecutor(12) as ex:
    for n, v in ex.map(fetch, todo):
        done += 1
        if v is not None:
            with LOCK:
                dl[n] = v
        if done % 100 == 0:
            with LOCK:
                json.dump(dl, open(OUT, "w", encoding="utf-8"))
            rate = done / max(time.time() - start, 1)
            print(f"{done}/{len(todo)} {rate:.1f}/s eta {(len(todo)-done)/max(rate,.01)/60:.1f}min", flush=True)

json.dump(dl, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("saved", len(dl), flush=True)

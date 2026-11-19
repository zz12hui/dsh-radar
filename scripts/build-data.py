#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the plugin's data file (radar.json) from payload.json.

The plugin gets one compact snapshot: every plugin and skill as a positional
array, plus the curated picks, so the Client can scan the whole catalog without
a second request.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data")

payload = json.load(open(os.path.join(ROOT, "payload.json"), encoding="utf-8"))
catalog = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
cats_meta = catalog["metadata"]["categories"]

# version map for the ranked slice only (the Client shows it in the drawer)
versions = {}
for p in catalog["plugins"]:
    v = p["versions"][0] if p.get("versions") else {}
    if v.get("version"):
        versions[p["name"]] = v["version"]

ranked = {r["id"] for r in payload["plugins"]}

INSTALLED = [
    "dshmarket", "dsh-ops", "billion-context", "dsh-free-search",
    "dsh-better-sidebar", "@vectorize-io/hindsight-coding-agents",
    "@wxg-prc-cpg/browser-skill-dsh-plugin", "dsh-computer-use-win",
    "dsh-whale-widget", "dsh-connect-workbuddy", "dsh-mobile",
]

# Curated picks: id -> why it matters. Kept in sync with template.html manually.
PICKS_WHY = {
    "dshmarket": "装插件的入口本身也是个插件。在设置页里搜、点、装、更新，全程不用碰命令行。",
    "dsh-ops": "把这批 ops_* 工具带进来。Windows 上少了它，读个文件都得靠 shell 拼字符串。",
    "billion-context": "上下文压缩。100k 窗口也敢开长会话，压缩账本还告诉你这一刀省了多少 token。",
    "@vectorize-io/hindsight-coding-agents": "跨会话的长期记忆。输入框上方那条横幅就是它，记忆按仓库分银行，换个项目不会串味。",
    "dsh-free-search": "7 个搜索引擎，免费的那几个不用 key，带自动回退和网页抓取。查个包版本或者 CVE 编号，不用为了一个数去开浏览器。",
    "dsh-better-sidebar": "侧栏工作台。文件树和编辑器，终端和 Git 面板，全挤进同一列，不用来回切窗口。",
    "@wxg-prc-cpg/browser-skill-dsh-plugin": "直接驱动你已登录的 Chromium。网页任务优先走它，比截图点坐标靠谱——坐标会错，DOM 不会。",
    "dsh-computer-use-win": "原生 Windows 应用操作：UIA 读控件，也能截图和 OCR。浏览器够不着的系统弹窗靠它兜底。",
    "dsh-context": "看这次会话到底被什么吃满了。压缩之前先看一眼，省得砍错地方。",
    "dsh-whale-widget": "右下角小鲸鱼，显示余额、今日消耗和峰谷价。纯体验件，但盯着消耗，确实会少开几个长会话。",
    "@linxin666/dsh-client-ui-task-board": "多列任务看板，卡片交给真实会话执行。支持 cron，浏览器关了也照跑。",
    "@deepseek-harness-tui/dsh-tui": "终端里的全屏 UI。SSH 进服务器也能用，像素鲸鱼加实时状态行。",
    "@liustack/modlens": "给纯文本模型架一座视觉桥。贴张图，换回 OCR、版面和语义的结构化证据。",
    "dsh-connect-workbuddy": "把本机 WorkBuddy 的模型接进来，按上游目录读倍率，可以逐个模型控制图片输入。",
    "cc-safety-net": "执行前守卫。破坏性 git 和文件命令、读 SSH 密钥或 .env 的调用，会被它拦下来。",
    "@openviking/dsh-memory-plugin": "另一种记忆路线：自动召回加画像注入，还能把整段会话捕获成可检索的库。",
}

PIСKS_NOTE = None  # placeholder to keep flake quiet


def clean(s, n):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


data = {
    "generated": payload["generated"],
    "counts": payload["counts"],
    "cats": {k: v["title"]["zh"] for k, v in cats_meta.items()},
    "installed": INSTALLED,
    "archived": [r["id"] for r in payload["full"]["plugins"] if False] or [],
    "versions": {k: v for k, v in versions.items() if k in ranked},
    # [id, repo, cat, zh, en, stars, dl, pushed, score, lic]
    "plugins": payload["full"]["plugins"],
    # [id, owner, name, desc, stars, pushed, score, lic]
    "skills": payload["full"]["skills"],
    "rising": payload["rising"],
    "rankedPlugins": len(payload["plugins"]),
    "rankedSkills": len(payload["skills"]),
}
# archived ids come from the payload build; recompute from catalog metadata
try:
    repo_meta = json.load(open(os.path.join(ROOT, "data", "repo_meta.json"), encoding="utf-8"))
    arc = []
    for p in catalog["plugins"]:
        url = (p.get("repository") or {}).get("url") or ""
        m = re.match(r"https?://github\.com/([^/]+/[^/#?]+)", url)
        if not m:
            continue
        meta = repo_meta.get(m.group(1).lower())
        if meta and meta.get("archived"):
            arc.append(p["name"])
    data["archived"] = arc
except Exception as exc:  # pragma: no cover
    print("archived ids skipped:", exc)

# curated picks with resolved metrics and live flag
ranked_by_id = {r["id"]: r for r in payload["plugins"]}
picks = []
for pid, why in PICKS_WHY.items():
    row = ranked_by_id.get(pid)
    if row is None:
        continue
    picks.append({
        "id": pid,
        "repo": row["repo"],
        "cat": None,
        "why": why,
        "stars": row["stars"],
        "dl": row["dl"],
        "live": pid in INSTALLED,
    })
# category titles for the picks (from catalog metadata)
cat_by_name = {}
for p in catalog["plugins"]:
    if p["name"] in PICKS_WHY:
        cat_by_name[p["name"]] = cats_meta.get(p["metadata"].get("category") or "tools", {}).get("title", {}).get("zh") or "其他"
for item in picks:
    item["cat"] = cat_by_name.get(item["id"], "其他")
data["picks"] = picks

os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, "radar.json")
with open(out, "w", encoding="utf-8") as fh:
    json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))

print("radar.json:", round(os.path.getsize(out) / 1024), "KB")
print("plugins", len(data["plugins"]), "skills", len(data["skills"]),
      "rising", len(data["rising"]), "archived", len(data["archived"]))

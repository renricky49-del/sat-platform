#!/usr/bin/env python3
"""Add questions the student got wrong elsewhere to the wrong book.

  python3 tools/add_wrong.py QID:我的答案 [QID:我的答案 ...] [--custom app/data/custom/xxx.json]

QID is the College Board question ID (8 hex chars). The question must already be in
the local cache (fetch it with tools/fetch_bank.py). Uploads the question (week 0) and a wrong-book
entry due tomorrow (America/Los_Angeles). Uses .env like tools/upload_week.py.
"""
import datetime
import glob
import json
import os
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from upload_week import load_env, upsert, ROOT  # noqa: E402
from build_week import TYPES, matches, compact, QDIR  # noqa: E402


def find(qid):
    for f in glob.glob(os.path.join(QDIR, "*.json")):
        q = json.load(open(f))
        if q["_meta"]["questionId"] == qid:
            return q
    sys.exit(f"本地缓存里没有题目 {qid}")


def entry(c, t, mine, today, tomorrow):
    return {"col": "wrong", "id": c["id"], "data": {
        "qid": c["id"], "sec": c["sec"], "type": t, "addedOn": today.isoformat(), "source": "manual",
        "from": "manual", "stage": 0, "due": tomorrow.isoformat(), "mastered": False, "hist": [],
        "times": 1, "lastAns": mine}}


def main(items, custom=None):
    env = load_env()
    today = datetime.datetime.now(ZoneInfo("America/Los_Angeles")).date()
    tomorrow = today + datetime.timedelta(days=1)
    qrows, wrows = [], []
    for it in items:
        qid, mine = (it.split(":", 1) + [None])[:2]
        q = find(qid)
        t = next(t for t in TYPES if matches(q, t))
        c = compact(q, t)
        qrows.append({"id": c["id"], "week": 0, "data": c})
        wrows.append(entry(c, t, mine, today, tomorrow))
        print(f"{c['id']}  {TYPES[t]['name']}  {c['diff']}  我的答案 {mine}  正确答案 {c['ans']}")
    # 不在 College Board 题库里的题（如模考题）：从截图录入的 JSON，[{"q": 题目, "mine": "A"}]
    for it in json.load(open(custom)) if custom else []:
        c = it["q"]
        qrows.append({"id": c["id"], "week": 0, "data": c})
        wrows.append(entry(c, c["type"], it.get("mine"), today, tomorrow))
        print(f"{c['id']}  {TYPES[c['type']]['name']}  难度未知  我的答案 {it.get('mine')}  正确答案 {c['ans']}")
    upsert(env, "questions", qrows, "id")
    upsert(env, "docs", wrows, "col,id")
    print(f"已加入错题本 {len(wrows)} 道，{tomorrow} 开始复习")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
    else:
        args = sys.argv[1:]
        custom = None
        if "--custom" in args:
            i = args.index("--custom")
            custom = args[i + 1]
            args = args[:i] + args[i + 2:]
        main(args, custom)

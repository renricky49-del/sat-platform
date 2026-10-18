#!/usr/bin/env python3
"""Upload one week's plan and questions (app/data/wN.json) to Supabase.

  python3 tools/upload_week.py 1        # uploads app/data/w1.json

Needs .env in the project folder with SUPABASE_URL and SUPABASE_SERVICE_KEY
(the Secret key from Supabase → Project Settings → API Keys). Never commit .env.
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env():
    env = {}
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        sys.exit("缺少 .env 文件：请在项目文件夹里写 SUPABASE_URL 和 SUPABASE_SERVICE_KEY")
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY"):
        if not env.get(k):
            sys.exit(f".env 里缺少 {k}")
    return env


def upsert(env, table, rows, on_conflict):
    url = f"{env['SUPABASE_URL'].rstrip('/')}/rest/v1/{table}?on_conflict={on_conflict}"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "apikey": env["SUPABASE_SERVICE_KEY"],
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })
    with urllib.request.urlopen(req, timeout=120) as r:
        if r.status >= 300:
            sys.exit(f"上传 {table} 失败：HTTP {r.status}")


def main(week):
    env = load_env()
    data = json.load(open(os.path.join(ROOT, "app", "data", f"w{week}.json")))
    idx = json.load(open(os.path.join(ROOT, "app", "data", "weeks.json")))
    plan = {k: v for k, v in data.items() if k != "questions"}
    plan["types"] = idx.get("types", {})
    upsert(env, "weeks", [{"week": data["week"], "data": plan}], "week")
    qs = [{"id": qid, "week": data["week"], "data": q} for qid, q in data["questions"].items()]
    for i in range(0, len(qs), 60):
        upsert(env, "questions", qs[i:i + 60], "id")
    print(f"第 {data['week']} 周：计划 {len(data['days'])} 天，题目 {len(qs)} 道，已上传")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
    else:
        main(int(sys.argv[1]))

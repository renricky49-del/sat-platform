#!/usr/bin/env python3
"""Download question metadata and details from the SAT Suite Question Bank.

Usage:
  python3 tools/fetch_bank.py lists              # refresh the R&W / Math question lists
  python3 tools/fetch_bank.py details SKILL...   # fetch every hard+medium question of these skills/domains

SKILL is a skill code (COE, CID, WIC, INF, ...) for Reading and Writing, or a
domain code (H=Algebra, P=Advanced Math, Q=PSDA, S=Geometry and Trig) for Math.
Details are cached in ~/Library/Caches/sat-platform/q/<external_id>.json (not in iCloud) and never fetched twice.
"""
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.environ.get("SAT_CACHE", os.path.expanduser("~/Library/Caches/sat-platform"))
LISTS = os.path.join(CACHE, "lists")
QDIR = os.path.join(CACHE, "q")
API = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank"


def post(path, body, tries=4):
    data = json.dumps(body).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(API + path, data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read())
        except Exception as e:  # network hiccup: back off and retry
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def get(path):
    with urllib.request.urlopen(API + path, timeout=40) as r:
        return json.loads(r.read())


def refresh_lists():
    os.makedirs(LISTS, exist_ok=True)
    rw = post("/digital/get-questions", {"asmtEventId": 99, "test": 1, "domain": "INI,CAS,EOI,SEC"})
    m = post("/digital/get-questions", {"asmtEventId": 99, "test": 2, "domain": "H,P,Q,S"})
    lk = get("/lookup")
    for name, obj in (("rw_list", rw), ("math_list", m), ("lookup", lk)):
        with open(os.path.join(LISTS, name + ".json"), "w") as f:
            json.dump(obj, f)
    print(f"R&W {len(rw)}  Math {len(m)}")


def load_lists():
    rw = json.load(open(os.path.join(LISTS, "rw_list.json")))
    m = json.load(open(os.path.join(LISTS, "math_list.json")))
    return rw, m


def fetch_one(meta):
    ext = meta["external_id"]
    path = os.path.join(QDIR, ext + ".json")
    if os.path.exists(path):
        return "cached"
    d = post("/digital/get-question", {"external_id": ext})
    d["_meta"] = meta
    with open(path, "w") as f:
        json.dump(d, f)
    return "new"


def fetch_details(codes, difficulties=("H", "M")):
    os.makedirs(QDIR, exist_ok=True)
    rw, m = load_lists()
    todo = [q for q in rw if q["skill_cd"] in codes and q["difficulty"] in difficulties and q.get("external_id")]
    todo += [q for q in m if q["primary_class_cd"] in codes and q["difficulty"] in difficulties
             and q.get("external_id") and not q.get("ibn")]
    print(f"{len(todo)} questions to check")
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = list(ex.map(fetch_one, todo))
    print({k: res.count(k) for k in set(res)})


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
    elif sys.argv[1] == "lists":
        refresh_lists()
    elif sys.argv[1] == "details":
        diffs = os.environ.get("DIFF", "H").split(",")
        fetch_details(set(sys.argv[2:]), tuple(diffs))

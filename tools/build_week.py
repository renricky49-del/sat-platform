#!/usr/bin/env python3
"""Turn a weekly plan (plans/weekN.json) into app/data/wN.json.

  python3 tools/build_week.py plans/week1.json

Picks hard questions first (falls back to medium when the hard pool runs
out), never reuses a question already placed in an earlier week, and
writes the week index app/data/weeks.json.
"""
import html
import json
import os
import random
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QDIR = os.path.join(ROOT, "cache", "q")
DATA = os.path.join(ROOT, "app", "data")

# type id -> how to recognise it in the bank
TYPES = {
    # Reading and Writing
    "chart":     {"sec": "rw", "skill": "COE", "figure": True,  "name": "图表题"},
    "evidence":  {"sec": "rw", "skill": "COE", "figure": False, "name": "文本证据题"},
    "detail":    {"sec": "rw", "skill": "CID", "name": "细节题"},
    "inference": {"sec": "rw", "skill": "INF", "name": "推断题"},
    "wic":       {"sec": "rw", "skill": "WIC", "name": "词汇题"},
    "structure": {"sec": "rw", "skill": "TSP", "name": "结构目的题"},
    "crosstext": {"sec": "rw", "skill": "CTC", "name": "双篇题"},
    "synthesis": {"sec": "rw", "skill": "SYN", "name": "笔记整合题"},
    "transition": {"sec": "rw", "skill": "TRA", "name": "过渡词题"},
    "boundary":  {"sec": "rw", "skill": "BOU", "name": "标点边界题"},
    "form":      {"sec": "rw", "skill": "FSS", "name": "语法形式题"},
    # Math
    "alg":  {"sec": "math", "domain": "H", "name": "Algebra"},
    "adv":  {"sec": "math", "domain": "P", "name": "Advanced Math"},
    "psda": {"sec": "math", "domain": "Q", "name": "Problem-Solving and Data Analysis"},
    "geo":  {"sec": "math", "domain": "S", "name": "Geometry and Trigonometry"},
}


def has_figure(q):
    s = q.get("stimulus") or ""
    return "<table" in s or "<svg" in s or "<img" in s


def matches(q, t):
    spec = TYPES[t]
    m = q["_meta"]
    if spec["sec"] == "rw":
        if m.get("skill_cd") != spec["skill"]:
            return False
        if "figure" in spec:
            return has_figure(q) == spec["figure"]
        return True
    return m.get("primary_class_cd") == spec["domain"]


def clean(h):
    if not h:
        return ""
    h = re.sub(r"<script.*?</script>", "", h, flags=re.S | re.I)
    h = re.sub(r"\son\w+=\"[^\"]*\"", "", h)
    # 题目 SVG 自带的全局样式只作用在 SVG 里
    h = h.replace("*{stroke-linecap", "svg *{stroke-linecap")
    h = re.sub(r"\.(small|heavy)\s*\{", lambda m: "svg ." + m.group(1) + " {", h)
    return h.strip()


def compact(q, t):
    m = q["_meta"]
    out = {
        "id": m["questionId"],
        "ext": m["external_id"],
        "sec": TYPES[t]["sec"],
        "type": t,
        "skill": m.get("skill_desc", ""),
        "domain": m.get("primary_class_cd_desc", ""),
        "diff": m.get("difficulty"),
        "kind": q["type"],
        "stim": clean(q.get("stimulus")),
        "stem": clean(q.get("stem")),
        "rat": clean(q.get("rationale")),
    }
    if q["type"] == "mcq":
        out["opts"] = [clean(o["content"]) for o in q["answerOptions"]]
        out["ans"] = q["correct_answer"][0]
    else:
        out["ans"] = q["correct_answer"]
    return out


def used_ids(skip_week):
    used = set()
    for f in glob.glob(os.path.join(DATA, "w[0-9]*.json")):
        w = json.load(open(f))
        if w.get("week") == skip_week:
            continue
        used.update(w["questions"].keys())
    return used


def main(plan_path):
    plan = json.load(open(plan_path))
    week = plan["week"]
    rnd = random.Random(plan.get("seed", week * 7919))
    bank = [json.load(open(f)) for f in glob.glob(os.path.join(QDIR, "*.json"))]
    used = used_ids(week)

    # how many of each type this week needs
    need = {}
    for d in plan["days"]:
        for sec in ("reading", "math"):
            for st in d.get(sec, []):
                need[st["type"]] = need.get(st["type"], 0) + st["n"]
    for t, n in plan.get("extra", {}).items():
        need[t] = need.get(t, 0) + n

    pools = {}
    report = {}
    for t, n in need.items():
        cand = [q for q in bank if matches(q, t) and q["_meta"]["questionId"] not in used]
        hard = [q for q in cand if q["_meta"]["difficulty"] == "H"]
        med = [q for q in cand if q["_meta"]["difficulty"] == "M"]
        rnd.shuffle(hard)
        rnd.shuffle(med)
        pick = (hard + med)[:n]
        if len(pick) < n:
            sys.exit(f"Not enough questions for {t}: need {n}, have {len(pick)} (fetch more with tools/fetch_bank.py)")
        pools[t] = pick
        report[t] = {"need": n, "hard": sum(1 for q in pick if q["_meta"]["difficulty"] == "H"),
                     "hard_left_after": len(hard) - min(len(hard), n)}

    questions = {}

    def take(t, n):
        out = []
        for _ in range(n):
            q = pools[t].pop(0)
            c = compact(q, t)
            questions[c["id"]] = c
            out.append(c["id"])
        return out

    days = []
    for d in plan["days"]:
        day = {"id": d["id"], "dates": d["dates"], "label": d.get("label", ""), "reading": [], "math": []}
        for sec in ("reading", "math"):
            for st in d.get(sec, []):
                day[sec].append({"type": st["type"], "qids": take(st["type"], st["n"])})
        days.append(day)
    extra = {t: take(t, n) for t, n in plan.get("extra", {}).items()}

    out = {
        "week": week,
        "label": plan.get("label", f"第{week}周"),
        "start": plan["start"],
        "end": plan["end"],
        "days": days,
        "extra": extra,
        "questions": questions,
    }
    os.makedirs(DATA, exist_ok=True)
    fn = f"w{week}.json"
    with open(os.path.join(DATA, fn), "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    # week index
    idx_path = os.path.join(DATA, "weeks.json")
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {"weeks": []}
    idx["weeks"] = [w for w in idx["weeks"] if w["week"] != week]
    idx["weeks"].append({"week": week, "file": fn, "label": out["label"], "start": plan["start"], "end": plan["end"]})
    idx["weeks"].sort(key=lambda w: w["week"])
    idx["types"] = {k: {"sec": v["sec"], "name": v["name"]} for k, v in TYPES.items()}
    with open(idx_path, "w") as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)

    size = os.path.getsize(os.path.join(DATA, fn))
    print(f"wrote {fn}: {len(questions)} questions, {size/1024:.0f} KB")
    for t, r in report.items():
        print(f"  {t:10s} need {r['need']:3d}  hard {r['hard']:3d}  hard left in bank {r['hard_left_after']}")


if __name__ == "__main__":
    main(sys.argv[1])

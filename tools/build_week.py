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
QDIR = os.path.join(os.environ.get("SAT_CACHE", os.path.expanduser("~/Library/Caches/sat-platform")), "q")
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

    # 每个题型分开 Hard / Medium 两个池子
    hard_pool, med_pool = {}, {}
    for t in need:
        cand = [q for q in bank if matches(q, t) and q["_meta"]["questionId"] not in used]
        hard_pool[t] = [q for q in cand if q["_meta"]["difficulty"] == "H"]
        med_pool[t] = [q for q in cand if q["_meta"]["difficulty"] == "M"]
        rnd.shuffle(hard_pool[t])
        rnd.shuffle(med_pool[t])
        if len(hard_pool[t]) + len(med_pool[t]) < need[t]:
            sys.exit(f"Not enough questions for {t}: need {need[t]}, have {len(hard_pool[t]) + len(med_pool[t])} (fetch more with tools/fetch_bank.py)")

    questions = {}
    used_h = {t: 0 for t in need}
    used_m = {t: 0 for t in need}
    rw_hard = plan.get("rwHard")  # 阅读每关只放几道 Hard，其余用 Medium；不写就是 Hard 优先

    def take(t, n, hard=None):
        """hard=None：Hard 优先；hard=k：先拿 k 道 Hard，其余 Medium（任一边不够就用另一边补）。"""
        hp, mp = hard_pool[t], med_pool[t]
        if hard is None:
            seq = [hp] * n
        else:
            k = min(hard, n)
            seq = [hp] * k + [mp] * (n - k)
        out = []
        for src in seq:
            pool = src if src else (mp if src is hp else hp)
            q = pool.pop(0)
            if q["_meta"]["difficulty"] == "H":
                used_h[t] += 1
            else:
                used_m[t] += 1
            c = compact(q, t)
            questions[c["id"]] = c
            out.append(c["id"])
        return out

    days = []
    for d in plan["days"]:
        day = {"id": d["id"], "dates": d["dates"], "label": d.get("label", ""), "reading": [], "math": []}
        for sec in ("reading", "math"):
            for st in d.get(sec, []):
                k = st.get("hard", rw_hard if sec == "reading" else None)
                day[sec].append({"type": st["type"], "qids": take(st["type"], st["n"], k)})
        days.append(day)
    # 额外练习：设了 rwHard 时阅读题型用 Medium，把 Hard 留给以后的每日关卡
    extra = {t: take(t, n, 0 if (rw_hard is not None and TYPES[t]["sec"] == "rw") else None)
             for t, n in plan.get("extra", {}).items()}
    report = {t: {"need": need[t], "hard": used_h[t], "medium": used_m[t],
                  "hard_left": len(hard_pool[t]), "medium_left": len(med_pool[t])} for t in need}

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
        print(f"  {t:10s} need {r['need']:3d}  hard {r['hard']:3d}  medium {r['medium']:3d}  | left in bank: hard {r['hard_left']}, medium {r['medium_left']}")


if __name__ == "__main__":
    main(sys.argv[1])

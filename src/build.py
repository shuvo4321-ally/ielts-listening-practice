import json, os, re, shutil, sys
from content_test import TEST
from content_patterns import PATTERNS, TECH

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "index.html")  # repo root, served by GitHub Pages
problems = []


def qnums(q):
    return q["n"] if isinstance(q["n"], list) else [q["n"]]


def check_unit(name, lines, groups, para=(), get=None):
    texts = [l["t"] for l in lines if "t" in l]
    for s in para:
        if not any(s in t for t in texts):
            problems.append(f"{name}: green highlight not found in script: {s!r}")
    if get is not None and len(get) < 3:
        problems.append(f"{name}: needs at least 3 'what you should get' notes")
    for l in lines:
        if "t" in l and l["s"] not in ("N",) and not l["s"]:
            problems.append(f"{name}: line without speaker")
    for g in groups:
        placeholders = set()
        cells = [c for r in g.get("rows", []) for c in (r if g["layout"] == "table" else r[1:2])]
        for blob in [*cells, *(x.get("t", "") for x in g.get("notes", [])), *g.get("items", [])]:
            placeholders |= {int(x) for x in re.findall(r"\[\[(\d+)\]\]", blob)}
        gap_nums = {q["n"] for q in g["qs"] if q["type"] == "gap"}
        if g["layout"] in ("form", "notes", "gaps", "flow", "table") and placeholders != gap_nums:
            problems.append(f"{name}: placeholders {sorted(placeholders)} != gap questions {sorted(gap_nums)}")
        for q in g["qs"]:
            for kind in ("ev", "trap"):
                for s in q.get(kind, []):
                    if not any(s in t for t in texts):
                        problems.append(f"{name} Q{q['n']}: {kind} not found in script: {s!r}")
            if not q.get("ev"):
                problems.append(f"{name} Q{q['n']}: no evidence")
            if not q.get("why"):
                problems.append(f"{name} Q{q['n']}: no explanation")
            if g["layout"] == "short" and not q.get("stem"):
                problems.append(f"{name} Q{q['n']}: short answer without stem")
            if q["type"] == "mcq" and q["ans"] not in q["opts"]:
                problems.append(f"{name} Q{q['n']}: answer {q['ans']} not an option")
            if q["type"] == "multi" and (len(q["ans"]) != 2 or any(a not in q["opts"] for a in q["ans"])):
                problems.append(f"{name} Q{q['n']}: bad multi answer")
            if q["type"] == "select":
                letters = g.get("letters") or list(g.get("opts", {}).keys())
                if q["ans"] not in letters:
                    problems.append(f"{name} Q{q['n']}: answer {q['ans']} not in {letters}")
            if q["type"] == "gap" and not q.get("code") and "lim" not in q:
                problems.append(f"{name} Q{q['n']}: gap without word limit")


# --- full test
nums = []
for p in TEST["parts"]:
    check_unit(f"Test part {p['n']}", p["lines"], p["groups"], p.get("para", []), p.get("get"))
    for g in p["groups"]:
        for q in g["qs"]:
            nums += qnums(q)
            if not q.get("pat"):
                problems.append(f"Test Q{q['n']}: no pattern link")
            elif q["pat"] not in {x["id"] for x in PATTERNS}:
                problems.append(f"Test Q{q['n']}: unknown pattern {q['pat']}")
if sorted(nums) != list(range(1, 41)):
    problems.append(f"Test question numbers are not exactly 1-40: {sorted(nums)}")

# --- patterns
ids = [p["id"] for p in PATTERNS]
if ids != [f"p{i}" for i in range(1, 25)]:
    problems.append(f"Pattern ids out of order: {ids}")
for p in PATTERNS:
    check_unit(f"Pattern {p['id']}", p["lines"], p["groups"], p.get("para", []), p.get("get"))
    for k in ("tech", "same", "title", "tag", "get"):
        if not p.get(k):
            problems.append(f"Pattern {p['id']}: missing {k}")

# --- technique drills
d = TECH["distractor"]
for kind in ("ev", "trap"):
    for s in d["q"].get(kind, []):
        if not any(s in l["t"] for l in d["lines"]):
            problems.append(f"Technique distractor: {kind} not in script: {s!r}")
for key in ("predict", "signposts"):
    for it in TECH[key]["items"]:
        if it["ans"] not in TECH[key]["options"]:
            problems.append(f"Technique {key}: answer {it['ans']!r} not an option")

if problems:
    print("CONTENT PROBLEMS:")
    for x in problems:
        print("  -", x)
    sys.exit(1)

# --- assemble
data = json.dumps(dict(TEST=TEST, PATTERNS=PATTERNS, TECH=TECH), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
shell = open(os.path.join(HERE, "shell.html"), encoding="utf-8").read()
app = open(os.path.join(HERE, "app.js"), encoding="utf-8").read()
cut = shell.index("</style>") + len("</style>")  # title, fonts and CSS go in <head>
head, body = shell[:cut], shell[cut:].strip()
page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<meta name="description" content="IELTS Listening practice: technique, a full 40-question test and 24 patterns, read aloud.">\n'
        + head + "\n</head>\n<body>\n" + body + "\n<script>window.LAB=" + data + ";</script>\n<script>\n" + app + "\n</script>\n</body>\n</html>\n")
open(OUT, "w", encoding="utf-8").write(page)

total_pq = sum(len(qnums(q)) for p in PATTERNS for g in p["groups"] for q in g["qs"])
print(f"OK  content valid: 40 test questions, {len(PATTERNS)} patterns ({total_pq} questions), "
      f"{len(TECH['predict']['items']) + len(TECH['signposts']['items']) + len(TECH['dictation']) + 1 + len(TECH['limits']['items'])} technique items")
print(f"OK  page written: {len(page)//1024} KB")

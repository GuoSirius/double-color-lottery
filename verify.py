"""Web 接口端到端验证脚本（不依赖第三方库）。"""
import json
import urllib.request

BASE = "http://127.0.0.1:8765"
ok = True


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def post(path, payload):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def check(name, cond, extra=""):
    global ok
    print(("  OK   " if cond else "  FAIL ") + name + ("  " + extra if extra else ""))
    if not cond:
        ok = False


# 1) 首页
with urllib.request.urlopen(BASE + "/", timeout=20) as r:
    html = r.read().decode("utf-8")
check("GET /  返回首页", r.status == 200 and "双色球智能选号" in html, f"{len(html)} 字节")
check("首页含新策略卡片", 'data-s="zone"' in html and 'data-s="spread"' in html)
check("首页含保底开关", 'id="tgCover"' in html and 'id="tgShape"' in html)
check("首页含回测面板", 'id="btBtn"' in html and 'id="btCard"' in html)

# 2) 走势
t = get("/api/trend")
check("GET /api/trend", t.get("ok") is True, f"{t.get('n')} 期")
check("  返回形态统计", "shape" in t and "sum" in t["shape"], f"和值均值 {t['shape']['sum']['mean']}")
check("  返回过滤边界", "bounds" in t, f"和值 {t['bounds']['sum']}")
check("  返回最新期", t.get("latest") is not None,
      f"{t['latest']['issue']} 蓝 {t['latest']['blue']:02d}")
check("  返回 6 种策略", len(t.get("strategies", [])) == 6)
blues = [v["freq"] for v in t["blue"].values()]
check("  蓝球分布均匀（数据未错列）", max(blues) < t["n"] / 16 * 2.2,
      f"最高 {max(blues)} 次 / 期望 {t['n']/16:.1f}")

# 3) 生成 - 各策略
for s in ("random", "hot", "cold", "balanced", "zone", "spread"):
    g = post("/api/generate", {"strategy": s, "count": 5})
    valid = g.get("ok") and len(g["numbers"]) == 5 and all(
        len(set(x["reds"])) == 6 and 1 <= x["blue"] <= 16 for x in g["numbers"]
    )
    check(f"POST /api/generate  策略 {s}", valid)

# 4) 形态字段
g = post("/api/generate", {"strategy": "balanced", "count": 3})
check("  号码含形态指标", all("shape" in x and "ac" in x["shape"] for x in g["numbers"]),
      str(g["numbers"][0]["shape"]))

# 5) 蓝球全覆盖
g = post("/api/generate", {"strategy": "spread", "count": 16,
                           "blueCover": True, "shapeFilter": True})
covered = len({x["blue"] for x in g["numbers"]})
check("  蓝球全覆盖 16 注", covered == 16 and g["guaranteeRate"] == 1.0,
      f"覆盖 {covered}/16, 保底率 {g['guaranteeRate']}")

g8 = post("/api/generate", {"strategy": "balanced", "count": 8, "blueCover": True})
check("  蓝球部分覆盖 8 注", len({x["blue"] for x in g8["numbers"]}) == 8
      and abs(g8["guaranteeRate"] - 0.5) < 1e-9, f"保底率 {g8['guaranteeRate']}")

# 6) 形态过滤生效
g = post("/api/generate", {"strategy": "random", "count": 20, "shapeFilter": True})
lo, hi = t["bounds"]["sum"]
check("  形态过滤：和值全部在区间内",
      all(lo <= x["shape"]["sum"] <= hi for x in g["numbers"]), f"区间 {lo}-{hi}")

# 7) 回测
b = post("/api/backtest", {"strategy": "random", "count": 5, "periods": 100})
check("POST /api/backtest  基础", b.get("ok") and b["periods_tested"] > 0,
      f"{b['periods_tested']} 期, 期命中率 {b['period_hit_rate']:.1%}")

b2 = post("/api/backtest", {"strategy": "balanced", "count": 16,
                            "periods": 100, "blueCover": True})
check("  ★ 蓝球全覆盖回测期命中率 = 100%", b2["period_hit_rate"] == 1.0,
      f"实测 {b2['period_hit_rate']:.1%}, 奖级 {b2['levels']}")

print("\n" + ("ALL_OK" if ok else "HAS_FAILURE"))

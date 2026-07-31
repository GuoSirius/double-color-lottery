# 等效性校验（Python 侧）：用 py/ssq.py 跑同一份数据，输出规范化签名
import json, sys, random, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "py"))
from ssq import TrendAnalyzer, generate_numbers, load_history

DATA = os.path.join(os.path.dirname(__file__), "..", "data", "sample_history.csv")
draws = load_history(DATA)
ta = TrendAnalyzer(draws)
red_freq = ta.red_frequency()
blue_freq = ta.blue_frequency()
bounds = ta.shape_bounds()
st = ta.shape_stats()
last = draws[-1]

trend_sig = {
    "n": ta.n,
    "latest": [last.issue, last.date, sorted(last.reds), last.blue],
    "red_freq_sum": sum(red_freq.values()),
    "blue_freq_sum": sum(blue_freq.values()),
    "hot_top5": sorted(red_freq.items(), key=lambda kv: -kv[1])[:5],
    "bounds": {k: bounds[k] for k in ["sum_min", "sum_max", "span_min", "span_max", "max_consecutive", "min_ac"]},
    "shape_sum_mean": st["sum"]["mean"],
    "odd_ok": sorted(bounds["odd_ok"]),
    "big_ok": sorted(bounds["big_ok"]),
}
print("TREND_SIG=" + json.dumps(trend_sig, sort_keys=True, ensure_ascii=False))

# 同种子下，py(Mersenne Twister) 与 node(mulberry32) 必然不同 —— 证明随机部分不跨版本一致
random.seed(1)
g = generate_numbers(DATA, strategy="random", count=3)
print("GEN_PY_SEEDED=" + json.dumps([[sorted(x.reds), x.blue] for x in g], ensure_ascii=False))

"""
双色球走势分析与智能选号引擎
================================

设计说明
--------
本模块把"双色球选号"拆成三层：
  1. 数据层  (Draw)         —— 一条开奖记录：期号、日期、6 个红球、1 个蓝球
  2. 分析层  (TrendAnalyzer) —— 基于历史记录计算走势指标（频率 / 遗漏 / 冷热 / 区间）
  3. 生成层  (NumberGenerator) —— 依据指标权重或纯随机，生成指定注数的号码

重要且诚实的提醒
----------------
双色球每期开奖是**独立**的均匀随机抽样，过去号码不影响未来结果。
本工具提供的"走势分析"与"加权选号"只是一种**按统计偏好生成号码**的
娱乐/参考方法，**并不会提高中奖概率**。请理性购彩，量力而行。

规则常量
--------
  红球：1-33，选 6 个，不重复
  蓝球：1-16，选 1 个
"""

from __future__ import annotations

import csv
import json
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

# ---------- 规则常量 ----------
RED_MIN, RED_MAX = 1, 33
BLUE_MIN, BLUE_MAX = 1, 16
RED_PICK = 6
BLUE_PICK = 1

RED_RANGE = list(range(RED_MIN, RED_MAX + 1))
BLUE_RANGE = list(range(BLUE_MIN, BLUE_MAX + 1))


# ---------- 数据层 ----------
@dataclass
class Draw:
    """一条双色球开奖记录。"""

    issue: str          # 期号，如 "2026087"
    date: str          # 开奖日期，如 "2026-07-28"
    reds: List[int]    # 6 个红球，1-33，建议升序
    blue: int          # 1 个蓝球，1-16

    def reds_sorted(self) -> List[int]:
        return sorted(self.reds)

    def formatted(self) -> str:
        r = " ".join(f"{n:02d}" for n in sorted(self.reds))
        return f"{r}  + {self.blue:02d}"


def _to_ints(cell: str) -> List[int]:
    """把 '01,05,06' 或 '01 05 06' 解析成 int 列表。"""
    return [int(x) for x in str(cell).replace(",", " ").split() if x.strip()]


def parse_draw(row: Dict[str, str]) -> Draw:
    """
    从一行 dict 解析出 Draw，兼容多种 CSV 列命名：
      issue / 期号
      date  / 日期 / 开奖日期
      red   / 红球 / 红球号码   （"01,05,06,10,12,23"）
      blue  / 蓝球 / 蓝球号码
    也支持拆列写法：red1..red6 + blue
    """
    issue = row.get("issue") or row.get("期号") or ""
    date = row.get("date") or row.get("日期") or row.get("开奖日期") or ""

    if row.get("red") or row.get("红球") or row.get("红球号码"):
        reds = _to_ints(row.get("red") or row.get("红球") or row.get("红球号码"))
    else:
        reds = [_to_ints(row[f"red{i}"])[0] for i in range(1, RED_PICK + 1)]

    blue = int((row.get("blue") or row.get("蓝球") or row.get("蓝球号码")).strip())
    return Draw(issue=issue, date=date, reds=reds, blue=blue)


def load_history(path: str) -> List[Draw]:
    """从 CSV 读取历史开奖数据。"""
    draws: List[Draw] = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # 跳过空行
            if not any(v and v.strip() for v in row.values()):
                continue
            draws.append(parse_draw(row))
    # 按开奖日期升序排列（无日期时按期号）
    draws.sort(key=lambda d: (d.date or "", d.issue or ""))
    return draws


# ---------- 形态指标层 ----------
# 单注红球的「形态」特征。真实开奖号码在这些维度上呈现明显的集中分布，
# 而纯随机生成常常落在极端区（例如和值 30 或 180、6 个全奇、6 连号）。
# 用形态过滤剔除极端组合，不能提高中奖概率，但能：
#   1) 让号码更「像」真实开奖（心理上更舒服）
#   2) 明显降低与他人撞号导致奖金被摊薄的概率

def red_sum(reds: Sequence[int]) -> int:
    """和值：6 个红球之和。理论范围 21-183，实际集中在 90-120。"""
    return sum(reds)


def odd_count(reds: Sequence[int]) -> int:
    """奇数个数。真实开奖最常见 3 奇 3 偶 / 2:4 / 4:2。"""
    return sum(1 for r in reds if r % 2 == 1)


def big_count(reds: Sequence[int]) -> int:
    """大号个数（>=17）。常见 3 大 3 小。"""
    return sum(1 for r in reds if r >= 17)


def consecutive_pairs(reds: Sequence[int]) -> int:
    """连号对数：相邻两号差 1 的对数。如 [3,4,5] 计 2 对。"""
    s = sorted(reds)
    return sum(1 for a, b in zip(s, s[1:]) if b - a == 1)


def span(reds: Sequence[int]) -> int:
    """跨度：最大号 - 最小号。真实开奖多在 20-30。"""
    return max(reds) - min(reds)


def ac_value(reds: Sequence[int]) -> int:
    """
    AC 值（离散度）：所有两两正差值去重后的个数，再减去 (个数-1)。
    6 个球最大 AC = 10。AC 越大号码越分散，越小说明号码扎堆。
    真实开奖 AC 值多在 5-9。
    """
    s = sorted(reds)
    diffs = {abs(a - b) for i, a in enumerate(s) for b in s[i + 1:]}
    return len(diffs) - (len(s) - 1)


def zone_pattern(reds: Sequence[int]) -> Tuple[int, int, int]:
    """区间比：(01-11 区个数, 12-22 区个数, 23-33 区个数)。"""
    z = [0, 0, 0]
    for r in reds:
        if r <= 11:
            z[0] += 1
        elif r <= 22:
            z[1] += 1
        else:
            z[2] += 1
    return tuple(z)  # type: ignore[return-value]


def shape_of(reds: Sequence[int]) -> Dict[str, object]:
    """一次性返回一注红球的全部形态指标。"""
    return {
        "sum": red_sum(reds),
        "odd": odd_count(reds),
        "even": len(reds) - odd_count(reds),
        "big": big_count(reds),
        "small": len(reds) - big_count(reds),
        "consecutive": consecutive_pairs(reds),
        "span": span(reds),
        "ac": ac_value(reds),
        "zone": zone_pattern(reds),
    }


# ---------- 奖级判定 ----------
# 双色球中奖规则（红球命中数, 蓝球是否命中） -> 奖级
# 一/二等奖为浮动奖，这里用常见量级做估值，仅用于回测的收益参考。
PRIZE_TABLE: Dict[Tuple[int, bool], Tuple[int, str, int]] = {
    (6, True): (1, "一等奖", 5_000_000),
    (6, False): (2, "二等奖", 150_000),
    (5, True): (3, "三等奖", 3_000),
    (5, False): (4, "四等奖", 200),
    (4, True): (4, "四等奖", 200),
    (4, False): (5, "五等奖", 10),
    (3, True): (5, "五等奖", 10),
    (2, True): (6, "六等奖", 5),
    (1, True): (6, "六等奖", 5),
    (0, True): (6, "六等奖", 5),
}

TICKET_PRICE = 2


def judge(ticket: Draw, actual: Draw) -> Tuple[int, str, int]:
    """
    对一注号码判奖。返回 (奖级, 奖级名, 奖金)。未中奖返回 (0, "未中奖", 0)。
    """
    hit_red = len(set(ticket.reds) & set(actual.reds))
    hit_blue = ticket.blue == actual.blue
    return PRIZE_TABLE.get((hit_red, hit_blue), (0, "未中奖", 0))


# ---------- 分析层 ----------
class TrendAnalyzer:
    """
    基于历史开奖数据计算走势指标。

    指标说明
    --------
    - 频率(freq)：某号码在历史中出现的次数。出现越多 => 越「热」。
    - 遗漏(omission)：距离最近一次出现已经过去多少期。遗漏越大 => 越「冷」。
    - 冷热标签：按频率把号码分为 热 / 温 / 冷 三档（按分位）。
    - 区间分布：红球 33 个均分 3 区（01-11 / 12-22 / 23-33），统计各区出现占比。
    """

    def __init__(self, draws: List[Draw]):
        if not draws:
            raise ValueError("历史数据为空，无法分析走势。")
        self.draws = draws
        self.n = len(draws)

    # ---- 频率 ----
    def red_frequency(self) -> Dict[int, int]:
        c = Counter()
        for d in self.draws:
            c.update(d.reds)
        return dict(c)

    def blue_frequency(self) -> Dict[int, int]:
        c = Counter(d.blue for d in self.draws)
        return dict(c)

    # ---- 遗漏（当前最新一期仍未出现的期数）----
    def red_omission(self) -> Dict[int, int]:
        last_seen = {}
        for idx, d in enumerate(self.draws):
            for r in d.reds:
                last_seen[r] = idx  # 记录最近出现的序号
        return {r: (self.n - 1 - last_seen.get(r, -1)) for r in RED_RANGE}

    def blue_omission(self) -> Dict[int, int]:
        last_seen = {}
        for idx, d in enumerate(self.draws):
            last_seen[d.blue] = idx
        return {b: (self.n - 1 - last_seen.get(b, -1)) for b in BLUE_RANGE}

    # ---- 冷热分档（按频率三等分）----
    def red_tier(self) -> Dict[int, str]:
        freq = self.red_frequency()
        vals = sorted(freq.values())
        q1 = vals[len(vals) // 3]
        q2 = vals[(2 * len(vals)) // 3]
        out = {}
        for r in RED_RANGE:
            fv = freq.get(r, 0)
            out[r] = "热" if fv >= q2 else ("温" if fv >= q1 else "冷")
        return out

    # ---- 区间分布 ----
    def zone_distribution(self) -> Dict[str, float]:
        counts = Counter()
        for d in self.draws:
            for r in d.reds:
                if r <= 11:
                    counts["01-11"] += 1
                elif r <= 22:
                    counts["12-22"] += 1
                else:
                    counts["23-33"] += 1
        total = sum(counts.values()) or 1
        return {k: counts.get(k, 0) / total for k in ("01-11", "12-22", "23-33")}

    # ---- 生成权重（供加权抽样）----
    def weights(
        self, mode: str = "hot"
    ) -> Tuple[Dict[int, float], Dict[int, float]]:
        """
        返回 (红球权重, 蓝球权重)。mode 取值：
          hot        —— 频率越高权重越大（追热）
          cold       —— 遗漏越大权重越大（博冷）
          balanced   —— 频率与遗漏综合（冷热均衡）
          frequency  —— 同 hot
          omission   —— 同 cold
        """
        rf, bf = self.red_frequency(), self.blue_frequency()
        ro, bo = self.red_omission(), self.blue_omission()

        def build(freq: Dict[int, int], omis: Dict[int, int], pool: Sequence[int]):
            w: Dict[int, float] = {}
            for x in pool:
                f = freq.get(x, 0)
                o = omis.get(x, self.n)  # 从未出现过的，遗漏视为最大
                if mode in ("hot", "frequency"):
                    w[x] = f + 1.0          # +1 平滑，避免 0 权重
                elif mode in ("cold", "omission"):
                    w[x] = (o + 1.0) ** 1.3  # 遗漏放大，越冷越想选
                else:  # balanced
                    w[x] = (f + 1.0) * (o + 1.0) ** 0.5
            return w

        red_w = build(rf, ro, RED_RANGE)
        blue_w = build(bf, bo, BLUE_RANGE)
        return red_w, blue_w

    # ---- 形态统计（基于真实历史）----
    def shape_stats(self) -> Dict[str, object]:
        """
        统计历史开奖在各形态维度上的真实分布，用于：
          1) 展示给用户看「真实号码长什么样」
          2) 生成形态过滤区间（shape_bounds）
        """
        sums = [red_sum(d.reds) for d in self.draws]
        odds = Counter(odd_count(d.reds) for d in self.draws)
        bigs = Counter(big_count(d.reds) for d in self.draws)
        cons = Counter(consecutive_pairs(d.reds) for d in self.draws)
        spans = [span(d.reds) for d in self.draws]
        acs = Counter(ac_value(d.reds) for d in self.draws)
        zones = Counter(zone_pattern(d.reds) for d in self.draws)

        def pct(vals: List[int], p: float) -> int:
            s = sorted(vals)
            idx = min(len(s) - 1, max(0, int(round(p * (len(s) - 1)))))
            return s[idx]

        return {
            "n": self.n,
            "sum": {
                "mean": round(sum(sums) / len(sums), 1),
                "min": min(sums),
                "max": max(sums),
                "p10": pct(sums, 0.10),
                "p90": pct(sums, 0.90),
            },
            "span": {
                "mean": round(sum(spans) / len(spans), 1),
                "p10": pct(spans, 0.10),
                "p90": pct(spans, 0.90),
            },
            "odd_dist": dict(sorted(odds.items())),
            "big_dist": dict(sorted(bigs.items())),
            "consecutive_dist": dict(sorted(cons.items())),
            "ac_dist": dict(sorted(acs.items())),
            "top_zone_patterns": [
                {"pattern": "-".join(map(str, k)), "count": v}
                for k, v in zones.most_common(5)
            ],
        }

    def shape_bounds(self, coverage: float = 0.80) -> Dict[str, object]:
        """
        根据历史分布推导形态过滤边界（默认覆盖中间 80% 的真实开奖）。
        返回的边界用于 is_typical()。
        """
        st = self.shape_stats()
        sums = [red_sum(d.reds) for d in self.draws]
        spans_ = [span(d.reds) for d in self.draws]
        tail = (1.0 - coverage) / 2.0

        def pct(vals: List[int], p: float) -> int:
            s = sorted(vals)
            idx = min(len(s) - 1, max(0, int(round(p * (len(s) - 1)))))
            return s[idx]

        # 奇偶 / 大小：保留累计占比 >= coverage 的高频取值
        def common_keys(dist: Dict[int, int]) -> set:
            total = sum(dist.values()) or 1
            acc, keep = 0, set()
            for k, v in sorted(dist.items(), key=lambda kv: kv[1], reverse=True):
                keep.add(k)
                acc += v
                if acc / total >= coverage:
                    break
            return keep

        return {
            "sum_min": pct(sums, tail),
            "sum_max": pct(sums, 1 - tail),
            "span_min": pct(spans_, tail),
            "span_max": pct(spans_, 1 - tail),
            "odd_ok": common_keys(st["odd_dist"]),          # type: ignore[arg-type]
            "big_ok": common_keys(st["big_dist"]),          # type: ignore[arg-type]
            "max_consecutive": max(common_keys(st["consecutive_dist"])),  # type: ignore[arg-type]
            "min_ac": min(common_keys(st["ac_dist"])),      # type: ignore[arg-type]
        }

    def is_typical(self, reds: Sequence[int], bounds: Optional[Dict[str, object]] = None) -> bool:
        """判断一注红球是否落在「真实开奖的典型形态区间」内。"""
        b = bounds if bounds is not None else self.shape_bounds()
        s = red_sum(reds)
        if not (b["sum_min"] <= s <= b["sum_max"]):        # type: ignore[operator]
            return False
        sp = span(reds)
        if not (b["span_min"] <= sp <= b["span_max"]):     # type: ignore[operator]
            return False
        if odd_count(reds) not in b["odd_ok"]:             # type: ignore[operator]
            return False
        if big_count(reds) not in b["big_ok"]:             # type: ignore[operator]
            return False
        if consecutive_pairs(reds) > b["max_consecutive"]:  # type: ignore[operator]
            return False
        if ac_value(reds) < b["min_ac"]:                   # type: ignore[operator]
            return False
        return True

    def summary(self) -> str:
        """返回一段人类可读的走势摘要。"""
        rf = self.red_frequency()
        ro = self.red_omission()
        hot = sorted(rf.items(), key=lambda kv: kv[1], reverse=True)[:6]
        cold = sorted(ro.items(), key=lambda kv: kv[1], reverse=True)[:6]
        zones = self.zone_distribution()
        st = self.shape_stats()
        sm = st["sum"]           # type: ignore[index]
        odd = st["odd_dist"]     # type: ignore[index]
        top_zone = st["top_zone_patterns"]  # type: ignore[index]
        lines = [
            f"分析基于 {self.n} 期历史数据",
            "红球热号(高频): " + ", ".join(f"{n:02d}({c})" for n, c in hot),
            "红球冷号(高遗漏): " + ", ".join(f"{n:02d}(遗漏{c})" for n, c in cold),
            "红球区间分布: " + " / ".join(f"{k} {v:.0%}" for k, v in zones.items()),
            f"和值: 均值 {sm['mean']}，中间80%区间 {sm['p10']}-{sm['p90']}",  # type: ignore[index]
            "奇偶比分布: " + ", ".join(f"{k}奇{6-k}偶×{v}" for k, v in odd.items()),  # type: ignore[union-attr]
            "常见区间形态: " + ", ".join(f"{z['pattern']}({z['count']})" for z in top_zone[:3]),  # type: ignore[index]
        ]
        return "\n".join(lines)


# ---------- 生成层 ----------
def _weighted_sample(population: Sequence[int], weights: Sequence[float], k: int) -> List[int]:
    """
    带权重的无放回抽样（Efraimidis–Spirakis 精确算法）。
    对每个元素生成 key = u^(1/w)，取 key 最大的 k 个。
    权重 <=0 会被平滑为极小值。
    """
    eps = 1e-9
    chosen: List[Tuple[float, int]] = []
    for x, w in zip(population, weights):
        w = max(w, eps)
        key = random.random() ** (1.0 / w)
        chosen.append((key, x))
    chosen.sort(key=lambda t: t[0], reverse=True)
    return [x for _, x in chosen[:k]]


STRATEGIES = ("random", "hot", "cold", "balanced", "zone", "spread")

STRATEGY_DESC = {
    "random": "纯随机 —— 与机选等价，数学上最公平",
    "hot": "追热 —— 高频号码权重更大",
    "cold": "博冷 —— 高遗漏号码权重更大",
    "balanced": "均衡 —— 频率与遗漏综合加权",
    "zone": "分区 —— 三个区间各取 2 个，贴合最常见的 2-2-2 形态",
    "spread": "分散 —— 压低热门号与生日号(≤31)权重，降低撞号被摊薄奖金的概率",
}


class NumberGenerator:
    """号码生成引擎。"""

    def __init__(self, analyzer: Optional[TrendAnalyzer] = None):
        self.analyzer = analyzer
        self._bounds: Optional[Dict[str, object]] = None

    # ---- 纯随机 ----
    def random_draw(self) -> Draw:
        reds = sorted(random.sample(RED_RANGE, RED_PICK))
        blue = random.choice(BLUE_RANGE)
        return Draw(issue="", date="", reds=reds, blue=blue)

    # ---- 加权随机（基于走势）----
    def weighted_draw(self, mode: str = "hot") -> Draw:
        if self.analyzer is None:
            raise ValueError("加权选号需要历史数据（TrendAnalyzer）。")
        red_w, blue_w = self.analyzer.weights(mode)
        reds = _weighted_sample(RED_RANGE, [red_w[r] for r in RED_RANGE], RED_PICK)
        blue = _weighted_sample(BLUE_RANGE, [blue_w[b] for b in BLUE_RANGE], BLUE_PICK)[0]
        return Draw(issue="", date="", reds=sorted(reds), blue=blue)

    # ---- 分区选号：三区各 2 个 ----
    def zone_draw(self) -> Draw:
        """
        红球按 01-11 / 12-22 / 23-33 三区，每区取 2 个。
        2-2-2 是历史上出现频率最高的区间形态之一，可避免「6 个全挤在一区」的极端组合。
        """
        zones = (RED_RANGE[0:11], RED_RANGE[11:22], RED_RANGE[22:33])
        if self.analyzer is not None:
            red_w, blue_w = self.analyzer.weights("balanced")
        else:
            red_w = {r: 1.0 for r in RED_RANGE}
            blue_w = {b: 1.0 for b in BLUE_RANGE}
        reds: List[int] = []
        for z in zones:
            reds += _weighted_sample(z, [red_w[r] for r in z], 2)
        blue = _weighted_sample(BLUE_RANGE, [blue_w[b] for b in BLUE_RANGE], 1)[0]
        return Draw(issue="", date="", reds=sorted(reds), blue=blue)

    # ---- 分散选号：避开大众号 ----
    def spread_draw(self) -> Draw:
        """
        「反大众」策略。中奖概率与随机完全相同，但一旦中大奖，
        被平分奖金的人数期望更少 —— 这是唯一能真实提升「到手金额」的合法手段。

        权重设计：
          - 1-31（生日号）降权 0.65：大量彩民用生日选号
          - 历史高频号降权：热号是大众心理偏好
          - 连号惩罚在采样后校验
        """
        w: Dict[int, float] = {}
        freq = self.analyzer.red_frequency() if self.analyzer else {}
        max_f = max(freq.values()) if freq else 1
        for r in RED_RANGE:
            base = 1.0
            if r <= 31:
                base *= 0.65                     # 生日号降权
            f = freq.get(r, 0) / max_f if max_f else 0
            base *= (1.35 - 0.7 * f)             # 越热越降权
            w[r] = base
        reds = _weighted_sample(RED_RANGE, [w[r] for r in RED_RANGE], RED_PICK)
        # 蓝球同理：避开 1-12（月份/生日）
        bw = {b: (0.7 if b <= 12 else 1.4) for b in BLUE_RANGE}
        blue = _weighted_sample(BLUE_RANGE, [bw[b] for b in BLUE_RANGE], 1)[0]
        return Draw(issue="", date="", reds=sorted(reds), blue=blue)

    # ---- 单注分发 ----
    def _one(self, strategy: str) -> Draw:
        if strategy == "random":
            return self.random_draw()
        if strategy == "zone":
            return self.zone_draw()
        if strategy == "spread":
            return self.spread_draw()
        return self.weighted_draw(strategy)

    # ---- 蓝球覆盖序列 ----
    def _blue_sequence(self, count: int) -> List[int]:
        """
        生成长度为 count 的蓝球序列，保证在前 min(count,16) 注中蓝球互不重复。

        ★ 这是本工具唯一「数学上确定」的提升：
          买满 16 注并覆盖全部蓝球 => 每期必定至少命中 1 注六等奖（5 元）。
          成本 32 元，保底回 5 元 —— 是「必中」而非「赚钱」，请务必看清。
        """
        pool = BLUE_RANGE[:]
        if self.analyzer is not None:
            # 优先安排遗漏较大 / 频率较低的蓝球（纯偏好，不改变概率）
            bo = self.analyzer.blue_omission()
            pool.sort(key=lambda b: -bo.get(b, 0))
            head = pool[:8]
            tail = pool[8:]
            random.shuffle(head)
            random.shuffle(tail)
            pool = head + tail
        else:
            random.shuffle(pool)
        seq: List[int] = []
        while len(seq) < count:
            chunk = pool[:]
            if seq:  # 第二轮起重新打乱，避免固定循环
                random.shuffle(chunk)
            seq += chunk
        return seq[:count]

    # ---- 统一入口 ----
    def generate(
        self,
        count: int = 5,
        strategy: str = "random",
        dedupe: bool = True,
        blue_cover: bool = False,
        shape_filter: bool = False,
    ) -> List[Draw]:
        """
        生成 count 注号码。

        参数
        ----
        strategy     : random | hot | cold | balanced | zone | spread
        dedupe       : 多注之间整注去重
        blue_cover   : 蓝球轮询覆盖。买满 16 注即可保证每期至少中 1 注六等奖
        shape_filter : 只保留落在历史典型形态区间内的组合（需历史数据）
        """
        if strategy not in STRATEGIES:
            raise ValueError(f"未知策略 {strategy!r}，可选：{list(STRATEGIES)}")
        if count <= 0:
            raise ValueError("注数必须为正整数。")
        if shape_filter and self.analyzer is None:
            raise ValueError("形态过滤需要历史数据。")

        bounds = None
        if shape_filter:
            if self._bounds is None:
                self._bounds = self.analyzer.shape_bounds()  # type: ignore[union-attr]
            bounds = self._bounds

        out: List[Draw] = []
        seen = set()
        attempts = 0
        max_attempts = count * 200 + 500

        while len(out) < count and attempts < max_attempts:
            attempts += 1
            d = self._one(strategy)
            if bounds is not None and not self.analyzer.is_typical(d.reds, bounds):  # type: ignore[union-attr]
                continue
            key = (tuple(d.reds), d.blue)
            if dedupe and key in seen:
                continue
            seen.add(key)
            out.append(d)

        # 兜底补齐（形态过滤过严或去重空间不足时）
        while len(out) < count:
            out.append(self._one(strategy))

        # 蓝球覆盖：在红球生成完成后统一改写蓝球
        if blue_cover:
            seq = self._blue_sequence(len(out))
            for d, b in zip(out, seq):
                d.blue = b
        return out


# ---------- 回测层 ----------
def backtest(
    draws: List[Draw],
    count: int = 5,
    strategy: str = "random",
    periods: int = 100,
    blue_cover: bool = False,
    shape_filter: bool = False,
    min_train: int = 50,
    seed: Optional[int] = None,
) -> Dict[str, object]:
    """
    走查式（walk-forward）回测：绝不使用未来数据。

    对倒数 periods 期中的每一期 i：
      1) 只用第 i 期**之前**的历史构建分析器
      2) 生成 count 注号码
      3) 与第 i 期真实开奖对奖

    返回聚合统计：期命中率、注命中率、各奖级次数、总投入/总回报/ROI。

    ⚠️ 请注意：ROI 长期必然为负（双色球返奖率约 50%）。
       回测的价值在于**验证保底策略是否真的保底**，而不是寻找「必胜法」。
    """
    if seed is not None:
        random.seed(seed)
    if len(draws) <= min_train:
        raise ValueError(f"历史数据不足，至少需要 {min_train + 1} 期。")

    start = max(min_train, len(draws) - periods)
    tested = 0
    hit_periods = 0
    hit_tickets = 0
    level_counter: Counter = Counter()
    total_prize = 0
    total_cost = 0

    for i in range(start, len(draws)):
        history = draws[:i]
        actual = draws[i]
        analyzer = TrendAnalyzer(history)
        gen = NumberGenerator(analyzer)
        try:
            tickets = gen.generate(
                count=count,
                strategy=strategy,
                dedupe=True,
                blue_cover=blue_cover,
                shape_filter=shape_filter,
            )
        except ValueError:
            continue

        tested += 1
        total_cost += count * TICKET_PRICE
        period_hit = False
        for t in tickets:
            lvl, name, prize = judge(t, actual)
            if lvl:
                level_counter[name] += 1
                total_prize += prize
                hit_tickets += 1
                period_hit = True
        if period_hit:
            hit_periods += 1

    return {
        "strategy": strategy,
        "count_per_period": count,
        "blue_cover": blue_cover,
        "shape_filter": shape_filter,
        "periods_tested": tested,
        "periods_hit": hit_periods,
        "period_hit_rate": round(hit_periods / tested, 4) if tested else 0.0,
        "tickets_total": tested * count,
        "tickets_hit": hit_tickets,
        "ticket_hit_rate": round(hit_tickets / (tested * count), 4) if tested else 0.0,
        "levels": {k: level_counter[k] for k in
                   ("一等奖", "二等奖", "三等奖", "四等奖", "五等奖", "六等奖")
                   if level_counter[k]},
        "total_cost": total_cost,
        "total_prize": total_prize,
        "roi": round((total_prize - total_cost) / total_cost, 4) if total_cost else 0.0,
    }


# ---------- 便捷函数 ----------
def generate_numbers(
    history_path: Optional[str] = None,
    count: int = 5,
    strategy: str = "random",
    dedupe: bool = True,
    blue_cover: bool = False,
    shape_filter: bool = False,
) -> List[Draw]:
    """高层封装：给文件路径即可一键生成。无历史数据时只能用 random。"""
    analyzer = None
    if history_path:
        draws = load_history(history_path)
        if draws:
            analyzer = TrendAnalyzer(draws)
    if strategy not in ("random", "spread", "zone") and analyzer is None:
        raise ValueError("使用 hot/cold/balanced 策略需要提供历史数据文件。")
    if shape_filter and analyzer is None:
        raise ValueError("形态过滤需要提供历史数据文件。")
    gen = NumberGenerator(analyzer)
    return gen.generate(
        count=count,
        strategy=strategy,
        dedupe=dedupe,
        blue_cover=blue_cover,
        shape_filter=shape_filter,
    )


if __name__ == "__main__":
    # 模块自测
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    sample = os.path.join(here, "data", "sample_history.csv")
    if os.path.exists(sample):
        draws = load_history(sample)
        ta = TrendAnalyzer(draws)
        print(ta.summary())
        print("\n[示例] 随机 5 注：")
        for d in generate_numbers(sample, count=5, strategy="random"):
            print("  " + d.formatted())
        print("\n[示例] 追热 5 注：")
        for d in generate_numbers(sample, count=5, strategy="hot"):
            print("  " + d.formatted())

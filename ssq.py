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

    def summary(self) -> str:
        """返回一段人类可读的走势摘要。"""
        rf = self.red_frequency()
        ro = self.red_omission()
        hot = sorted(rf.items(), key=lambda kv: kv[1], reverse=True)[:6]
        cold = sorted(ro.items(), key=lambda kv: kv[1], reverse=True)[:6]
        zones = self.zone_distribution()
        lines = [
            f"分析基于 {self.n} 期历史数据",
            "红球热号(高频): " + ", ".join(f"{n:02d}({c})" for n, c in hot),
            "红球冷号(高遗漏): " + ", ".join(f"{n:02d}(遗漏{c})" for n, c in cold),
            "红球区间分布: " + " / ".join(f"{k} {v:.0%}" for k, v in zones.items()),
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


class NumberGenerator:
    """号码生成引擎。"""

    def __init__(self, analyzer: Optional[TrendAnalyzer] = None):
        self.analyzer = analyzer

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

    # ---- 统一入口 ----
    def generate(
        self,
        count: int = 5,
        strategy: str = "random",
        dedupe: bool = True,
    ) -> List[Draw]:
        """
        生成 count 注号码。
          strategy: random | hot | cold | balanced
          dedupe:   多注之间是否整注去重（相同红+蓝视为重复，重新生成）
        """
        valid = {"random", "hot", "cold", "balanced"}
        if strategy not in valid:
            raise ValueError(f"未知策略 {strategy!r}，可选：{sorted(valid)}")
        if count <= 0:
            raise ValueError("注数必须为正整数。")

        out: List[Draw] = []
        seen = set()
        attempts = 0
        max_attempts = count * 50 + 100

        while len(out) < count and attempts < max_attempts:
            attempts += 1
            if strategy == "random":
                d = self.random_draw()
            else:
                d = self.weighted_draw(strategy)
            key = (tuple(sorted(d.reds)), d.blue)
            if dedupe and key in seen:
                continue
            seen.add(key)
            out.append(d)

        if len(out) < count:
            # 去重导致空间不足（极少见），放宽去重补齐
            while len(out) < count:
                d = self.random_draw() if strategy == "random" else self.weighted_draw(strategy)
                out.append(d)
        return out


# ---------- 便捷函数 ----------
def generate_numbers(
    history_path: Optional[str] = None,
    count: int = 5,
    strategy: str = "random",
    dedupe: bool = True,
) -> List[Draw]:
    """高层封装：给文件路径即可一键生成。无历史数据时强制 random。"""
    analyzer = None
    if history_path:
        draws = load_history(history_path)
        if draws:
            analyzer = TrendAnalyzer(draws)
    if strategy != "random" and analyzer is None:
        raise ValueError("使用 hot/cold/balanced 策略需要提供历史数据文件。")
    gen = NumberGenerator(analyzer)
    return gen.generate(count=count, strategy=strategy, dedupe=dedupe)


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

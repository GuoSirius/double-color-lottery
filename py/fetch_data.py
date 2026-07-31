"""
抓取双色球历史开奖数据 -> data/sample_history.csv

数据源：500 彩票网公开历史接口（无需登录、无需 cookie）
用法：
    python fetch_data.py            # 默认抓取最近 200 期
    python fetch_data.py 500        # 抓取最近 500 期

输出 CSV 列：issue,date,red,blue
    red 为 "01,05,06,10,12,23" 形式（逗号分隔、两位补零）
"""

from __future__ import annotations

import csv
import os
import sys
import urllib.request
from html.parser import HTMLParser

BASE_URL = "https://datachart.500.com/ssq/history/newinc/history.php"
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "sample_history.csv")

# HTML 表格行解析：收集每个 <tr> 内的 <td> 文本
class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] = []
        self._in_td = False
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag == "td":
            self._in_td = True
            self._buf = ""

    def handle_endtag(self, tag):
        if tag == "td":
            self._row.append(self._buf.strip())
            self._in_td = False
        elif tag == "tr":
            if self._row:
                self.rows.append(self._row)

    def handle_data(self, data):
        if self._in_td:
            self._buf += data


def _to_ints(cells: list[str]) -> list[int]:
    out = []
    for c in cells:
        c = c.strip()
        if c.isdigit():
            out.append(int(c))
    return out


def parse_rows(html: str) -> list[dict]:
    """
    从 500 历史页 HTML 提取 (issue, date, reds[6], blue)。

    ⚠️ 必须按【列位置】解析，不能按数值范围猜。
    500 历史表每行 16 列，结构固定：
      [0]  期号        26087
      [1]-[6] 红球     04 06 10 18 23 31
      [7]  蓝球        11
      [8]  快乐星期天
      [9]  奖池奖金
      [10] 一等奖注数  [11] 一等奖奖金
      [12] 二等奖注数  [13] 二等奖奖金
      [14] 总投注额
      [15] 开奖日期    2026-07-30

    历史教训：早期版本用「第一个 1-16 之间的数字」当蓝球，
    结果永远取到了第 1 个红球（红球也可能 <=16），
    导致整份数据的蓝球列 = 最小红球，走势分析与回测全部失真。
    """
    p = _TableParser()
    p.feed(html)
    results = []
    for row in p.rows:
        if len(row) < 8:
            continue
        issue = row[0].strip()
        if not (issue.isdigit() and len(issue) >= 5):
            continue

        # --- 严格按位置取号并校验 ---
        red_cells = [c.strip() for c in row[1:7]]
        blue_cell = row[7].strip()
        if not all(c.isdigit() for c in red_cells) or not blue_cell.isdigit():
            continue
        reds = [int(c) for c in red_cells]
        blue = int(blue_cell)

        # 规则校验：红球 6 个互不重复且在 1-33；蓝球在 1-16
        if len(set(reds)) != 6:
            continue
        if not all(1 <= n <= 33 for n in reds):
            continue
        if not (1 <= blue <= 16):
            continue

        date = next((c.strip() for c in row if c.count("-") == 2 and c.strip()[:4].isdigit()), "")
        results.append(
            {
                "issue": issue,
                "date": date,
                "red": ",".join(f"{n:02d}" for n in sorted(reds)),
                "blue": f"{blue:02d}",
            }
        )
    return results


def sanity_check(rows: list[dict]) -> list[str]:
    """
    对抓取结果做数据质量体检，返回告警列表（空列表 = 通过）。
    重点防御「列错位」这类静默数据污染。
    """
    warns: list[str] = []
    if not rows:
        return ["未解析到任何数据"]

    from collections import Counter

    n = len(rows)
    blues = [int(r["blue"]) for r in rows]
    bc = Counter(blues)

    # 1) 蓝球必须覆盖较多号码；若集中在少数几个，说明列取错了
    if n >= 100 and len(bc) < 14:
        warns.append(f"蓝球只出现 {len(bc)}/16 种取值，疑似列错位")

    # 2) 蓝球应近似均匀（期望 n/16）。最大频次远超期望即异常
    exp = n / 16
    if n >= 100 and max(bc.values()) > exp * 2.2:
        top = bc.most_common(1)[0]
        warns.append(f"蓝球 {top[0]:02d} 出现 {top[1]} 次，远超期望 {exp:.1f} 次，疑似列错位")

    # 3) 蓝球不应恒等于最小红球（这正是历史 bug 的特征）
    same = sum(1 for r in rows if int(r["blue"]) == int(r["red"].split(",")[0]))
    if same > n * 0.3:
        warns.append(f"{same}/{n} 期的蓝球等于最小红球，几乎可以断定解析错列")

    # 4) 红球整体频率应接近 n*6/33
    from collections import Counter as C2

    rc = C2()
    for r in rows:
        rc.update(int(x) for x in r["red"].split(","))
    if n >= 100:
        exp_r = n * 6 / 33
        if max(rc.values()) > exp_r * 1.8 or len(rc) < 33:
            warns.append("红球频率分布异常，可能存在数据污染")

    return warns


def fetch(limit: int = 200) -> list[dict]:
    if not (5 <= limit <= 99999):
        raise ValueError(f"历史期数需在 5–99999 期之间（当前请求 {limit}）")
    # 500 接口：start/end 为期号范围，limit 限制条数
    url = f"{BASE_URL}?start=23001&end=26999&limit={limit}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode("gb2312", errors="ignore")
    rows = parse_rows(html)
    # 500 接口默认按【期号降序】返回（最新在前）。
    # 去重（同一期可能因分页边界重复），并保留最新 limit 期。
    seen = set()
    dedup = []
    for r in rows:
        if r["issue"] in seen:
            continue
        seen.add(r["issue"])
        dedup.append(r)
    return dedup[:limit] if limit else dedup


def main() -> int:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    print(f"正在抓取最近 {limit} 期双色球历史数据 ...")
    try:
        rows = fetch(limit)
    except Exception as e:  # noqa: BLE001
        print(f"✗ 抓取失败：{e}")
        print("  可能原因：当前环境无外网访问，或数据源临时不可用。")
        print("  可手动从官网导出历史开奖数据，按 data/sample_history.csv 格式保存后使用。")
        return 1

    if not rows:
        print("✗ 未解析到任何数据，请检查数据源结构是否变化。")
        return 1

    warns = sanity_check(rows)
    if warns:
        print("✗ 数据质量体检未通过，已中止写入（避免污染历史库）：")
        for w in warns:
            print(f"    - {w}")
        return 1
    print("✓ 数据质量体检通过（蓝球分布均匀、红蓝列未错位）")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["issue", "date", "red", "blue"])
        w.writeheader()
        w.writerows(rows)

    print(f"✓ 已写入 {len(rows)} 期到 {OUT_PATH}")
    print("  最近 3 期预览：")
    for r in rows[:3]:
        print(f"    {r['issue']}  {r['date']}  红:{r['red']}  蓝:{r['blue']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

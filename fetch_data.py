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
    """从 500 历史页 HTML 提取 (issue, date, reds[6], blue)。"""
    p = _TableParser()
    p.feed(html)
    results = []
    for row in p.rows:
        # 找到期号单元格：纯数字且长度>=5（如 2026087 / 26087）
        issue = ""
        for cell in row:
            cell = cell.strip()
            if cell.isdigit() and len(cell) >= 5:
                issue = cell
                break
        if not issue:
            continue
        # 取所有数字单元格，跳过期号本身
        nums = _to_ints([c for c in row if c != issue])
        # 红 1-33 共 6 个，蓝 1-16 共 1 个，按出现顺序取
        reds = [n for n in nums if 1 <= n <= 33][:6]
        blues = [n for n in nums if 1 <= n <= 16]
        blue = blues[0] if blues else None
        if len(reds) == 6 and blue is not None:
            date = next((c for c in row if "-" in c and c.count("-") == 2), "")
            results.append(
                {
                    "issue": issue,
                    "date": date,
                    "red": ",".join(f"{n:02d}" for n in sorted(reds)),
                    "blue": f"{blue:02d}",
                }
            )
    return results


def fetch(limit: int = 200) -> list[dict]:
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

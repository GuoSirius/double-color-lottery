"""
双色球选号命令行工具
====================

用法示例
--------
  # 随机生成 5 注（无需历史数据）
  python cli.py -n 5

  # 基于走势"追热"生成 10 注
  python cli.py -n 10 -s hot -d data/sample_history.csv

  # 查看走势摘要 + 冷热均衡生成 8 注
  python cli.py -n 8 -s balanced --summary

  # 生成 20 注并输出 JSON（方便接入其他系统）
  python cli.py -n 20 -s cold --json

参数
----
  -n, --count      注数（默认 5）
  -s, --strategy   策略: random(随机) / hot(追热) / cold(博冷) / balanced(均衡)
  -d, --data       历史数据 CSV 路径（hot/cold/balanced 必填）
  --no-dedupe      关闭整注去重
  --summary        打印走势摘要
  --json           以 JSON 格式输出
  --self-test      运行内置自检
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# 允许直接 `python cli.py` 时找到同目录的 ssq 模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ssq import (  # noqa: E402
    Draw,
    NumberGenerator,
    TrendAnalyzer,
    generate_numbers,
    load_history,
)

STRATEGIES = ("random", "hot", "cold", "balanced")


def _print_table(draws: list[Draw]) -> None:
    print(f"{'注号':<4} {'红球(6)' :<20} 蓝球")
    print("-" * 32)
    for i, d in enumerate(draws, 1):
        reds = " ".join(f"{n:02d}" for n in sorted(d.reds))
        print(f"{i:<4} {reds:<20} {d.blue:02d}")


def _print_summary(analyzer: TrendAnalyzer) -> None:
    print("=" * 40)
    print(analyzer.summary())
    print("=" * 40)


def run_self_test() -> int:
    """内置自检：验证规则与生成正确性。"""
    print("运行自检 ...")
    here = os.path.dirname(os.path.abspath(__file__))
    sample = os.path.join(here, "data", "sample_history.csv")
    if not os.path.exists(sample):
        print("缺少示例数据，跳过数据分析自检。")
        return 1

    draws = load_history(sample)
    assert draws, "历史数据为空"
    ta = TrendAnalyzer(draws)
    gen = NumberGenerator(ta)

    for strat in STRATEGIES:
        for cnt in (1, 5, 20):
            res = gen.generate(count=cnt, strategy=strat, dedupe=True)
            assert len(res) == cnt, f"{strat} 注数不符"
            for d in res:
                assert len(set(d.reds)) == 6, "红球重复"
                assert all(1 <= r <= 33 for r in d.reds), "红球越界"
                assert 1 <= d.blue <= 16, "蓝球越界"

    # 去重校验
    res = gen.generate(count=20, strategy="hot", dedupe=True)
    keys = {(tuple(sorted(d.reds)), d.blue) for d in res}
    assert len(keys) == len(res), "去重失败"

    print("✓ 所有自检通过：规则校验、注数、去重、策略均正常。")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="双色球走势分析与选号工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-n", "--count", type=int, default=5, help="生成注数（默认 5）")
    parser.add_argument(
        "-s", "--strategy", default="random", choices=STRATEGIES,
        help="选号策略: random/hot/cold/balanced",
    )
    parser.add_argument(
        "-d", "--data", default=None,
        help="历史数据 CSV 路径（hot/cold/balanced 需要）",
    )
    parser.add_argument("--no-dedupe", action="store_true", help="关闭整注去重")
    parser.add_argument("--summary", action="store_true", help="打印走势摘要")
    parser.add_argument("--json", action="store_true", help="JSON 格式输出")
    parser.add_argument("--self-test", action="store_true", help="运行内置自检")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    # 解析数据路径（默认指向上级目录的示例）
    data_path = args.data
    if data_path is None and args.strategy != "random":
        here = os.path.dirname(os.path.abspath(__file__))
        default = os.path.join(here, "data", "sample_history.csv")
        if os.path.exists(default):
            data_path = default

    if args.strategy != "random" and not data_path:
        parser.error(f"策略 '{args.strategy}' 需要提供 --data 历史数据文件。")

    try:
        draws = generate_numbers(
            history_path=data_path,
            count=args.count,
            strategy=args.strategy,
            dedupe=not args.no_dedupe,
        )
    except (ValueError, FileNotFoundError) as e:
        print(f"错误：{e}", file=sys.stderr)
        return 1

    if args.summary and data_path:
        try:
            _print_summary(TrendAnalyzer(load_history(data_path)))
        except Exception as e:  # noqa: BLE001
            print(f"（走势摘要生成失败：{e}）", file=sys.stderr)

    if args.json:
        payload = {
            "strategy": args.strategy,
            "count": len(draws),
            "numbers": [
                {"reds": sorted(d.reds), "blue": d.blue} for d in draws
            ],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        label = {
            "random": "纯随机",
            "hot": "追热（高频优先）",
            "cold": "博冷（高遗漏优先）",
            "balanced": "冷热均衡",
        }[args.strategy]
        print(f"\n双色球选号结果 · 策略【{label}】· 共 {len(draws)} 注")
        print("（理性购彩，本结果仅供娱乐参考，不保证中奖）\n")
        _print_table(draws)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

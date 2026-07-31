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

  # ★ 保底模式：16 注覆盖全部蓝球，数学上保证每期至少中 1 注六等奖
  python cli.py -n 16 -s spread --blue-cover --shape-filter

  # 回测：用真实历史验证策略，300 期走查
  python cli.py --backtest -n 16 -s spread --blue-cover --periods 300

  # ★ 手动指定抓取的历史期数（最小 5 期，最大 99999 期），写入默认 data 文件
  python cli.py --history 500
  python cli.py --history 99999

参数
----
  -n, --count      注数（默认 5）
  -s, --strategy   策略: random / hot / cold / balanced / zone / spread
  -d, --data       历史数据 CSV 路径
  --blue-cover     蓝球轮询覆盖（买满 16 注 = 每期必中六等奖）
  --shape-filter   只保留符合历史典型形态的组合
  --no-dedupe      关闭整注去重
  --summary        打印走势摘要
  --shape          打印历史形态统计
  --backtest       运行历史回测
  --periods        回测期数（默认 200）
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
    STRATEGIES,
    STRATEGY_DESC,
    Draw,
    NumberGenerator,
    TrendAnalyzer,
    backtest,
    generate_numbers,
    load_history,
    shape_of,
)


def _default_data() -> str | None:
    here = os.path.dirname(os.path.abspath(__file__))
    p = os.path.join(here, "data", "sample_history.csv")
    return p if os.path.exists(p) else None


def _print_table(draws: list[Draw], show_shape: bool = False) -> None:
    head = f"{'注号':<4} {'红球(6)':<20} 蓝球"
    if show_shape:
        head += f"  {'和值':>4} {'奇偶':>5} {'区间':>7} {'AC':>3}"
    print(head)
    print("-" * (len(head) + 8))
    for i, d in enumerate(draws, 1):
        reds = " ".join(f"{n:02d}" for n in sorted(d.reds))
        line = f"{i:<4} {reds:<20} {d.blue:02d}"
        if show_shape:
            s = shape_of(d.reds)
            zone = "-".join(map(str, s["zone"]))  # type: ignore[arg-type]
            line += f"  {s['sum']:>4} {s['odd']}奇{s['even']}偶 {zone:>7} {s['ac']:>3}"
        print(line)


def _print_summary(analyzer: TrendAnalyzer) -> None:
    print("=" * 52)
    print(analyzer.summary())
    print("=" * 52)


def _print_shape_stats(analyzer: TrendAnalyzer) -> None:
    st = analyzer.shape_stats()
    b = analyzer.shape_bounds()
    print("=" * 52)
    print(f"历史形态统计（{st['n']} 期真实开奖）")
    print("-" * 52)
    sm, sp = st["sum"], st["span"]  # type: ignore[index]
    print(f"  和值   均值 {sm['mean']}  范围 {sm['min']}-{sm['max']}  中间80% {sm['p10']}-{sm['p90']}")  # type: ignore[index]
    print(f"  跨度   均值 {sp['mean']}  中间80% {sp['p10']}-{sp['p90']}")  # type: ignore[index]
    print("  奇偶比 " + "  ".join(f"{k}:{6-k}={v}期" for k, v in st["odd_dist"].items()))  # type: ignore[union-attr]
    print("  大小比 " + "  ".join(f"{k}:{6-k}={v}期" for k, v in st["big_dist"].items()))  # type: ignore[union-attr]
    print("  连号   " + "  ".join(f"{k}对={v}期" for k, v in st["consecutive_dist"].items()))  # type: ignore[union-attr]
    print("  AC值   " + "  ".join(f"{k}={v}期" for k, v in st["ac_dist"].items()))  # type: ignore[union-attr]
    print("  区间形态 " + ", ".join(f"{z['pattern']}({z['count']}期)" for z in st["top_zone_patterns"]))  # type: ignore[index]
    print("-" * 52)
    print("  形态过滤区间（--shape-filter 生效时）：")
    print(f"    和值 {b['sum_min']}-{b['sum_max']} | 跨度 {b['span_min']}-{b['span_max']} | "
          f"奇数 {sorted(b['odd_ok'])} | 大号 {sorted(b['big_ok'])} | "  # type: ignore[arg-type]
          f"连号≤{b['max_consecutive']} | AC≥{b['min_ac']}")
    print("=" * 52)


def _print_backtest(r: dict) -> None:
    print("=" * 60)
    print("历史回测结果（走查式，绝不使用未来数据）")
    print("-" * 60)
    print(f"  策略        : {r['strategy']}  ({STRATEGY_DESC.get(r['strategy'], '')})")
    print(f"  每期注数    : {r['count_per_period']}   蓝球覆盖: {'开' if r['blue_cover'] else '关'}"
          f"   形态过滤: {'开' if r['shape_filter'] else '关'}")
    print(f"  回测期数    : {r['periods_tested']}")
    print("-" * 60)
    print(f"  ★ 期命中率  : {r['period_hit_rate']:.1%}   ({r['periods_hit']}/{r['periods_tested']} 期至少中 1 注)")
    print(f"    注命中率  : {r['ticket_hit_rate']:.2%}   ({r['tickets_hit']}/{r['tickets_total']} 注)")
    print(f"    奖级分布  : {r['levels'] or '无中奖'}")
    print("-" * 60)
    print(f"  总投入      : {r['total_cost']} 元")
    print(f"  总回报      : {r['total_prize']} 元")
    print(f"  收益率 ROI  : {r['roi']:+.1%}")
    print("=" * 60)
    print("  说明：双色球整体返奖率约 50%，长期 ROI 必为负。")
    print("        回测用于验证「保底策略是否真的保底」，不是寻找必胜法。")
    if r["blue_cover"] and r["count_per_period"] >= 16:
        print("        蓝球全覆盖下期命中率应为 100% —— 这是数学保证，不是运气。")


def run_self_test() -> int:
    """内置自检：验证规则与生成正确性。"""
    print("运行自检 ...")
    sample = _default_data()
    if not sample:
        print("缺少示例数据，跳过数据分析自检。")
        return 1

    draws = load_history(sample)
    assert draws, "历史数据为空"
    ta = TrendAnalyzer(draws)
    gen = NumberGenerator(ta)

    # 1) 规则与注数
    for strat in STRATEGIES:
        for cnt in (1, 5, 20):
            res = gen.generate(count=cnt, strategy=strat, dedupe=True)
            assert len(res) == cnt, f"{strat} 注数不符"
            for d in res:
                assert len(set(d.reds)) == 6, "红球重复"
                assert all(1 <= r <= 33 for r in d.reds), "红球越界"
                assert 1 <= d.blue <= 16, "蓝球越界"
    print("  ✓ 规则校验 / 注数 / 全部 6 种策略")

    # 2) 去重
    res = gen.generate(count=20, strategy="hot", dedupe=True)
    keys = {(tuple(sorted(d.reds)), d.blue) for d in res}
    assert len(keys) == len(res), "去重失败"
    print("  ✓ 整注去重")

    # 3) 分区策略必须严格 2-2-2
    for d in gen.generate(count=10, strategy="zone"):
        from ssq import zone_pattern
        assert zone_pattern(d.reds) == (2, 2, 2), "zone 策略区间比不是 2-2-2"
    print("  ✓ 分区策略 2-2-2 形态")

    # 4) 蓝球覆盖：16 注必须覆盖全部 16 个蓝球
    ts = gen.generate(count=16, strategy="balanced", blue_cover=True)
    assert len(set(t.blue for t in ts)) == 16, "蓝球覆盖不完整"
    print("  ✓ 蓝球全覆盖（16 注 = 16 个不同蓝球）")

    # 5) 形态过滤：结果必须全部落在典型区间
    bounds = ta.shape_bounds()
    for d in gen.generate(count=20, strategy="balanced", shape_filter=True):
        assert ta.is_typical(d.reds, bounds), "形态过滤失效"
    print("  ✓ 形态过滤")

    # 6) 判奖逻辑
    from ssq import judge
    actual = Draw("", "", [1, 2, 3, 4, 5, 6], 7)
    assert judge(Draw("", "", [1, 2, 3, 4, 5, 6], 7), actual)[0] == 1, "一等奖判定错误"
    assert judge(Draw("", "", [1, 2, 3, 4, 5, 6], 8), actual)[0] == 2, "二等奖判定错误"
    assert judge(Draw("", "", [1, 2, 3, 4, 5, 9], 7), actual)[0] == 3, "三等奖判定错误"
    assert judge(Draw("", "", [1, 2, 3, 9, 10, 11], 7), actual)[0] == 5, "五等奖判定错误"
    assert judge(Draw("", "", [9, 10, 11, 12, 13, 14], 7), actual)[0] == 6, "六等奖判定错误"
    assert judge(Draw("", "", [9, 10, 11, 12, 13, 14], 8), actual)[0] == 0, "未中奖判定错误"
    print("  ✓ 六档奖级判定")

    # 7) 蓝球覆盖回测：期命中率必须是 100%
    r = backtest(draws, count=16, strategy="balanced", periods=60,
                 min_train=200, blue_cover=True, seed=1)
    assert r["period_hit_rate"] == 1.0, f"蓝球全覆盖期命中率应为 100%，实际 {r['period_hit_rate']}"
    print(f"  ✓ 蓝球全覆盖回测保底验证（{r['periods_tested']} 期，期命中率 100%）")

    # 8) 数据质量：蓝球分布应近似均匀（防列错位回归）
    from collections import Counter
    bc = Counter(d.blue for d in draws)
    exp = len(draws) / 16
    assert len(bc) == 16, f"蓝球只有 {len(bc)} 种取值，数据可能错列"
    assert max(bc.values()) < exp * 2.2, "蓝球分布严重不均，数据可能错列"
    same = sum(1 for d in draws if d.blue == min(d.reds))
    assert same < len(draws) * 0.3, "蓝球疑似等于最小红球（历史 bug 回归）"
    print("  ✓ 数据质量体检（蓝球分布均匀、未与红球错列）")

    print("\n✓ 全部自检通过。")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="双色球走势分析与选号工具",
        epilog="策略说明：\n" + "\n".join(f"  {k:<9} {v}" for k, v in STRATEGY_DESC.items()),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-n", "--count", type=int, default=5, help="生成注数（默认 5）")
    parser.add_argument(
        "-s", "--strategy", default="random", choices=STRATEGIES,
        help="选号策略",
    )
    parser.add_argument("-d", "--data", default=None, help="历史数据 CSV 路径")
    parser.add_argument("--blue-cover", action="store_true",
                        help="蓝球轮询覆盖：买满 16 注即保证每期至少中 1 注六等奖")
    parser.add_argument("--shape-filter", action="store_true",
                        help="只保留符合历史典型形态的组合")
    parser.add_argument("--no-dedupe", action="store_true", help="关闭整注去重")
    parser.add_argument("--summary", action="store_true", help="打印走势摘要")
    parser.add_argument("--shape", action="store_true", help="打印历史形态统计")
    parser.add_argument("--backtest", action="store_true", help="运行历史回测")
    parser.add_argument("--periods", type=int, default=200, help="回测期数（默认 200）")
    parser.add_argument("--history", type=int, default=None,
                        help="抓取并保存指定数量的历史开奖（5–99999 期），写入默认 data 文件")
    parser.add_argument("--seed", type=int, default=None, help="随机种子（复现结果）")
    parser.add_argument("--json", action="store_true", help="JSON 格式输出")
    parser.add_argument("--self-test", action="store_true", help="运行内置自检")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    # ---- 抓取并保存历史期数（--history）----
    if args.history is not None:
        if not (5 <= args.history <= 99999):
            parser.error("历史期数需在 5–99999 期之间")
        try:
            import csv as _csv
            from fetch_data import fetch, sanity_check

            here = os.path.dirname(os.path.abspath(__file__))
            out = os.path.join(here, "data", "sample_history.csv")
            rows = fetch(args.history)
            warns = sanity_check(rows)
            if warns:
                print("数据质量体检未通过，已中止写入：")
                for w in warns:
                    print("  -", w)
                return 1
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, "w", newline="", encoding="utf-8-sig") as f:
                w = _csv.DictWriter(f, fieldnames=["issue", "date", "red", "blue"])
                w.writeheader()
                w.writerows(rows)
            print(f"✓ 已抓取并保存 {len(rows)} 期到 {out}")
            if rows:
                print(f"  最新一期：{rows[0]['issue']} {rows[0]['date']} "
                      f"红:{rows[0]['red']} 蓝:{rows[0]['blue']}")
            return 0
        except Exception as e:  # noqa: BLE001
            print(f"错误：{e}", file=sys.stderr)
            return 1

    data_path = args.data or _default_data()
    needs_data = args.strategy in ("hot", "cold", "balanced") or args.shape_filter \
        or args.summary or args.shape or args.backtest
    if needs_data and not data_path:
        parser.error("该操作需要历史数据，请用 --data 指定 CSV，或先运行 python fetch_data.py")

    # ---- 回测分支 ----
    if args.backtest:
        try:
            draws = load_history(data_path)  # type: ignore[arg-type]
            r = backtest(
                draws,
                count=args.count,
                strategy=args.strategy,
                periods=args.periods,
                blue_cover=args.blue_cover,
                shape_filter=args.shape_filter,
                seed=args.seed,
            )
        except (ValueError, FileNotFoundError) as e:
            print(f"错误：{e}", file=sys.stderr)
            return 1
        if args.json:
            print(json.dumps(r, ensure_ascii=False, indent=2))
        else:
            _print_backtest(r)
        return 0

    # ---- 生成分支 ----
    if args.seed is not None:
        import random
        random.seed(args.seed)

    try:
        draws = generate_numbers(
            history_path=data_path,
            count=args.count,
            strategy=args.strategy,
            dedupe=not args.no_dedupe,
            blue_cover=args.blue_cover,
            shape_filter=args.shape_filter,
        )
    except (ValueError, FileNotFoundError) as e:
        print(f"错误：{e}", file=sys.stderr)
        return 1

    if (args.summary or args.shape) and data_path:
        try:
            ta = TrendAnalyzer(load_history(data_path))
            if args.summary:
                _print_summary(ta)
            if args.shape:
                _print_shape_stats(ta)
        except Exception as e:  # noqa: BLE001
            print(f"（走势分析失败：{e}）", file=sys.stderr)

    if args.json:
        payload = {
            "strategy": args.strategy,
            "blue_cover": args.blue_cover,
            "shape_filter": args.shape_filter,
            "count": len(draws),
            "numbers": [
                {"reds": sorted(d.reds), "blue": d.blue, "shape": shape_of(d.reds)}
                for d in draws
            ],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2, default=list))
    else:
        label = STRATEGY_DESC[args.strategy].split(" —— ")[0]
        extra = []
        if args.blue_cover:
            extra.append("蓝球覆盖")
        if args.shape_filter:
            extra.append("形态过滤")
        tag = f"【{label}】" + (f"+{'+'.join(extra)}" if extra else "")
        print(f"\n双色球选号结果 · {tag} · 共 {len(draws)} 注 · 成本 {len(draws) * 2} 元")
        if args.blue_cover:
            covered = len(set(d.blue for d in draws))
            if covered >= 16:
                print("★ 已覆盖全部 16 个蓝球 —— 本期数学上保证至少中 1 注六等奖（5 元）")
            else:
                print(f"  已覆盖 {covered}/16 个蓝球 —— 本期中六等奖概率 {covered / 16:.1%}"
                      f"（买满 16 注可达 100%）")
        print("（理性购彩。除蓝球全覆盖的保底外，任何策略都不会提高中大奖概率）\n")
        _print_table(draws, show_shape=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

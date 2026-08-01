"""
双色球选号 · 零依赖 Web 服务
============================
用 Python 标准库 http.server 提供本地 Web 界面，无需安装任何第三方包。

启动：
    python app.py            # 默认 http://localhost:8765
    python app.py 9000      # 指定端口

接口：
    GET  /                 -> 前端单页 (index.html)
    GET  /api/trend        -> 走势摘要（热号/冷号/区间/每号频率遗漏/形态统计）
    POST /api/generate     -> 按 {strategy, count, dedupe, blueCover, shapeFilter} 生成号码
    POST /api/backtest     -> 按 {strategy, count, periods, blueCover, shapeFilter} 回测
    GET  /api/refresh      -> 重新抓取最新历史数据（含数据质量体检）
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from ssq import (  # noqa: E402
    STRATEGIES,
    STRATEGY_DESC,
    TrendAnalyzer,
    backtest,
    generate_numbers,
    load_history,
    shape_of,
)

# 项目根目录（py/ 的上一级）：前后端共用同一份 index.html 与 favicon 资源，
# 避免 py 与 Cloudflare 版各维护一份、长期漂移。
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, "data", "sample_history.csv")
INDEX = os.path.join(ROOT, "index.html")


def _is_pos_int(v) -> bool:
    """判断值是否为正整数（兼容 int / 数字字符串），拒绝小数、负数、0、空与非数字。"""
    if isinstance(v, bool):
        return False
    if isinstance(v, int):
        return v > 0
    if isinstance(v, str):
        return v.isdigit() and int(v) > 0
    return False


def _load():
    return load_history(DATA)


class Handler(BaseHTTPRequestHandler):
    server_version = "SSQ-Web/1.0"

    # ---------- 通用工具 ----------
    def _send_cors(self) -> None:
        # 跨域头：允许打包后的 App（Capacitor / 鸿蒙 WebView）从本地源调用本接口。
        # 生产如需收敛，可将 "*" 改为具体来源。
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send_json(self, obj, code: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        # 预检响应：浏览器跨域 POST/带自定义头时会先发 OPTIONS 探路
        self.send_response(204)
        self._send_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _serve_index(self) -> None:
        try:
            with open(INDEX, encoding="utf-8") as f:
                html = f.read()
        except FileNotFoundError:
            self._send_json({"error": "index.html 未找到"}, 500)
            return
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, name: str) -> None:
        # 仅放行白名单静态资源（favicon / PWA 资源），杜绝目录穿越
        allowed = {
            "favicon.ico": "image/x-icon",
            "favicon.svg": "image/svg+xml",
            "icon-192.png": "image/png",
            "icon-512.png": "image/png",
            "manifest.webmanifest": "application/manifest+json",
            "sw.js": "application/javascript",
            "rules.json": "application/json",
        }
        if name not in allowed:
            self._send_json({"error": "not found"}, 404)
            return
        path = os.path.join(ROOT, name)
        try:
            with open(path, "rb") as f:
                body = f.read()
        except FileNotFoundError:
            self._send_json({"error": name + " 未找到"}, 500)
            return
        self.send_response(200)
        self.send_header("Content-Type", allowed[name])
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # 静默日志
        pass

    # ---------- 路由 ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            self._serve_index()
        elif path in ("/favicon.ico", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest", "/sw.js", "/rules.json"):
            self._serve_static(path[1:])
        elif path == "/api/trend":
            self._send_json(self._trend())
        elif path == "/api/refresh":
            self._send_json(self._refresh())
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/api/generate", "/api/backtest"):
            self._send_json({"error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            data = json.loads(raw or b"{}")
        except Exception:
            data = {}
        if path == "/api/generate":
            self._send_json(self._generate(data))
        else:
            self._send_json(self._backtest(data))

    # ---------- 业务逻辑 ----------
    def _trend(self):
        try:
            draws = _load()
            ta = TrendAnalyzer(draws)
            rf, ro = ta.red_frequency(), ta.red_omission()
            bf, bo = ta.blue_frequency(), ta.blue_omission()
            tier = ta.red_tier()
            hot = sorted(rf.items(), key=lambda kv: kv[1], reverse=True)[:10]
            cold = sorted(ro.items(), key=lambda kv: kv[1], reverse=True)[:10]
            red = {
                r: {"freq": rf.get(r, 0), "omission": ro.get(r, ta.n), "tier": tier[r]}
                for r in range(1, 34)
            }
            blue = {
                b: {"freq": bf.get(b, 0), "omission": bo.get(b, ta.n)}
                for b in range(1, 17)
            }
            st = ta.shape_stats()
            bounds = ta.shape_bounds()
            latest = draws[-1] if draws else None
            return {
                "ok": True,
                "n": ta.n,
                "latest": (
                    {"issue": latest.issue, "date": latest.date,
                     "reds": sorted(latest.reds), "blue": latest.blue}
                    if latest else None
                ),
                "hot": [[k, v] for k, v in hot],
                "cold": [[k, v] for k, v in cold],
                "zones": ta.zone_distribution(),
                "red": red,
                "blue": blue,
                "shape": st,
                "bounds": {
                    "sum": [bounds["sum_min"], bounds["sum_max"]],
                    "span": [bounds["span_min"], bounds["span_max"]],
                    "odd": sorted(bounds["odd_ok"]),      # type: ignore[arg-type]
                    "big": sorted(bounds["big_ok"]),      # type: ignore[arg-type]
                    "maxConsecutive": bounds["max_consecutive"],
                    "minAc": bounds["min_ac"],
                },
                "strategies": [
                    {"key": k, "desc": STRATEGY_DESC[k]} for k in STRATEGIES
                ],
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    def _generate(self, data):
        strategy = str(data.get("strategy", "random"))
        if not _is_pos_int(data.get("count", 5)) or not (1 <= int(data.get("count", 5)) <= 200):
            return {"ok": False, "error": "生成注数需为 1–200 之间的正整数"}
        count = int(data.get("count", 5))
        dedupe = bool(data.get("dedupe", True))
        blue_cover = bool(data.get("blueCover", False))
        shape_filter = bool(data.get("shapeFilter", False))
        try:
            draws = generate_numbers(
                DATA,
                count=count,
                strategy=strategy,
                dedupe=dedupe,
                blue_cover=blue_cover,
                shape_filter=shape_filter,
            )
            covered = len(set(d.blue for d in draws))
            return {
                "ok": True,
                "strategy": strategy,
                "count": len(draws),
                "cost": len(draws) * 2,
                "blueCover": blue_cover,
                "shapeFilter": shape_filter,
                "blueCovered": covered,
                # 蓝球覆盖数 / 16 = 本期至少中一注六等奖的确定概率
                "guaranteeRate": round(min(covered, 16) / 16, 4),
                "numbers": [
                    {
                        "reds": sorted(d.reds),
                        "blue": d.blue,
                        "shape": {
                            k: (list(v) if isinstance(v, tuple) else v)
                            for k, v in shape_of(d.reds).items()
                        },
                    }
                    for d in draws
                ],
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    def _backtest(self, data):
        strategy = str(data.get("strategy", "random"))
        if not _is_pos_int(data.get("count", 5)) or not (1 <= int(data.get("count", 5)) <= 50):
            return {"ok": False, "error": "回测注数需为 1–50 之间的正整数"}
        count = int(data.get("count", 5))
        if not _is_pos_int(data.get("periods", 150)) or not (5 <= int(data.get("periods", 150)) <= 1000):
            return {"ok": False, "error": "回测期数需为 5–1000 之间的正整数"}
        periods = int(data.get("periods", 150))
        try:
            draws = _load()
            # 防止历史过多（如刷新拉取上万期）导致回测 O(n^2) 过慢：
            # 最近 periods 期回测只需最近 (periods + min_train) 期数据，更早的期数不会影响结果。
            # min_train 优先满足用户指定的回测期数：训练窗 = min(默认50, 可用数据 - 回测期数)，至少保留 1 期训练。
            _DEFAULT_MIN_TRAIN = 50
            min_train_eff = min(_DEFAULT_MIN_TRAIN, max(1, len(draws) - periods))
            need = periods + min_train_eff
            if len(draws) > need:
                draws = draws[-need:]
            r = backtest(
                draws,
                count=count,
                strategy=strategy,
                periods=periods,
                blue_cover=bool(data.get("blueCover", False)),
                shape_filter=bool(data.get("shapeFilter", False)),
                min_train=min_train_eff,
            )
            r["ok"] = True
            return r
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    def _refresh(self):
        try:
            import fetch_data

            # 历史期数：从 URL ?count= 读取，前后端统一约束 5–99999 的正整数
            qs = parse_qs(urlparse(self.path).query)
            count_raw = qs.get("count", ["500"])[0]
            if not re.fullmatch(r"\d+", count_raw):
                return {"ok": False, "error": "历史期数需为 5–99999 之间的正整数"}
            count = int(count_raw)
            if count < 5 or count > 99999:
                return {"ok": False, "error": "历史期数需在 5–99999 期之间"}

            rows = fetch_data.fetch(count)
            # ★ 必须先体检再落盘：历史上出现过「蓝球列错位」污染整个数据集，
            #   一旦写入会静默毁掉全部走势分析与回测结论。
            warns = fetch_data.sanity_check(rows)
            if warns:
                return {"ok": False, "error": "数据质量体检未通过：" + "；".join(warns)}
            os.makedirs(os.path.dirname(DATA), exist_ok=True)
            with open(DATA, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=["issue", "date", "red", "blue"])
                w.writeheader()
                w.writerows(rows)
            return {
                "ok": True,
                "requested": count,
                "count": len(rows),
                "latest": rows[0] if rows else None,
                "checked": True,
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}


class _Server(ThreadingHTTPServer):
    # Windows 下 SO_REUSEADDR 允许多个进程同时绑定同一端口，
    # 会导致「改了代码却还是旧行为」的诡异现象（请求被残留的旧进程接管）。
    # 这里显式关闭，端口被占用时直接报错，避免静默踩坑。
    allow_reuse_address = False
    daemon_threads = True


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    try:
        srv = _Server(("0.0.0.0", port), Handler)
    except OSError as e:
        print(f"✗ 端口 {port} 启动失败：{e}")
        print(f"  可能已有服务在运行，请先关闭，或换端口： python app.py {port + 1}")
        raise SystemExit(1)
    print(f"双色球选号 Web 已启动： http://localhost:{port}")
    print("按 Ctrl+C 停止。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()

"""
双色球选号 · 零依赖 Web 服务
============================
用 Python 标准库 http.server 提供本地 Web 界面，无需安装任何第三方包。

启动：
    python app.py            # 默认 http://localhost:8765
    python app.py 9000      # 指定端口

接口：
    GET  /                 -> 前端单页 (index.html)
    GET  /api/trend        -> 走势摘要（热号/冷号/区间/每号频率遗漏）
    POST /api/generate     -> 按 {strategy, count, dedupe} 生成号码
    GET  /api/refresh      -> 重新抓取最新历史数据
"""

from __future__ import annotations

import csv
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from ssq import generate_numbers, TrendAnalyzer, load_history  # noqa: E402

DATA = os.path.join(HERE, "data", "sample_history.csv")
INDEX = os.path.join(HERE, "index.html")


def _load():
    return load_history(DATA)


class Handler(BaseHTTPRequestHandler):
    server_version = "SSQ-Web/1.0"

    # ---------- 通用工具 ----------
    def _send_json(self, obj, code: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

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
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # 静默日志
        pass

    # ---------- 路由 ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            self._serve_index()
        elif path == "/api/trend":
            self._send_json(self._trend())
        elif path == "/api/refresh":
            self._send_json(self._refresh())
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/generate":
            try:
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length) if length else b"{}"
                data = json.loads(raw or b"{}")
            except Exception:
                data = {}
            self._send_json(self._generate(data))
        else:
            self._send_json({"error": "not found"}, 404)

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
            return {
                "ok": True,
                "n": ta.n,
                "hot": [[k, v] for k, v in hot],
                "cold": [[k, v] for k, v in cold],
                "zones": ta.zone_distribution(),
                "red": red,
                "blue": blue,
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    def _generate(self, data):
        strategy = str(data.get("strategy", "random"))
        try:
            count = max(1, min(int(data.get("count", 5)), 200))
        except (TypeError, ValueError):
            count = 5
        dedupe = bool(data.get("dedupe", True))
        try:
            draws = generate_numbers(
                DATA, count=count, strategy=strategy, dedupe=dedupe
            )
            return {
                "ok": True,
                "strategy": strategy,
                "count": len(draws),
                "numbers": [{"reds": sorted(d.reds), "blue": d.blue} for d in draws],
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    def _refresh(self):
        try:
            import fetch_data

            rows = fetch_data.fetch(300)
            os.makedirs(os.path.dirname(DATA), exist_ok=True)
            with open(DATA, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=["issue", "date", "red", "blue"])
                w.writeheader()
                w.writerows(rows)
            return {"ok": True, "count": len(rows)}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"双色球选号 Web 已启动： http://localhost:{port}")
    print("按 Ctrl+C 停止。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()

# 本轮改动概览

完成用户提出的三项任务：期数严格校验、原创 favicon、修复复制按钮。

## 1. 期数严格校验（前后端双版本同步）

- **前端 `index.html`**
  - 新增 `parsePositiveIntInRange(raw, min, max, name)` helper，正则 `^\d+$` 校验正整数。
  - `histCount`（历史期数 5–99999）与 `btPeriods`（回测期数 5–1000）增加实时 `input` 校验（标红）与提交拦截，拒绝小数/字母/负数/越界。
  - `.stepper input.invalid` 增加红色边框与阴影提示。
- **后端 Python `py/app.py`**
  - 新增 `_is_pos_int()`：拒绝 bool、小数、负数、0、非数字字符串。
  - `_generate` 校验 count 1–200；`_backtest` 校验 count 1–50、periods 5–1000；`_refresh` 读取 `?count=` 并校验 5–99999（修复此前硬编码 500 的 bug）。
  - 非法输入返回 `{"ok": false, "error": "..."}`，不再静默夹紧。
- **后端 Node `functions/api/`**
  - `fetch_data.js` 的 `validateLimit()` 改用 `/^\d+$/` 严格校验，拒绝 `"12abc"`、`"3.5"`、`0`、负数。
  - `backtest.js` 对 `count` 1–50、`periods` 5–1000 严格校验，非法返回 HTTP 400。

## 2. 原创 favicon（无侵权风险）

- 设计：红蓝双球相叠，直接呼应「双色球」字面含义；纯几何图形，不含官方彩票 logo / 商标。
- 产物：
  - `favicon.ico`：256×256 PNG-in-ICO，现代浏览器通用。
  - `favicon.svg`：矢量版本，支持高清与暗色浏览器标签。
  - `tools/gen_favicon.py`：纯标准库生成脚本（自写 PNG 编码器 + ICO 容器），无需 Pillow。
- `index.html` 已引入 `<link rel="icon">` 两处（ico + svg）。
- `py/app.py` 新增 `/favicon.ico` 与 `/favicon.svg` 白名单静态路由，防止目录穿越。

## 3. 复制按钮修复

- 问题：在 `http://<IP>:<port>` 等非安全上下文，`navigator.clipboard` 为 `undefined`，`writeText` 同步抛 `TypeError`，且 `.catch()` 无法捕获，导致点击无反应。
- 修复：新增 `copyText()`，优先 `navigator.clipboard`（仅安全上下文），降级为隐藏 `textarea + document.execCommand('copy')`；给出明确状态文案（成功 / 失败 / 无结果）。

## 4. 其他整理

- `py/app.py` 统一使用根目录 `index.html`（`ROOT = dirname(HERE)`），删除 stale 的 `py/index.html` 副本，确保 py 与 Cloudflare 版前端单一来源。
- 提交 `EQUIVALENCE_REPORT.md`（此前未提交的状态文档）。

## 提交记录

```
dff006b fix(frontend): 期数严格校验（正整数+范围）+ 复制按钮修复 + favicon 引用
51423d4 feat(assets): 原创双色球几何 favicon（ico+svg，无侵权风险）
f833386 fix(py): 后端期数严格校验 + _refresh 读取期数参数 + 统一根目录 index.html + 提供 favicon
ba132f4 fix(node): 后端期数严格校验（回测期数 / 历史期数）
e822d8d docs: 补充 py 与 node 版等效性报告
```

## 验证

- `py_compile` 全通过；Node `node --check` 通过。
- py 本地服务 smoke test 通过：`/api/trend`、非法 `?count=`、非法 backtest periods、非法 generate count、`/favicon.ico`、`/favicon.svg`、根目录 `index.html` 均正常。

## 待办 / 注意

- `git push origin main` 因无头环境无凭据失败（`/dev/tty` 不存在）。请在本机或带 PAT 的环境执行推送。

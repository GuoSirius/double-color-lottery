# 双色球智能选号 · Cloudflare 部署版（方案 A）

本目录是「前后端都能部署到 Cloudflare Pages」的实现。原 Python 版本保留在
`py/` 目录下并继续独立运行（本地测试用）。

## 目录结构

```
ssq_tool/
├── index.html              # 前端单页（调用 /api/*，路径兼容 Cloudflare Functions）
├── engine.js               # 选号/分析/回测引擎（py/ssq.py 的 JS 移植，纯算法零依赖）
├── package.json
├── data/
│   └── sample_history.csv  # 500 期静态历史样本（无外网/无 KV 时使用）
├── functions/
│   ├── api/
│   │   ├── _common.js      # 数据加载 + JSON 响应工具
│   │   ├── fetch_data.js   # 抓取 500 彩票网 + 数据质量体检（对应 py/fetch_data.py）
│   │   ├── trend.js        # GET  /api/trend
│   │   ├── generate.js     # POST /api/generate
│   │   ├── backtest.js     # POST /api/backtest
│   │   └── refresh.js      # GET  /api/refresh  （保留「实时刷新」）
├── test/
│   └── functions_verify.mjs# 本地验证脚本（无需 Cloudflare 环境）
└── py/                     # 原始 Python 版（独立运行，勿改其接口）
```

## 接口（与 Python 版完全一致）

| 方法 | 路径          | 说明 |
|------|---------------|------|
| GET  | /api/trend    | 走势摘要：热号/冷号/区间/每号频率遗漏/形态统计 |
| POST | /api/generate | 按策略生成号码 `{strategy,count,dedupe,blueCover,shapeFilter}` |
| POST | /api/backtest | 滚动回测 `{strategy,count,periods,blueCover,shapeFilter}` |
| GET  | /api/refresh  | 重新抓取最新历史（含数据体检），写入 KV |

> 数学提醒：每期开奖独立均匀随机，本工具「走势/加权」仅为娱乐参考，不提高中奖概率；
> 蓝球买满 16 注（blueCover=true）是唯一数学上确定保底六等奖的手段。

## 本地验证（无需部署）

```bash
node test/functions_verify.mjs   # 32 项断言：引擎不变式 + 四个接口 + 抓取体检防御
```

## 部署到 Cloudflare Pages（方案 A）

### 1. 安装并登录 Wrangler
```bash
npm i -g wrangler && wrangler login
```

### 2.（可选但推荐）创建 KV 命名空间，用于持久化「刷新」结果
```bash
wrangler kv namespace create SSQ_DATA
# 记下返回的 id，填到 wrangler.toml 的 [[kv_namespaces]].id
```
> 不绑定 KV 也能运行：刷新接口会返回本次抓取结果，但数据不会持久化（静态样本不变）。

### 3. 部署
```bash
wrangler pages deploy . --project-name ssq-cloudflare
```
`functions/` 下的 `*.js` 会被自动识别为 Pages Functions；`index.html` 与 `data/`
作为静态资源托管。浏览器访问站点根路径即可使用全部功能。

> 也可以直接在 Cloudflare Dashboard 连接 Git 仓库自动部署；
> 在 Settings → Functions → KV namespace bindings 里绑定 `SSQ_DATA` 即可启用刷新持久化。

## 与 Python 版的关系

- `py/`：原始实现，继续本地运行供你测试其它功能，不受本次改造影响。
- 根目录：Cloudflare 可部署版本，引擎逻辑（`engine.js`）与 `py/ssq.py` 逐一对齐，
  并经 `test/functions_verify.mjs` 验证输出一致。

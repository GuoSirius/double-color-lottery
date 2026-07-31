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
| GET  | /api/refresh  | 重新抓取最新历史（含数据体检），写入 KV。支持 `?count=N`（5–99999，默认 500）|

> 数学提醒：每期开奖独立均匀随机，本工具「走势/加权」仅为娱乐参考，不提高中奖概率；
> 蓝球买满 16 注（blueCover=true）是唯一数学上确定保底六等奖的手段。

## 接口详细说明（4 个，py 与 node 版完全一致）

> 所有接口返回 JSON；Web 前端在 `index.html` 中已封装好调用，直接用界面即可，
> 下面的 `curl` 示例便于调试或对接其它前端。

### 1) GET /api/trend —— 走势摘要
**作用**：基于当前历史数据，计算热号/冷号、每号频率与遗漏、区间分布、形态统计与典型区间边界，供界面展示与选号参考。
**参数**：无。
**响应字段**：`ok`、`n`（期数）、`latest`（最新一期）、`hot`/`cold`（Top10 冷热号）、`zones`（三区占比）、`red`/`blue`（每号 freq/omission/tier）、`shape`（形态统计）、`bounds`（典型形态区间）、`strategies`（6 种策略说明）。
**示例**：
```bash
curl https://你的域名/api/trend
```

### 2) POST /api/generate —— 按策略生成号码
**作用**：按选定策略生成若干注号码，可选去重、蓝球全覆盖（保底六等奖）、形态过滤。
**请求体**：
```json
{
  "strategy": "hot",        // random | hot | cold | balanced | zone | spread
  "count": 5,               // 注数 1–200
  "dedupe": true,           // 整注去重（默认 true）
  "blueCover": false,       // 蓝球轮询覆盖：买满 16 注=每期必中六等奖
  "shapeFilter": false      // 仅保留符合历史典型形态的组合
}
```
**响应字段**：`strategy`、`count`、`cost`（元=注数×2）、`blueCover`、`shapeFilter`、`blueCovered`（覆盖蓝球数）、`guaranteeRate`（=min(blueCovered,16)/16，保底六等奖确定概率）、`numbers[]`（`reds`/`blue`/`shape`）。
**示例**：
```bash
curl -X POST https://你的域名/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"spread","count":16,"blueCover":true,"shapeFilter":true}'
```

### 3) POST /api/backtest —— 滚动回测
**作用**：用「只用历史前 N-1 期预测第 N 期」的走查式回测，验证各策略在真实历史上的期命中率/注命中率/奖级分布/ROI。**支持指定 `periods`（回测期数）**，方便对比不同期数下的胜率。
**请求体**：
```json
{
  "strategy": "balanced",
  "count": 5,               // 每期注数 1–50
  "periods": 200,           // 回测期数 20–400（前端「回测期数」输入框），越大样本越足
  "blueCover": false,
  "shapeFilter": false
}
```
**响应字段**：`strategy`、`count_per_period`、`periods_tested`、`periods_hit`/`period_hit_rate`（期命中率）、`tickets_total`/`tickets_hit`/`ticket_hit_rate`、`levels`（各奖级分布）、`total_cost`/`total_prize`/`roi`。
**示例**：
```bash
curl -X POST https://你的域名/api/backtest \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"balanced","count":16,"periods":300,"blueCover":true}'
```

### 4) GET /api/refresh —— 重新抓取历史（实时刷新）
**作用**：服务端抓取 500 彩票网最新开奖，先做数据质量体检（防「蓝球列错位」污染），通过后才落盘。写入 KV（若已绑定 `SSQ_DATA`）供后续接口使用。
**参数**：`?count=N`（历史期数，**5–99999**，默认 500）。
**响应字段**：`ok`、`requested`（请求期数）、`count`（实际写入期数）、`latest`（最新一期）、`checked`、`persisted`（是否已写入 KV）。
**示例**：
```bash
curl "https://你的域名/api/refresh?count=800"
```
> 注：500 彩票网接口实际可返回历史上限约数千期，请求超过可用量时返回全部可用数据。

### 手动设定抓取的历史期数

- **Web**：刷新按钮上方有「刷新历史期数」输入框（步进按钮），取值范围 **5–99999**，刷新时通过 `GET /api/refresh?count=N` 传给后端。
- **CLI（py 版）**：`python cli.py --history 500`（或 `--history 99999`）抓取并写入默认 `data/sample_history.csv`。
- 前后端（py / node）统一约束：最小 5 期，最大 99999 期；越界会被拒绝（Web 前端先校验，后端再次校验）。
- 注：500 彩票网接口实际可返回的历史上限约数千期，请求超过可用量时返回全部可用数据。

## 本地验证（无需部署）

```bash
node test/functions_verify.mjs   # 39 项断言：引擎不变式 + 四个接口 + 抓取体检防御 + 历史期数/回测期数校验
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

### 4.（推荐）连接 GitHub 自动部署（push 即部署）

上面的 `wrangler pages deploy` 是一次性手动发布；若希望「提交到 GitHub 后自动部署」，
在 Cloudflare 控制台开启 Git 集成即可，**仓库无需新增任何文件**。

1. Cloudflare Dashboard → Pages → 项目 `ssq-cloudflare` → **Settings → Build & deployments**。
2. 点击 **Connect to Git** → 选择 GitHub → 授权 → 选择仓库 `GuoSirius/double-color-lottery`。
3. 构建设置：
   - **Production branch**：`main`
   - **Build command**：留空（本项目无构建步骤，静态 `index.html` + `functions/` 直接部署）
   - **Build output directory**：`/`（等价于 `wrangler.toml` 里的 `pages_build_output_dir = "."`，即仓库根目录）
   - **Framework preset**：`None`
   - **KV 绑定**：在 **Settings → Functions → KV namespace bindings** 确认已绑定 `SSQ_DATA`
     （namespace id 见 `wrangler.toml` 的 `[[kv_namespaces]].id`）；不绑定也能运行，只是刷新结果不持久化。
4. 保存后 Cloudflare 会立即从 GitHub 当前 `main` 拉取并部署一次；之后**每次
   `git push origin main`，自动重新构建并上线**，`functions/` 自动作为 Pages Functions 发布。
5. 验证：部署变绿后访问 `https://ssq-cloudflare-em8.pages.dev/api/refresh?count=500`，
   预期返回 `{"ok": true, "count": 500, ...}`。

> 开启 Git 集成后，GitHub 仓库成为唯一数据源。改代码请走
> `git commit` → `git push`，不要再手动 `wrangler pages deploy`，否则会与 Git 集成冲突
> （手动部署会被下次 push 覆盖）。

---

## 与 Python 版的关系

- `py/`：原始实现，继续本地运行供你测试其它功能，不受本次改造影响。
- 根目录：Cloudflare 可部署版本，引擎逻辑（`engine.js`）与 `py/ssq.py` 逐一对齐，
  并经 `test/functions_verify.mjs` 验证输出一致。

---

## 打包为 App（安卓 / iOS / 鸿蒙 / PWA）

同一个 `index.html`（单文件、自包含）可同时作为 **Web 站点、PWA、Capacitor 原生 App、鸿蒙 ArkUI App** 的来源，无需维护多份前端。

### 接口基地址自动区分（web / app）

`index.html` 顶部已内置：

```js
const REMOTE_API = 'https://ssq-cloudflare-em8.pages.dev';
const API_BASE = (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
  && window.Capacitor.isNativePlatform()) ? REMOTE_API : '';
```

- **Web 端**（浏览器、Cloudflare 站点）：`API_BASE` 为空 → 走同源相对路径 `/api/*`，本地 `py` 与线上 Cloudflare 都正常。
- **Capacitor App（安卓/iOS）**：识别到 Capacitor 环境 → 统一走 `https://ssq-cloudflare-em8.pages.dev/api/*`。
- **鸿蒙 App**：ArkUI 的 `Web` 组件直接加载远程站点地址（与 API 同源），无需额外切换。

> 所有 4 个接口（`/api/trend`、`/api/generate`、`/api/backtest`、`/api/refresh`）均已按上述 `API_BASE` 拼接。

### 跨域（CORS）

App 内嵌 WebView 调用远程接口属于跨域，已在 **Cloudflare Functions（`functions/api/_common.js`）与 `py/app.py` 双版本** 补齐：

- 响应头 `Access-Control-Allow-Origin: *`（生产可收敛为具体来源）。
- 处理 `OPTIONS` 预检（浏览器跨域 POST/带 `Content-Type` 头时会先发 OPTIONS 探路）。

### 1) Capacitor —— 安卓 / iOS（目录 `app/`）

> 本仓库已包含可构建工程；AAB/IPA 的最终编译需你本机有对应 IDE。

前置依赖：**Node ≥ 24**、Android Studio + SDK（安卓）、Xcode（iOS，仅 macOS）、Capacitor CLI。

```bash
cd app
npm install                 # 安装 @capacitor/core / cli / android / ios
npm run sync               # 把根目录 index.html 同步到 app/www/（单一来源，避免双份维护）
npx cap add android        # 生成 app/android（用 Android Studio 打开编译 AAB）
npx cap add ios            # 生成 app/ios（用 Xcode 打开编译 IPA，仅 macOS）
```

- `app/www/` 已被 `.gitignore` 忽略，每次改完前端只需重跑 `npm run sync`。
- 上架：Google Play（一次性 $25 开发者账号）、App Store（$99/年）。

### 2) HarmonyOS NEXT —— 鸿蒙（目录 `harmony/`）

> 用 **DevEco Studio** 打开 `harmony/` 目录即可。`Index.ets` 用 ArkUI `Web` 组件加载 `https://ssq-cloudflare-em8.pages.dev`（与 API 同源，无需 CORS 处理）。

```bash
# DevEco Studio 内：Build → Build HAP / Build APP → 生成 .hap / .app
```

- 目录内含 `app_icon.png` / `startIcon.png` 为**占位图标**，请在 DevEco 中替换为自适应图标（foreground/background + `icon.json`）。
- 上架：华为应用市场（需华为开发者联盟实名认证）。

### 3) PWA —— 免商店即装（已内置）

站点已自带 `manifest.webmanifest` + `sw.js`：

- 通过 **HTTPS** 访问（Cloudflare 部署已满足）后，Android Chrome「添加到主屏幕」即可像原生 App 一样全屏使用，零构建、零上架。
- 离线时外壳（HTML/图标）可缓存，接口请求实时走网络。

> 推荐先用 PWA 顶上日常使用，再按需推进原生商店上架。

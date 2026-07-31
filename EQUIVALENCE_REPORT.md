# py 版 / node 版 等效性 & 共享前端 核查报告

> 生成时间：2026-07-31
> 核查方式：对 `py/ssq.py` 与 `engine.js` 跑同一份 `data/sample_history.csv`（最近 500 期，至 26087 期 / 2026-07-30），输出规范化签名 `TREND_SIG` 与同种子生成结果 `GEN_*`，逐字段对比。

## 一、py 与 node 是否“完全等效”？

**结论：不完全等效。分两层看待。**

### 1) 确定性分析层（走势分析）—— 等效 ✅

`TREND_SIG` 两侧逐项一致（仅 JSON 键序 / 并列频率项的排序有细微差异，数值完全相同）：

| 字段 | py (ssq.py) | node (engine.js) | 一致 |
|---|---|---|---|
| n | 500 | 500 | ✅ |
| latest | 26087 / 2026-07-30 / [4,6,10,18,23,31]+11 | 同左 | ✅ |
| red_freq_sum | 3000 | 3000 | ✅ |
| blue_freq_sum | 500 | 500 | ✅ |
| bounds | sum[74,127] span[18,30] maxCon 2 minAc 6 | 同左 | ✅ |
| shape_sum_mean | 99.9 | 99.9 | ✅ |
| odd_ok / big_ok | [2,3,4] / [2,3,4] | [2,3,4] / [2,3,4] | ✅ |
| hot_top5 | [2,112][17,104][3,103][22,102][9,102] | 同数值（键为字符串，并列项 9/22 顺序互换） | ✅（数值同） |

→ 频率、遗漏、热冷、区间、形态边界、形态均值，两个版本**算出来一模一样**。

### 2) 随机生成 + 回测层 —— 不等效 / 不可跨版本复现 ❌

同种子下输出完全不同（这是预期，不是 bug）：

```
GEN_PY_SEEDED  = [[4,5,9,16,25,33]+15], [4,7,16,25,26,31]+1], [1,20,25,28,30,33]+15]]
GEN_NODE_SEEDED= [[10,13,14,16,27,28]+12],[2,14,18,19,21,28]+5],[1,6,8,11,20,32]+5]]
```

原因：**Python 用 Mersenne Twister（`random.seed(1)`），Node 用 mulberry32（`seedRng(1)`），两套 PRNG 序列天然不同**。
因此：
- 选号（strategy=random/hot/cold…）的**具体号码**两边不同；
- 回测是 Monte-Carlo（用随机号码去撞历史），胜率/ROI 会随运行波动，两边**也不会相等、且同版本多次运行也不等**。

→ 期望层面两者都是“均匀随机”，长期统计行为相近；但**逐次输出与具体回测数字无法跨版本复现**。

**一句话回答用户问题**：分析/走势完全等效；随机生成与回测“数学等价但不逐字节一致”，所以严格说**不是完全等效**。

---

## 二、index.html 能否公用？

**结论：能，而且本来就该公用。已实现为单一来源。**

依据：
1. 两个后端暴露**完全相同**的 4 个接口契约（请求/响应字段逐一比对一致）：
   - `GET /api/trend`、`POST /api/generate`、`POST /api/backtest`、`GET /api/refresh?count=N`
2. `index.html` 只使用**相对路径** `/api/*` 调用，不写死域名/端口 → 同一份文件对两套后端都可用。
3. 改造前两份 `index.html` 经 `diff` 确认**逐字节相同**。

### 已完成的合并（提交 `52c9187`）
- `py/app.py`：`INDEX = os.path.join(HERE, "..", "index.html")` —— py 版现在也服务仓库根目录的那一份 `index.html`。
- 删除重复的 `py/index.html`，消除两份 UI 日后漂移的风险（呼应“两个版本保持同步”的约定）。
- 新增 `test/equiv_check.py` / `test/equiv_check.mjs` 作为常驻等效性校验脚本（未推上 GitHub）。

---

## 三、需要你注意的环境问题（重要）

1. **GitHub（origin/main）上本来就存有完整的 py/ 版本**（`git ls-tree origin/main py/` 确认 8 个文件都在）——代码没丢，放心。
2. **本地 `main` 比 `origin/main` 多 10 个提交**（历史期数 5–99999、回测期数、接口文档、本次单源改造等），但**本环境无法 push**：报错 `could not read Username for 'https://github.com'`（无凭据 / 无 TTY）。
3. 工作区会被反复重置回 `origin/main`，所以 `py/` 在本地“时有时无”——但随时 `git checkout origin/main -- py/`（或拉取）即可恢复；且 GitHub 上本来就有。
4. **需要你做的**：在有权限的机器上 `git push origin main`；或提供一个 GitHub PAT / Token，我即可在本环境完成推送，把最新的 10 个提交（含单源前端改造）推上去。

---

## 附：复现命令
```bash
# 确定性分析等效性
python test/equiv_check.py
node   test/equiv_check.mjs

# 接口契约测试（Node 侧，43 项）
node test/functions_verify.mjs
```

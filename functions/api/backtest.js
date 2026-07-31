// POST /api/backtest —— 滚动回测（用历史前 N 期预测第 N+1 期）
// 请求体：{ strategy, count, periods, blueCover, shapeFilter }
// 对应 py/app.py._backtest
import { backtest } from "../../engine.js";
import { loadDraws, json, preflight } from "./_common.js";

export const onRequestOptions = () => preflight();

export async function onRequestPost(context) {
  try {
    let data = {};
    try {
      data = await context.request.json();
    } catch (_) {
      data = {};
    }

    const strategy = String(data.strategy || "random");

    // 严格校验：注数 1–50、期数 20–400，均须为正整数（拒绝小数/字母/负数/越界）。
    // 与 py/app.py._backtest 行为保持一致：非法输入直接返回 400，而不是静默夹紧。
    const isPosInt = (v) =>
      typeof v === "number"
        ? Number.isInteger(v) && v > 0
        : typeof v === "string"
          ? /^\d+$/.test(v.trim()) && parseInt(v, 10) > 0
          : false;
    const toInt = (v) => (typeof v === "string" ? parseInt(v, 10) : v);

    if (!isPosInt(data.count ?? 5) || toInt(data.count ?? 5) < 1 || toInt(data.count ?? 5) > 50) {
      return json({ ok: false, error: "回测注数需为 1–50 之间的正整数" }, 400);
    }
    const count = toInt(data.count ?? 5);

    if (!isPosInt(data.periods ?? 150) || toInt(data.periods ?? 150) < 20 || toInt(data.periods ?? 150) > 400) {
      return json({ ok: false, error: "回测期数需为 20–400 之间的正整数" }, 400);
    }
    const periods = toInt(data.periods ?? 150);

    const draws = await loadDraws(context);
    // 防止 KV/静态历史过多（如刷新型拉取了上万期）导致回测 O(n^2) 触发 Cloudflare CPU 限额：
    // 最近 periods 期回测只需最近 (periods + minTrain) 期数据，更早的期数不会影响结果。
    const minTrain = Math.min(200, Math.max(50, draws.length - periods));
    const need = periods + minTrain;
    const used = draws.length > need ? draws.slice(draws.length - need) : draws;
    const r = backtest(used, {
      count,
      strategy,
      periods,
      blueCover: !!(data.blueCover ?? false),
      shapeFilter: !!(data.shapeFilter ?? false),
      minTrain,
    });
    r.ok = true;
    return json(r);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

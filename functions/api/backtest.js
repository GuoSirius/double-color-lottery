// POST /api/backtest —— 滚动回测（用历史前 N 期预测第 N+1 期）
// 请求体：{ strategy, count, periods, blueCover, shapeFilter }
// 对应 py/app.py._backtest
import { backtest } from "../../engine.js";
import { loadDraws, json } from "./_common.js";

export async function onRequestPost(context) {
  try {
    let data = {};
    try {
      data = await context.request.json();
    } catch (_) {
      data = {};
    }

    const strategy = String(data.strategy || "random");
    let count;
    try {
      count = Math.max(1, Math.min(parseInt(data.count ?? 5, 10) || 5, 50));
    } catch (_) {
      count = 5;
    }
    let periods;
    try {
      periods = Math.max(20, Math.min(parseInt(data.periods ?? 150, 10) || 150, 400));
    } catch (_) {
      periods = 150;
    }

    const draws = await loadDraws(context);
    const r = backtest(draws, {
      count,
      strategy,
      periods,
      blueCover: !!(data.blueCover ?? false),
      shapeFilter: !!(data.shapeFilter ?? false),
      minTrain: Math.min(200, Math.max(50, draws.length - periods)),
    });
    r.ok = true;
    return json(r);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

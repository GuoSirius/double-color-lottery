// POST /api/generate —— 按策略生成双色球号码
// 请求体：{ strategy, count, dedupe, blueCover, shapeFilter }
// 对应 py/app.py._generate
import { generateNumbers, shapeOf } from "../../engine.js";
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
      count = Math.max(1, Math.min(parseInt(data.count ?? 5, 10) || 5, 200));
    } catch (_) {
      count = 5;
    }
    const dedupe = data.dedupe !== false; // 默认去重
    const blueCover = !!(data.blueCover ?? false);
    const shapeFilter = !!(data.shapeFilter ?? false);

    const draws = await loadDraws(context);
    const results = generateNumbers(draws, {
      strategy,
      count,
      dedupe,
      blueCover,
      shapeFilter,
    });

    const covered = new Set(results.map((d) => d.blue)).size;
    return json({
      ok: true,
      strategy,
      count: results.length,
      cost: results.length * 2,
      blueCover,
      shapeFilter,
      blueCovered: covered,
      // 蓝球覆盖数 / 16 = 本期至少中一注六等奖的确定概率
      guaranteeRate: Math.round((Math.min(covered, 16) / 16) * 10000) / 10000,
      numbers: results.map((d) => ({
        reds: d.redsSorted(),
        blue: d.blue,
        shape: shapeOf(d.reds),
      })),
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

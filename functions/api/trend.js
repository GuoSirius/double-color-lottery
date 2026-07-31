// GET /api/trend —— 走势摘要（热号/冷号/区间/每号频率遗漏/形态统计）
import { TrendAnalyzer, STRATEGIES, STRATEGY_DESC } from "../../engine.js";
import { loadDraws, json, preflight } from "./_common.js";

export const onRequestOptions = () => preflight();

export async function onRequest(context) {
  try {
    const draws = await loadDraws(context);
    const ta = new TrendAnalyzer(draws);
    const rf = ta.redFrequency(), ro = ta.redOmission();
    const bf = ta.blueFrequency(), bo = ta.blueOmission();
    const tier = ta.redTier();

    const hot = Object.entries(rf).map(([k, v]) => [Number(k), v])
      .sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cold = Object.entries(ro).map(([k, v]) => [Number(k), v])
      .sort((a, b) => b[1] - a[1]).slice(0, 10);

    const red = {};
    for (let r = 1; r <= 33; r++)
      red[r] = { freq: rf[r] || 0, omission: ro[r] != null ? ro[r] : ta.n, tier: tier[r] };
    const blue = {};
    for (let b = 1; b <= 16; b++)
      blue[b] = { freq: bf[b] || 0, omission: bo[b] != null ? bo[b] : ta.n };

    const st = ta.shapeStats();
    const b = ta.shapeBounds();
    const latest = draws[draws.length - 1];

    return json({
      ok: true,
      n: ta.n,
      latest: latest
        ? { issue: latest.issue, date: latest.date, reds: [...latest.reds].sort((a, b) => a - b), blue: latest.blue }
        : null,
      hot,
      cold,
      zones: ta.zoneDistribution(),
      red,
      blue,
      shape: st,
      bounds: {
        sum: [b.sum_min, b.sum_max],
        span: [b.span_min, b.span_max],
        odd: [...b.odd_ok].sort((a, b) => a - b),
        big: [...b.big_ok].sort((a, b) => a - b),
        maxConsecutive: b.max_consecutive,
        minAc: b.min_ac,
      },
      strategies: STRATEGIES.map((k) => ({ key: k, desc: STRATEGY_DESC[k] })),
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

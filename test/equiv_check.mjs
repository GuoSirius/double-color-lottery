// 等效性校验（Node 侧）：用 engine.js 跑同一份数据，输出规范化签名
import { TrendAnalyzer, parseCSV, generateNumbers, seedRng } from "../engine.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(HERE, "..", "data", "sample_history.csv"), "utf-8");
const draws = parseCSV(csv);
const ta = new TrendAnalyzer(draws);
const redFreq = ta.redFrequency();
const blueFreq = ta.blueFrequency();
const bounds = ta.shapeBounds();
const st = ta.shapeStats();
const last = draws[draws.length - 1];

const trendSig = {
  n: ta.n,
  latest: [last.issue, last.date, last.redsSorted(), last.blue],
  red_freq_sum: Object.values(redFreq).reduce((s, v) => s + v, 0),
  blue_freq_sum: Object.values(blueFreq).reduce((s, v) => s + v, 0),
  hot_top5: Object.entries(redFreq).sort((a, b) => b[1] - a[1]).slice(0, 5),
  bounds: {
    sum_min: bounds.sum_min, sum_max: bounds.sum_max,
    span_min: bounds.span_min, span_max: bounds.span_max,
    max_consecutive: bounds.max_consecutive, min_ac: bounds.min_ac,
  },
  shape_sum_mean: st.sum.mean,
  odd_ok: [...bounds.odd_ok].sort((a, b) => a - b),
  big_ok: [...bounds.big_ok].sort((a, b) => a - b),
};
console.log("TREND_SIG=" + JSON.stringify(trendSig));

// 同种子下，node(mulberry32) 与 py(Mersenne Twister) 必然不同
seedRng(1);
const g = generateNumbers(draws, { strategy: "random", count: 3 });
console.log("GEN_NODE_SEEDED=" + JSON.stringify(g.map((d) => [d.redsSorted(), d.blue])));

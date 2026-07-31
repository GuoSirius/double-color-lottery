// 双色球走势分析与智能选号引擎（JavaScript 移植版，对应 py/ssq.py）
//
// 设计目标：与 Python 版逐一对齐算法逻辑，输出结构一致，便于在浏览器 /
// Cloudflare Pages Functions 中运行。纯算法，无第三方依赖。
//
// 规则常量：红球 1-33 选 6（不重复），蓝球 1-16 选 1。
//
// 说明：双色球每期开奖是独立的均匀随机抽样，过去不影响未来。本引擎的
// "走势分析 / 加权选号" 只是按统计偏好生成号码的娱乐/参考方法，不会提高
// 中奖概率。蓝球全覆盖（买满 16 注）是唯一数学上确定保底六等奖的手段。
//
// 模块格式：本文件为标准 ES Module（使用 export 语法）。Cloudflare Pages Functions 与
// 浏览器通过 `import { ... } from './engine.js'` 引入；在 Node >= 24 下也可直接
// `require('./engine.js')` 以 CommonJS 方式使用（Node 原生支持 require(ESM)），无需动态导入降级，
// 也无需维护第二份 CJS 副本。基线 Node 版本为 24，代码实现不兼容更低版本。

// ---------- 规则常量 ----------
const RED_MIN = 1, RED_MAX = 33, BLUE_MIN = 1, BLUE_MAX = 16;
const RED_PICK = 6, BLUE_PICK = 1;
const RED_RANGE = Array.from({ length: RED_MAX - RED_MIN + 1 }, (_, i) => RED_MIN + i);
const BLUE_RANGE = Array.from({ length: BLUE_MAX - BLUE_MIN + 1 }, (_, i) => BLUE_MIN + i);

// ---------- 可复现随机数（mulberry32）----------
let _rng = Math.random;
export function seedRng(seed) {
  let a = seed >>> 0;
  _rng = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function resetRng() { _rng = Math.random; }
function rand() { return _rng(); }

// ---------- 数据层 ----------
export class Draw {
  constructor(issue, date, reds, blue) {
    this.issue = issue;
    this.date = date;
    this.reds = reds;
    this.blue = blue;
  }
  redsSorted() { return [...this.reds].sort((a, b) => a - b); }
  formatted() {
    const r = this.redsSorted().map((n) => String(n).padStart(2, "0")).join(" ");
    return `${r}  + ${String(this.blue).padStart(2, "0")}`;
  }
}

// 引号感知的 CSV 行解析（支持字段内嵌逗号，如 "04,06,10,18,23,31"）
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCSV(text) {
  // 去掉可能存在的 UTF-8 BOM（Python csv 以 utf-8-sig 写出）
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map((h) => h.trim());
  const idx = (names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0);
  const iIssue = idx(["issue", "期号"]) ?? 0;
  const iDate = idx(["date", "日期", "开奖日期"]) ?? 1;
  const iRed = idx(["red", "红球", "红球号码"]);
  const iBlue = idx(["blue", "蓝球", "蓝球号码"]);

  const draws = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]).map((c) => c.trim());
    if (cols.every((c) => !c.trim())) continue;
    const issue = (cols[iIssue] || "").trim();
    const date = (cols[iDate] || "").trim();
    let reds;
    if (iRed != null && iRed >= 0) {
      reds = cols[iRed].split(/[\s,]+/).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
    } else {
      reds = [];
      for (let k = 1; k <= RED_PICK; k++) {
        const v = parseInt(cols[idx([`red${k}`])], 10);
        if (!isNaN(v)) reds.push(v);
      }
    }
    const blue = parseInt((cols[iBlue] != null ? cols[iBlue] : cols[cols.length - 1]).trim(), 10);
    if (reds.length !== RED_PICK || isNaN(blue)) continue;
    draws.push(new Draw(issue, date, reds, blue));
  }
  draws.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.issue || "").localeCompare(b.issue || ""));
  return draws;
}

// ---------- 形态指标层 ----------
export function redSum(reds) { return reds.reduce((s, x) => s + x, 0); }
export function oddCount(reds) { return reds.filter((r) => r % 2 === 1).length; }
export function bigCount(reds) { return reds.filter((r) => r >= 17).length; }
export function consecutivePairs(reds) {
  const s = [...reds].sort((a, b) => a - b);
  let c = 0;
  for (let i = 0; i < s.length - 1; i++) if (s[i + 1] - s[i] === 1) c++;
  return c;
}
export function span(reds) { return Math.max(...reds) - Math.min(...reds); }
export function acValue(reds) {
  const s = [...reds].sort((a, b) => a - b);
  const diffs = new Set();
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) diffs.add(Math.abs(s[i] - s[j]));
  return diffs.size - (s.length - 1);
}
export function zonePattern(reds) {
  const z = [0, 0, 0];
  for (const r of reds) {
    if (r <= 11) z[0]++;
    else if (r <= 22) z[1]++;
    else z[2]++;
  }
  return z;
}
export function shapeOf(reds) {
  return {
    sum: redSum(reds),
    odd: oddCount(reds),
    even: reds.length - oddCount(reds),
    big: bigCount(reds),
    small: reds.length - bigCount(reds),
    consecutive: consecutivePairs(reds),
    span: span(reds),
    ac: acValue(reds),
    zone: zonePattern(reds),
  };
}

// ---------- 奖级判定 ----------
// (红球命中数, 蓝球是否命中) -> [奖级, 奖级名, 奖金]
export const PRIZE_TABLE = {
  "6,true": [1, "一等奖", 5000000],
  "6,false": [2, "二等奖", 150000],
  "5,true": [3, "三等奖", 3000],
  "5,false": [4, "四等奖", 200],
  "4,true": [4, "四等奖", 200],
  "4,false": [5, "五等奖", 10],
  "3,true": [5, "五等奖", 10],
  "2,true": [6, "六等奖", 5],
  "1,true": [6, "六等奖", 5],
  "0,true": [6, "六等奖", 5],
};
export const TICKET_PRICE = 2;

export function judge(ticket, actual) {
  const hitRed = new Set(ticket.reds).intersection
    ? new Set(ticket.reds).intersection(new Set(actual.reds)).size
    : [...new Set(ticket.reds)].filter((x) => new Set(actual.reds).has(x)).length;
  const hitBlue = ticket.blue === actual.blue;
  const key = `${hitRed},${hitBlue}`;
  return PRIZE_TABLE[key] || [0, "未中奖", 0];
}

// ---------- 分析层 ----------
export class TrendAnalyzer {
  constructor(draws) {
    if (!draws || !draws.length) throw new Error("历史数据为空，无法分析走势。");
    this.draws = draws;
    this.n = draws.length;
  }
  redFrequency() {
    const c = {};
    for (const d of this.draws) for (const r of d.reds) c[r] = (c[r] || 0) + 1;
    return c;
  }
  blueFrequency() {
    const c = {};
    for (const d of this.draws) c[d.blue] = (c[d.blue] || 0) + 1;
    return c;
  }
  redOmission() {
    const lastSeen = {};
    this.draws.forEach((d, idx) => { for (const r of d.reds) lastSeen[r] = idx; });
    const out = {};
    for (const r of RED_RANGE) out[r] = this.n - 1 - (lastSeen[r] != null ? lastSeen[r] : -1);
    return out;
  }
  blueOmission() {
    const lastSeen = {};
    this.draws.forEach((d, idx) => { lastSeen[d.blue] = idx; });
    const out = {};
    for (const b of BLUE_RANGE) out[b] = this.n - 1 - (lastSeen[b] != null ? lastSeen[b] : -1);
    return out;
  }
  redTier() {
    const freq = this.redFrequency();
    const vals = Object.values(freq).sort((a, b) => a - b);
    const q1 = vals[Math.floor(vals.length / 3)];
    const q2 = vals[Math.floor((2 * vals.length) / 3)];
    const out = {};
    for (const r of RED_RANGE) {
      const fv = freq[r] || 0;
      out[r] = fv >= q2 ? "热" : fv >= q1 ? "温" : "冷";
    }
    return out;
  }
  zoneDistribution() {
    const counts = { "01-11": 0, "12-22": 0, "23-33": 0 };
    for (const d of this.draws) for (const r of d.reds) {
      if (r <= 11) counts["01-11"]++;
      else if (r <= 22) counts["12-22"]++;
      else counts["23-33"]++;
    }
    const total = Object.values(counts).reduce((s, x) => s + x, 0) || 1;
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / total]));
  }
  weights(mode = "hot") {
    const rf = this.redFrequency(), bf = this.blueFrequency();
    const ro = this.redOmission(), bo = this.blueOmission();
    const build = (freq, omis, pool) => {
      const w = {};
      for (const x of pool) {
        const f = freq[x] || 0;
        const o = omis[x] != null ? omis[x] : this.n;
        if (mode === "hot" || mode === "frequency") w[x] = f + 1.0;
        else if (mode === "cold" || mode === "omission") w[x] = Math.pow(o + 1.0, 1.3);
        else w[x] = (f + 1.0) * Math.pow(o + 1.0, 0.5);
      }
      return w;
    };
    return [build(rf, ro, RED_RANGE), build(bf, bo, BLUE_RANGE)];
  }
  _pct(vals, p) {
    const s = [...vals].sort((a, b) => a - b);
    const idx = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))));
    return s[idx];
  }
  shapeStats() {
    const sums = this.draws.map((d) => redSum(d.reds));
    const odds = {}, bigs = {}, cons = {}, acs = {}, zones = {};
    for (const d of this.draws) {
      const o = oddCount(d.reds); odds[o] = (odds[o] || 0) + 1;
      const b = bigCount(d.reds); bigs[b] = (bigs[b] || 0) + 1;
      const c = consecutivePairs(d.reds); cons[c] = (cons[c] || 0) + 1;
      const a = acValue(d.reds); acs[a] = (acs[a] || 0) + 1;
      const z = zonePattern(d.reds).join("-"); zones[z] = (zones[z] || 0) + 1;
    }
    const mean = (arr) => Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10;
    const topZones = Object.entries(zones).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));
    return {
      n: this.n,
      sum: { mean: mean(sums), min: Math.min(...sums), max: Math.max(...sums), p10: this._pct(sums, 0.10), p90: this._pct(sums, 0.90) },
      span: { mean: mean(this.draws.map((d) => span(d.reds))), p10: this._pct(this.draws.map((d) => span(d.reds)), 0.10), p90: this._pct(this.draws.map((d) => span(d.reds)), 0.90) },
      odd_dist: Object.fromEntries(Object.entries(odds).sort((a, b) => a[0] - b[0])),
      big_dist: Object.fromEntries(Object.entries(bigs).sort((a, b) => a[0] - b[0])),
      consecutive_dist: Object.fromEntries(Object.entries(cons).sort((a, b) => a[0] - b[0])),
      ac_dist: Object.fromEntries(Object.entries(acs).sort((a, b) => a[0] - b[0])),
      top_zone_patterns: topZones,
    };
  }
  shapeBounds(coverage = 0.80) {
    const st = this.shapeStats();
    const sums = this.draws.map((d) => redSum(d.reds));
    const spans = this.draws.map((d) => span(d.reds));
    const tail = (1.0 - coverage) / 2.0;
    const commonKeys = (dist) => {
      const total = Object.values(dist).reduce((s, x) => s + x, 0) || 1;
      let acc = 0; const keep = new Set();
      for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
        keep.add(Number(k)); acc += v;
        if (acc / total >= coverage) break;
      }
      return keep;
    };
    return {
      sum_min: this._pct(sums, tail), sum_max: this._pct(sums, 1 - tail),
      span_min: this._pct(spans, tail), span_max: this._pct(spans, 1 - tail),
      odd_ok: commonKeys(st.odd_dist),
      big_ok: commonKeys(st.big_dist),
      max_consecutive: Math.max(...commonKeys(st.consecutive_dist)),
      min_ac: Math.min(...commonKeys(st.ac_dist)),
    };
  }
  isTypical(reds, bounds) {
    const b = bounds || this.shapeBounds();
    if (!(b.sum_min <= redSum(reds) && redSum(reds) <= b.sum_max)) return false;
    if (!(b.span_min <= span(reds) && span(reds) <= b.span_max)) return false;
    if (!b.odd_ok.has(oddCount(reds))) return false;
    if (!b.big_ok.has(bigCount(reds))) return false;
    if (consecutivePairs(reds) > b.max_consecutive) return false;
    if (acValue(reds) < b.min_ac) return false;
    return true;
  }
}

// ---------- 生成层 ----------
function weightedSample(population, weights, k) {
  const eps = 1e-9;
  const chosen = [];
  population.forEach((x, i) => {
    let w = Math.max(weights[i], eps);
    const key = Math.pow(rand(), 1.0 / w);
    chosen.push([key, x]);
  });
  chosen.sort((a, b) => b[0] - a[0]);
  return chosen.slice(0, k).map((t) => t[1]);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sampleN(population, k) { return shuffle(population).slice(0, k); }

export const STRATEGIES = ["random", "hot", "cold", "balanced", "zone", "spread"];
export const STRATEGY_DESC = {
  random: "纯随机 —— 与机选等价，数学上最公平",
  hot: "追热 —— 高频号码权重更大",
  cold: "博冷 —— 高遗漏号码权重更大",
  balanced: "均衡 —— 频率与遗漏综合加权",
  zone: "分区 —— 三个区间各取 2 个，贴合最常见的 2-2-2 形态",
  spread: "分散 —— 压低热门号与生日号(≤31)权重，降低撞号被摊薄奖金的概率",
};

export class NumberGenerator {
  constructor(analyzer = null) {
    this.analyzer = analyzer;
    this._bounds = null;
  }
  randomDraw() {
    const reds = sampleN(RED_RANGE, RED_PICK).sort((a, b) => a - b);
    const blue = BLUE_RANGE[Math.floor(rand() * BLUE_RANGE.length)];
    return new Draw("", "", reds, blue);
  }
  weightedDraw(mode = "hot") {
    if (!this.analyzer) throw new Error("加权选号需要历史数据（TrendAnalyzer）。");
    const [redW, blueW] = this.analyzer.weights(mode);
    const reds = weightedSample(RED_RANGE, RED_RANGE.map((r) => redW[r]), RED_PICK);
    const blue = weightedSample(BLUE_RANGE, BLUE_RANGE.map((b) => blueW[b]), BLUE_PICK)[0];
    return new Draw("", "", [...reds].sort((a, b) => a - b), blue);
  }
  zoneDraw() {
    const zones = [RED_RANGE.slice(0, 11), RED_RANGE.slice(11, 22), RED_RANGE.slice(22, 33)];
    const redW = this.analyzer ? this.analyzer.weights("balanced")[0] : null;
    const blueW = this.analyzer ? this.analyzer.weights("balanced")[1] : null;
    const reds = [];
    for (const z of zones) {
      const w = redW ? z.map((r) => redW[r]) : z.map(() => 1.0);
      reds.push(...weightedSample(z, w, 2));
    }
    const bw = blueW ? BLUE_RANGE.map((b) => blueW[b]) : BLUE_RANGE.map(() => 1.0);
    const blue = weightedSample(BLUE_RANGE, bw, 1)[0];
    return new Draw("", "", [...reds].sort((a, b) => a - b), blue);
  }
  spreadDraw() {
    const freq = this.analyzer ? this.analyzer.redFrequency() : {};
    const maxF = Math.max(1, ...Object.values(freq));
    const w = {};
    for (const r of RED_RANGE) {
      let base = 1.0;
      if (r <= 31) base *= 0.65;
      const f = (freq[r] || 0) / maxF;
      base *= (1.35 - 0.7 * f);
      w[r] = base;
    }
    const reds = weightedSample(RED_RANGE, RED_RANGE.map((r) => w[r]), RED_PICK);
    const bw = BLUE_RANGE.map((b) => (b <= 12 ? 0.7 : 1.4));
    const blue = weightedSample(BLUE_RANGE, bw, 1)[0];
    return new Draw("", "", [...reds].sort((a, b) => a - b), blue);
  }
  _one(strategy) {
    if (strategy === "random") return this.randomDraw();
    if (strategy === "zone") return this.zoneDraw();
    if (strategy === "spread") return this.spreadDraw();
    return this.weightedDraw(strategy);
  }
  _blueSequence(count) {
    let pool = [...BLUE_RANGE];
    if (this.analyzer) {
      const bo = this.analyzer.blueOmission();
      pool.sort((a, b) => (bo[b] != null ? bo[b] : 0) - (bo[a] != null ? bo[a] : 0));
      const head = shuffle(pool.slice(0, 8));
      const tail = shuffle(pool.slice(8));
      pool = head.concat(tail);
    } else {
      pool = shuffle(pool);
    }
    const seq = [];
    while (seq.length < count) {
      const chunk = [...pool];
      if (seq.length) shuffle(chunk);
      seq.push(...chunk);
    }
    return seq.slice(0, count);
  }
  generate(opts = {}) {
    const count = opts.count ?? 5;
    const strategy = opts.strategy ?? "random";
    const dedupe = opts.dedupe ?? true;
    const blueCover = opts.blueCover ?? opts.blue_cover ?? false;
    const shapeFilter = opts.shapeFilter ?? opts.shape_filter ?? false;
    if (!STRATEGIES.includes(strategy)) throw new Error(`未知策略 ${strategy}`);
    if (count <= 0) throw new Error("注数必须为正整数。");
    if (shapeFilter && !this.analyzer) throw new Error("形态过滤需要历史数据。");
    let bounds = null;
    if (shapeFilter) {
      if (!this._bounds) this._bounds = this.analyzer.shapeBounds();
      bounds = this._bounds;
    }
    const out = [];
    const seen = new Set();
    let attempts = 0;
    const maxAttempts = count * 200 + 500;
    while (out.length < count && attempts < maxAttempts) {
      attempts++;
      const d = this._one(strategy);
      if (bounds && !this.analyzer.isTypical(d.reds, bounds)) continue;
      const key = d.redsSorted().join(",") + ":" + d.blue;
      if (dedupe && seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
    while (out.length < count) out.push(this._one(strategy));
    if (blueCover) {
      const seq = this._blueSequence(out.length);
      out.forEach((d, i) => { d.blue = seq[i]; });
    }
    return out;
  }
}

// ---------- 回测层 ----------
export function backtest(draws, opts = {}) {
  const count = opts.count ?? 5;
  const strategy = opts.strategy ?? "random";
  const periods = opts.periods ?? 100;
  const blueCover = opts.blueCover ?? opts.blue_cover ?? false;
  const shapeFilter = opts.shapeFilter ?? opts.shape_filter ?? false;
  const minTrain = opts.minTrain ?? 50;
  const seed = opts.seed;
  if (seed != null) seedRng(seed);
  if (draws.length <= minTrain) throw new Error(`历史数据不足，至少需要 ${minTrain + 1} 期。`);
  const start = Math.max(minTrain, draws.length - periods);
  const levelNames = ["一等奖", "二等奖", "三等奖", "四等奖", "五等奖", "六等奖"];
  let tested = 0, hitPeriods = 0, hitTickets = 0, totalPrize = 0, totalCost = 0;
  const levelCounter = {};
  for (let i = start; i < draws.length; i++) {
    const history = draws.slice(0, i);
    const actual = draws[i];
    const analyzer = new TrendAnalyzer(history);
    const gen = new NumberGenerator(analyzer);
    let tickets;
    try {
      tickets = gen.generate({ count, strategy, dedupe: true, blueCover, shapeFilter });
    } catch (e) { continue; }
    tested++;
    totalCost += count * TICKET_PRICE;
    let periodHit = false;
    for (const t of tickets) {
      const [lvl, name, prize] = judge(t, actual);
      if (lvl) {
        levelCounter[name] = (levelCounter[name] || 0) + 1;
        totalPrize += prize;
        hitTickets++;
        periodHit = true;
      }
    }
    if (periodHit) hitPeriods++;
  }
  const levels = {};
  for (const k of levelNames) if (levelCounter[k]) levels[k] = levelCounter[k];
  return {
    strategy,
    count_per_period: count,
    blue_cover: blueCover,
    shape_filter: shapeFilter,
    periods_tested: tested,
    periods_hit: hitPeriods,
    period_hit_rate: tested ? Math.round((hitPeriods / tested) * 10000) / 10000 : 0,
    tickets_total: tested * count,
    tickets_hit: hitTickets,
    ticket_hit_rate: tested ? Math.round((hitTickets / (tested * count)) * 10000) / 10000 : 0,
    levels,
    total_cost: totalCost,
    total_prize: totalPrize,
    roi: totalCost ? Math.round(((totalPrize - totalCost) / totalCost) * 10000) / 10000 : 0,
  };
}

// ---------- 便捷函数 ----------
export function generateNumbers(draws, opts = {}) {
  const analyzer = draws && draws.length ? new TrendAnalyzer(draws) : null;
  const strategy = opts.strategy ?? "random";
  if (!["random", "spread", "zone"].includes(strategy) && !analyzer)
    throw new Error("使用 hot/cold/balanced 策略需要提供历史数据。");
  if (opts.shapeFilter && !analyzer) throw new Error("形态过滤需要提供历史数据。");
  const gen = new NumberGenerator(analyzer);
  return gen.generate(opts);
}

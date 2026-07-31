var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../engine.js
var RED_MIN = 1;
var RED_MAX = 33;
var BLUE_MIN = 1;
var BLUE_MAX = 16;
var RED_PICK = 6;
var BLUE_PICK = 1;
var RED_RANGE = Array.from({ length: RED_MAX - RED_MIN + 1 }, (_, i) => RED_MIN + i);
var BLUE_RANGE = Array.from({ length: BLUE_MAX - BLUE_MIN + 1 }, (_, i) => BLUE_MIN + i);
var _rng = Math.random;
function seedRng(seed) {
  let a = seed >>> 0;
  _rng = /* @__PURE__ */ __name(function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }, "_rng");
}
__name(seedRng, "seedRng");
function rand() {
  return _rng();
}
__name(rand, "rand");
var Draw = class {
  static {
    __name(this, "Draw");
  }
  constructor(issue, date, reds, blue) {
    this.issue = issue;
    this.date = date;
    this.reds = reds;
    this.blue = blue;
  }
  redsSorted() {
    return [...this.reds].sort((a, b) => a - b);
  }
  formatted() {
    const r = this.redsSorted().map((n) => String(n).padStart(2, "0")).join(" ");
    return `${r}  + ${String(this.blue).padStart(2, "0")}`;
  }
};
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
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
__name(splitCSVLine, "splitCSVLine");
function parseCSV(text) {
  if (text.charCodeAt(0) === 65279) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map((h) => h.trim());
  const idx = /* @__PURE__ */ __name((names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0), "idx");
  const iIssue = idx(["issue", "\u671F\u53F7"]) ?? 0;
  const iDate = idx(["date", "\u65E5\u671F", "\u5F00\u5956\u65E5\u671F"]) ?? 1;
  const iRed = idx(["red", "\u7EA2\u7403", "\u7EA2\u7403\u53F7\u7801"]);
  const iBlue = idx(["blue", "\u84DD\u7403", "\u84DD\u7403\u53F7\u7801"]);
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
__name(parseCSV, "parseCSV");
function redSum(reds) {
  return reds.reduce((s, x) => s + x, 0);
}
__name(redSum, "redSum");
function oddCount(reds) {
  return reds.filter((r) => r % 2 === 1).length;
}
__name(oddCount, "oddCount");
function bigCount(reds) {
  return reds.filter((r) => r >= 17).length;
}
__name(bigCount, "bigCount");
function consecutivePairs(reds) {
  const s = [...reds].sort((a, b) => a - b);
  let c = 0;
  for (let i = 0; i < s.length - 1; i++) if (s[i + 1] - s[i] === 1) c++;
  return c;
}
__name(consecutivePairs, "consecutivePairs");
function span(reds) {
  return Math.max(...reds) - Math.min(...reds);
}
__name(span, "span");
function acValue(reds) {
  const s = [...reds].sort((a, b) => a - b);
  const diffs = /* @__PURE__ */ new Set();
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) diffs.add(Math.abs(s[i] - s[j]));
  return diffs.size - (s.length - 1);
}
__name(acValue, "acValue");
function zonePattern(reds) {
  const z = [0, 0, 0];
  for (const r of reds) {
    if (r <= 11) z[0]++;
    else if (r <= 22) z[1]++;
    else z[2]++;
  }
  return z;
}
__name(zonePattern, "zonePattern");
function shapeOf(reds) {
  return {
    sum: redSum(reds),
    odd: oddCount(reds),
    even: reds.length - oddCount(reds),
    big: bigCount(reds),
    small: reds.length - bigCount(reds),
    consecutive: consecutivePairs(reds),
    span: span(reds),
    ac: acValue(reds),
    zone: zonePattern(reds)
  };
}
__name(shapeOf, "shapeOf");
var PRIZE_TABLE = {
  "6,true": [1, "\u4E00\u7B49\u5956", 5e6],
  "6,false": [2, "\u4E8C\u7B49\u5956", 15e4],
  "5,true": [3, "\u4E09\u7B49\u5956", 3e3],
  "5,false": [4, "\u56DB\u7B49\u5956", 200],
  "4,true": [4, "\u56DB\u7B49\u5956", 200],
  "4,false": [5, "\u4E94\u7B49\u5956", 10],
  "3,true": [5, "\u4E94\u7B49\u5956", 10],
  "2,true": [6, "\u516D\u7B49\u5956", 5],
  "1,true": [6, "\u516D\u7B49\u5956", 5],
  "0,true": [6, "\u516D\u7B49\u5956", 5]
};
var TICKET_PRICE = 2;
function judge(ticket, actual) {
  const hitRed = new Set(ticket.reds).intersection ? new Set(ticket.reds).intersection(new Set(actual.reds)).size : [...new Set(ticket.reds)].filter((x) => new Set(actual.reds).has(x)).length;
  const hitBlue = ticket.blue === actual.blue;
  const key = `${hitRed},${hitBlue}`;
  return PRIZE_TABLE[key] || [0, "\u672A\u4E2D\u5956", 0];
}
__name(judge, "judge");
var TrendAnalyzer = class {
  static {
    __name(this, "TrendAnalyzer");
  }
  constructor(draws) {
    if (!draws || !draws.length) throw new Error("\u5386\u53F2\u6570\u636E\u4E3A\u7A7A\uFF0C\u65E0\u6CD5\u5206\u6790\u8D70\u52BF\u3002");
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
    this.draws.forEach((d, idx) => {
      for (const r of d.reds) lastSeen[r] = idx;
    });
    const out = {};
    for (const r of RED_RANGE) out[r] = this.n - 1 - (lastSeen[r] != null ? lastSeen[r] : -1);
    return out;
  }
  blueOmission() {
    const lastSeen = {};
    this.draws.forEach((d, idx) => {
      lastSeen[d.blue] = idx;
    });
    const out = {};
    for (const b of BLUE_RANGE) out[b] = this.n - 1 - (lastSeen[b] != null ? lastSeen[b] : -1);
    return out;
  }
  redTier() {
    const freq = this.redFrequency();
    const vals = Object.values(freq).sort((a, b) => a - b);
    const q1 = vals[Math.floor(vals.length / 3)];
    const q2 = vals[Math.floor(2 * vals.length / 3)];
    const out = {};
    for (const r of RED_RANGE) {
      const fv = freq[r] || 0;
      out[r] = fv >= q2 ? "\u70ED" : fv >= q1 ? "\u6E29" : "\u51B7";
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
    const build = /* @__PURE__ */ __name((freq, omis, pool) => {
      const w = {};
      for (const x of pool) {
        const f = freq[x] || 0;
        const o = omis[x] != null ? omis[x] : this.n;
        if (mode === "hot" || mode === "frequency") w[x] = f + 1;
        else if (mode === "cold" || mode === "omission") w[x] = Math.pow(o + 1, 1.3);
        else w[x] = (f + 1) * Math.pow(o + 1, 0.5);
      }
      return w;
    }, "build");
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
      const o = oddCount(d.reds);
      odds[o] = (odds[o] || 0) + 1;
      const b = bigCount(d.reds);
      bigs[b] = (bigs[b] || 0) + 1;
      const c = consecutivePairs(d.reds);
      cons[c] = (cons[c] || 0) + 1;
      const a = acValue(d.reds);
      acs[a] = (acs[a] || 0) + 1;
      const z = zonePattern(d.reds).join("-");
      zones[z] = (zones[z] || 0) + 1;
    }
    const mean = /* @__PURE__ */ __name((arr) => Math.round(arr.reduce((s, x) => s + x, 0) / arr.length * 10) / 10, "mean");
    const topZones = Object.entries(zones).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pattern, count]) => ({ pattern, count }));
    return {
      n: this.n,
      sum: { mean: mean(sums), min: Math.min(...sums), max: Math.max(...sums), p10: this._pct(sums, 0.1), p90: this._pct(sums, 0.9) },
      span: { mean: mean(this.draws.map((d) => span(d.reds))), p10: this._pct(this.draws.map((d) => span(d.reds)), 0.1), p90: this._pct(this.draws.map((d) => span(d.reds)), 0.9) },
      odd_dist: Object.fromEntries(Object.entries(odds).sort((a, b) => a[0] - b[0])),
      big_dist: Object.fromEntries(Object.entries(bigs).sort((a, b) => a[0] - b[0])),
      consecutive_dist: Object.fromEntries(Object.entries(cons).sort((a, b) => a[0] - b[0])),
      ac_dist: Object.fromEntries(Object.entries(acs).sort((a, b) => a[0] - b[0])),
      top_zone_patterns: topZones
    };
  }
  shapeBounds(coverage = 0.8) {
    const st = this.shapeStats();
    const sums = this.draws.map((d) => redSum(d.reds));
    const spans = this.draws.map((d) => span(d.reds));
    const tail = (1 - coverage) / 2;
    const commonKeys = /* @__PURE__ */ __name((dist) => {
      const total = Object.values(dist).reduce((s, x) => s + x, 0) || 1;
      let acc = 0;
      const keep = /* @__PURE__ */ new Set();
      for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
        keep.add(Number(k));
        acc += v;
        if (acc / total >= coverage) break;
      }
      return keep;
    }, "commonKeys");
    return {
      sum_min: this._pct(sums, tail),
      sum_max: this._pct(sums, 1 - tail),
      span_min: this._pct(spans, tail),
      span_max: this._pct(spans, 1 - tail),
      odd_ok: commonKeys(st.odd_dist),
      big_ok: commonKeys(st.big_dist),
      max_consecutive: Math.max(...commonKeys(st.consecutive_dist)),
      min_ac: Math.min(...commonKeys(st.ac_dist))
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
};
function weightedSample(population, weights, k) {
  const eps = 1e-9;
  const chosen = [];
  population.forEach((x, i) => {
    let w = Math.max(weights[i], eps);
    const key = Math.pow(rand(), 1 / w);
    chosen.push([key, x]);
  });
  chosen.sort((a, b) => b[0] - a[0]);
  return chosen.slice(0, k).map((t) => t[1]);
}
__name(weightedSample, "weightedSample");
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
__name(shuffle, "shuffle");
function sampleN(population, k) {
  return shuffle(population).slice(0, k);
}
__name(sampleN, "sampleN");
var STRATEGIES = ["random", "hot", "cold", "balanced", "zone", "spread"];
var STRATEGY_DESC = {
  random: "\u7EAF\u968F\u673A \u2014\u2014 \u4E0E\u673A\u9009\u7B49\u4EF7\uFF0C\u6570\u5B66\u4E0A\u6700\u516C\u5E73",
  hot: "\u8FFD\u70ED \u2014\u2014 \u9AD8\u9891\u53F7\u7801\u6743\u91CD\u66F4\u5927",
  cold: "\u535A\u51B7 \u2014\u2014 \u9AD8\u9057\u6F0F\u53F7\u7801\u6743\u91CD\u66F4\u5927",
  balanced: "\u5747\u8861 \u2014\u2014 \u9891\u7387\u4E0E\u9057\u6F0F\u7EFC\u5408\u52A0\u6743",
  zone: "\u5206\u533A \u2014\u2014 \u4E09\u4E2A\u533A\u95F4\u5404\u53D6 2 \u4E2A\uFF0C\u8D34\u5408\u6700\u5E38\u89C1\u7684 2-2-2 \u5F62\u6001",
  spread: "\u5206\u6563 \u2014\u2014 \u538B\u4F4E\u70ED\u95E8\u53F7\u4E0E\u751F\u65E5\u53F7(\u226431)\u6743\u91CD\uFF0C\u964D\u4F4E\u649E\u53F7\u88AB\u644A\u8584\u5956\u91D1\u7684\u6982\u7387"
};
var NumberGenerator = class {
  static {
    __name(this, "NumberGenerator");
  }
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
    if (!this.analyzer) throw new Error("\u52A0\u6743\u9009\u53F7\u9700\u8981\u5386\u53F2\u6570\u636E\uFF08TrendAnalyzer\uFF09\u3002");
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
      const w = redW ? z.map((r) => redW[r]) : z.map(() => 1);
      reds.push(...weightedSample(z, w, 2));
    }
    const bw = blueW ? BLUE_RANGE.map((b) => blueW[b]) : BLUE_RANGE.map(() => 1);
    const blue = weightedSample(BLUE_RANGE, bw, 1)[0];
    return new Draw("", "", [...reds].sort((a, b) => a - b), blue);
  }
  spreadDraw() {
    const freq = this.analyzer ? this.analyzer.redFrequency() : {};
    const maxF = Math.max(1, ...Object.values(freq));
    const w = {};
    for (const r of RED_RANGE) {
      let base = 1;
      if (r <= 31) base *= 0.65;
      const f = (freq[r] || 0) / maxF;
      base *= 1.35 - 0.7 * f;
      w[r] = base;
    }
    const reds = weightedSample(RED_RANGE, RED_RANGE.map((r) => w[r]), RED_PICK);
    const bw = BLUE_RANGE.map((b) => b <= 12 ? 0.7 : 1.4);
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
    if (!STRATEGIES.includes(strategy)) throw new Error(`\u672A\u77E5\u7B56\u7565 ${strategy}`);
    if (count <= 0) throw new Error("\u6CE8\u6570\u5FC5\u987B\u4E3A\u6B63\u6574\u6570\u3002");
    if (shapeFilter && !this.analyzer) throw new Error("\u5F62\u6001\u8FC7\u6EE4\u9700\u8981\u5386\u53F2\u6570\u636E\u3002");
    let bounds = null;
    if (shapeFilter) {
      if (!this._bounds) this._bounds = this.analyzer.shapeBounds();
      bounds = this._bounds;
    }
    const out = [];
    const seen = /* @__PURE__ */ new Set();
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
      out.forEach((d, i) => {
        d.blue = seq[i];
      });
    }
    return out;
  }
};
function backtest(draws, opts = {}) {
  const count = opts.count ?? 5;
  const strategy = opts.strategy ?? "random";
  const periods = opts.periods ?? 100;
  const blueCover = opts.blueCover ?? opts.blue_cover ?? false;
  const shapeFilter = opts.shapeFilter ?? opts.shape_filter ?? false;
  const minTrain = opts.minTrain ?? 50;
  const seed = opts.seed;
  if (seed != null) seedRng(seed);
  if (draws.length <= minTrain) throw new Error(`\u5386\u53F2\u6570\u636E\u4E0D\u8DB3\uFF0C\u81F3\u5C11\u9700\u8981 ${minTrain + 1} \u671F\u3002`);
  const start = Math.max(minTrain, draws.length - periods);
  const levelNames = ["\u4E00\u7B49\u5956", "\u4E8C\u7B49\u5956", "\u4E09\u7B49\u5956", "\u56DB\u7B49\u5956", "\u4E94\u7B49\u5956", "\u516D\u7B49\u5956"];
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
    } catch (e) {
      continue;
    }
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
    period_hit_rate: tested ? Math.round(hitPeriods / tested * 1e4) / 1e4 : 0,
    tickets_total: tested * count,
    tickets_hit: hitTickets,
    ticket_hit_rate: tested ? Math.round(hitTickets / (tested * count) * 1e4) / 1e4 : 0,
    levels,
    total_cost: totalCost,
    total_prize: totalPrize,
    roi: totalCost ? Math.round((totalPrize - totalCost) / totalCost * 1e4) / 1e4 : 0
  };
}
__name(backtest, "backtest");
function generateNumbers(draws, opts = {}) {
  const analyzer = draws && draws.length ? new TrendAnalyzer(draws) : null;
  const strategy = opts.strategy ?? "random";
  if (!["random", "spread", "zone"].includes(strategy) && !analyzer)
    throw new Error("\u4F7F\u7528 hot/cold/balanced \u7B56\u7565\u9700\u8981\u63D0\u4F9B\u5386\u53F2\u6570\u636E\u3002");
  if (opts.shapeFilter && !analyzer) throw new Error("\u5F62\u6001\u8FC7\u6EE4\u9700\u8981\u63D0\u4F9B\u5386\u53F2\u6570\u636E\u3002");
  const gen = new NumberGenerator(analyzer);
  return gen.generate(opts);
}
__name(generateNumbers, "generateNumbers");

// api/_common.js
async function loadDraws(context) {
  if (context.csvText) return parseCSV(context.csvText);
  const env = context.env || {};
  if (env.SSQ_DATA) {
    const txt = await env.SSQ_DATA.get("history.csv");
    if (txt) return parseCSV(txt);
  }
  const url = new URL("/data/sample_history.csv", context.request.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u5386\u53F2\u6570\u636E: " + res.status);
  return parseCSV(await res.text());
}
__name(loadDraws, "loadDraws");
function json(obj, code = 200) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(json, "json");

// api/backtest.js
async function onRequestPost(context) {
  try {
    let data = {};
    try {
      data = await context.request.json();
    } catch (_) {
      data = {};
    }
    const strategy = String(data.strategy || "random");
    const isPosInt = /* @__PURE__ */ __name((v) => typeof v === "number" ? Number.isInteger(v) && v > 0 : typeof v === "string" ? /^\d+$/.test(v.trim()) && parseInt(v, 10) > 0 : false, "isPosInt");
    const toInt = /* @__PURE__ */ __name((v) => typeof v === "string" ? parseInt(v, 10) : v, "toInt");
    if (!isPosInt(data.count ?? 5) || toInt(data.count ?? 5) < 1 || toInt(data.count ?? 5) > 50) {
      return json({ ok: false, error: "\u56DE\u6D4B\u6CE8\u6570\u9700\u4E3A 1\u201350 \u4E4B\u95F4\u7684\u6B63\u6574\u6570" }, 400);
    }
    const count = toInt(data.count ?? 5);
    if (!isPosInt(data.periods ?? 150) || toInt(data.periods ?? 150) < 20 || toInt(data.periods ?? 150) > 400) {
      return json({ ok: false, error: "\u56DE\u6D4B\u671F\u6570\u9700\u4E3A 20\u2013400 \u4E4B\u95F4\u7684\u6B63\u6574\u6570" }, 400);
    }
    const periods = toInt(data.periods ?? 150);
    const draws = await loadDraws(context);
    const r = backtest(draws, {
      count,
      strategy,
      periods,
      blueCover: !!(data.blueCover ?? false),
      shapeFilter: !!(data.shapeFilter ?? false),
      minTrain: Math.min(200, Math.max(50, draws.length - periods))
    });
    r.ok = true;
    return json(r);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}
__name(onRequestPost, "onRequestPost");

// api/generate.js
async function onRequestPost2(context) {
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
    const dedupe = data.dedupe !== false;
    const blueCover = !!(data.blueCover ?? false);
    const shapeFilter = !!(data.shapeFilter ?? false);
    const draws = await loadDraws(context);
    const results = generateNumbers(draws, {
      strategy,
      count,
      dedupe,
      blueCover,
      shapeFilter
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
      guaranteeRate: Math.round(Math.min(covered, 16) / 16 * 1e4) / 1e4,
      numbers: results.map((d) => ({
        reds: d.redsSorted(),
        blue: d.blue,
        shape: shapeOf(d.reds)
      }))
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}
__name(onRequestPost2, "onRequestPost");

// api/fetch_data.js
var BASE_URL = "https://datachart.500.com/ssq/history/newinc/history.php";
function extractRows(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while (trM = trRe.exec(html)) {
    const tds = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdM;
    while (tdM = tdRe.exec(trM[1])) {
      const text = tdM[1].replace(/<[^>]+>/g, "").trim();
      tds.push(text);
    }
    if (tds.length) rows.push(tds);
  }
  return rows;
}
__name(extractRows, "extractRows");
function parseRows(html) {
  const results = [];
  for (const row of extractRows(html)) {
    if (row.length < 8) continue;
    const issue = row[0].trim();
    if (!(issue.length >= 5 && /^\d+$/.test(issue))) continue;
    const redCells = row.slice(1, 7).map((c) => c.trim());
    const blueCell = row[7].trim();
    if (!redCells.every((c) => /^\d+$/.test(c)) || !/^\d+$/.test(blueCell)) continue;
    const reds = redCells.map(Number);
    const blue = Number(blueCell);
    if (new Set(reds).size !== 6) continue;
    if (!reds.every((n) => n >= 1 && n <= 33)) continue;
    if (!(blue >= 1 && blue <= 16)) continue;
    const date = row.find(
      (c) => (c.match(/-/g) || []).length === 2 && /^\d{4}/.test(c.trim())
    ) || "";
    results.push({
      issue,
      date,
      red: reds.slice().sort((a, b) => a - b).map((n) => String(n).padStart(2, "0")).join(","),
      blue: String(blue).padStart(2, "0")
    });
  }
  return results;
}
__name(parseRows, "parseRows");
function sanityCheck(rows) {
  const warns = [];
  if (!rows.length) return ["\u672A\u89E3\u6790\u5230\u4EFB\u4F55\u6570\u636E"];
  const n = rows.length;
  const bc = {};
  for (const r of rows) {
    const b = parseInt(r.blue, 10);
    bc[b] = (bc[b] || 0) + 1;
  }
  const blueKinds = Object.keys(bc).length;
  if (n >= 100 && blueKinds < 14)
    warns.push(`\u84DD\u7403\u53EA\u51FA\u73B0 ${blueKinds}/16 \u79CD\u53D6\u503C\uFF0C\u7591\u4F3C\u5217\u9519\u4F4D`);
  const exp = n / 16;
  let topB = 0, topBv = 0;
  for (const k in bc) if (bc[k] > topBv) {
    topBv = bc[k];
    topB = Number(k);
  }
  if (n >= 100 && topBv > exp * 2.2)
    warns.push(
      `\u84DD\u7403 ${String(topB).padStart(2, "0")} \u51FA\u73B0 ${topBv} \u6B21\uFF0C\u8FDC\u8D85\u671F\u671B ${exp.toFixed(1)} \u6B21\uFF0C\u7591\u4F3C\u5217\u9519\u4F4D`
    );
  const same = rows.filter(
    (r) => parseInt(r.blue, 10) === parseInt(r.red.split(",")[0], 10)
  ).length;
  if (same > n * 0.3)
    warns.push(`${same}/${n} \u671F\u7684\u84DD\u7403\u7B49\u4E8E\u6700\u5C0F\u7EA2\u7403\uFF0C\u51E0\u4E4E\u53EF\u4EE5\u65AD\u5B9A\u89E3\u6790\u9519\u5217`);
  const rc = {};
  for (const r of rows)
    for (const x of r.red.split(",")) rc[x] = (rc[x] || 0) + 1;
  if (n >= 100) {
    const expR = n * 6 / 33;
    let maxRv = 0;
    for (const k in rc) if (rc[k] > maxRv) maxRv = rc[k];
    if (maxRv > expR * 1.8 || Object.keys(rc).length < 33)
      warns.push("\u7EA2\u7403\u9891\u7387\u5206\u5E03\u5F02\u5E38\uFF0C\u53EF\u80FD\u5B58\u5728\u6570\u636E\u6C61\u67D3");
  }
  return warns;
}
__name(sanityCheck, "sanityCheck");
function validateLimit(n) {
  if (typeof n !== "string") n = String(n ?? "");
  n = n.trim();
  if (!/^\d+$/.test(n)) throw new Error("\u5386\u53F2\u671F\u6570\u5FC5\u987B\u662F 5\u201399999 \u4E4B\u95F4\u7684\u6B63\u6574\u6570");
  const v = parseInt(n, 10);
  if (v < 5 || v > 99999) throw new Error("\u5386\u53F2\u671F\u6570\u9700\u5728 5\u201399999 \u671F\u4E4B\u95F4");
  return v;
}
__name(validateLimit, "validateLimit");
async function fetchLatest(limit = 500) {
  const count = validateLimit(limit);
  const url = `${BASE_URL}?start=23001&end=26999&limit=${count}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error("\u6293\u53D6\u5931\u8D25\uFF1AHTTP " + res.status);
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("utf-8").decode(buf);
  const rows = parseRows(html);
  const seen = /* @__PURE__ */ new Set();
  const dedup = [];
  for (const r of rows) {
    if (seen.has(r.issue)) continue;
    seen.add(r.issue);
    dedup.push(r);
  }
  return limit ? dedup.slice(0, limit) : dedup;
}
__name(fetchLatest, "fetchLatest");
function toCSV(rows) {
  const lines = ["issue,date,red,blue"];
  for (const r of rows)
    lines.push(`${r.issue},${r.date},"${r.red}",${r.blue}`);
  return lines.join("\n");
}
__name(toCSV, "toCSV");

// api/refresh.js
async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    let count = 500;
    const raw = url.searchParams.get("count");
    if (raw != null) {
      try {
        count = validateLimit(raw);
      } catch (e) {
        return json({ ok: false, error: e.message }, 400);
      }
    }
    const rows = await fetchLatest(count);
    const warns = sanityCheck(rows);
    if (warns.length)
      return json({ ok: false, error: "\u6570\u636E\u8D28\u91CF\u4F53\u68C0\u672A\u901A\u8FC7\uFF1A" + warns.join("\uFF1B") });
    const env = context.env || {};
    let persisted = false;
    if (env.SSQ_DATA) {
      await env.SSQ_DATA.put("history.csv", toCSV(rows));
      persisted = true;
    }
    return json({
      ok: true,
      requested: count,
      count: rows.length,
      latest: rows[0] || null,
      checked: true,
      persisted
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}
__name(onRequestGet, "onRequestGet");

// api/trend.js
async function onRequest(context) {
  try {
    const draws = await loadDraws(context);
    const ta = new TrendAnalyzer(draws);
    const rf = ta.redFrequency(), ro = ta.redOmission();
    const bf = ta.blueFrequency(), bo = ta.blueOmission();
    const tier = ta.redTier();
    const hot = Object.entries(rf).map(([k, v]) => [Number(k), v]).sort((a, b2) => b2[1] - a[1]).slice(0, 10);
    const cold = Object.entries(ro).map(([k, v]) => [Number(k), v]).sort((a, b2) => b2[1] - a[1]).slice(0, 10);
    const red = {};
    for (let r = 1; r <= 33; r++)
      red[r] = { freq: rf[r] || 0, omission: ro[r] != null ? ro[r] : ta.n, tier: tier[r] };
    const blue = {};
    for (let b2 = 1; b2 <= 16; b2++)
      blue[b2] = { freq: bf[b2] || 0, omission: bo[b2] != null ? bo[b2] : ta.n };
    const st = ta.shapeStats();
    const b = ta.shapeBounds();
    const latest = draws[draws.length - 1];
    return json({
      ok: true,
      n: ta.n,
      latest: latest ? { issue: latest.issue, date: latest.date, reds: [...latest.reds].sort((a, b2) => a - b2), blue: latest.blue } : null,
      hot,
      cold,
      zones: ta.zoneDistribution(),
      red,
      blue,
      shape: st,
      bounds: {
        sum: [b.sum_min, b.sum_max],
        span: [b.span_min, b.span_max],
        odd: [...b.odd_ok].sort((a, b2) => a - b2),
        big: [...b.big_ok].sort((a, b2) => a - b2),
        maxConsecutive: b.max_consecutive,
        minAc: b.min_ac
      },
      strategies: STRATEGIES.map((k) => ({ key: k, desc: STRATEGY_DESC[k] }))
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}
__name(onRequest, "onRequest");

// ../.wrangler/tmp/pages-QBkRFq/functionsRoutes-0.2391363683947334.mjs
var routes = [
  {
    routePath: "/api/backtest",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/generate",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/refresh",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/trend",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  }
];

// ../../../../../Programs/node_npm/node_global/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../Programs/node_npm/node_global/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};

// 抓取双色球历史开奖数据（对应 py/fetch_data.py 的 JS 移植）
//
// 数据源：500 彩票网公开历史接口（无需登录、无需 cookie）。
// 关键防御：必须【按列位置】解析，不能按数值范围猜 —— 历史上吃过「蓝球列错位」
// 的大亏（详见 py/fetch_data.py 顶部说明），一旦写错会静默污染整个历史库。
//
// 编码说明：500 接口返回 gb2312。在 Cloudflare Workers / Node 中我们用 utf-8 解码，
// 因为开奖数据里我们真正需要的 期号 / 红球 / 蓝球 / 日期 全是 ASCII（数字与短横线），
// 在 gb2312 与 utf-8 下字节完全一致，所以中文部分虽会变成乱码，但解析结果不受影响。

const BASE_URL = "https://datachart.500.com/ssq/history/newinc/history.php";

// HTML 表格行解析：收集每个 <tr> 内的 <td> 文本
function extractRows(html) {
  // ⚠️ 必须先剥离 HTML 注释：500 彩票网在近期的历史表每行开头塞了
  // `<!--<td>2</td>-->` 之类的注释残留，正则 <td> 会把注释里的 <td> 也当成
  // 一格，导致整行右移一列、期号/蓝球错位 → 解析出 0 行。
  // 这与 py 版（用 HTMLParser，天然忽略注释）行为保持一致。
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trRe.exec(html))) {
    const tds = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdM;
    while ((tdM = tdRe.exec(trM[1]))) {
      const text = tdM[1].replace(/<[^>]+>/g, "").trim();
      tds.push(text);
    }
    if (tds.length) rows.push(tds);
  }
  return rows;
}

// 从 500 历史页 HTML 提取 (issue, date, reds[6], blue)
// ⚠️ 严格按【列位置】解析：见 py/fetch_data.py 的列结构注释
export function parseRows(html) {
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

    // 规则校验：红球 6 个互不重复且在 1-33；蓝球在 1-16
    if (new Set(reds).size !== 6) continue;
    if (!reds.every((n) => n >= 1 && n <= 33)) continue;
    if (!(blue >= 1 && blue <= 16)) continue;

    const date =
      row.find(
        (c) => (c.match(/-/g) || []).length === 2 && /^\d{4}/.test(c.trim())
      ) || "";
    results.push({
      issue,
      date,
      red: reds
        .slice()
        .sort((a, b) => a - b)
        .map((n) => String(n).padStart(2, "0"))
        .join(","),
      blue: String(blue).padStart(2, "0"),
    });
  }
  return results;
}

// 数据质量体检，返回告警列表（空 = 通过）。重点防御「列错位」这类静默污染。
export function sanityCheck(rows) {
  const warns = [];
  if (!rows.length) return ["未解析到任何数据"];

  const n = rows.length;
  const bc = {};
  for (const r of rows) {
    const b = parseInt(r.blue, 10);
    bc[b] = (bc[b] || 0) + 1;
  }

  // 1) 蓝球必须覆盖较多号码
  const blueKinds = Object.keys(bc).length;
  if (n >= 100 && blueKinds < 14)
    warns.push(`蓝球只出现 ${blueKinds}/16 种取值，疑似列错位`);

  // 2) 蓝球应近似均匀（期望 n/16）
  const exp = n / 16;
  let topB = 0, topBv = 0;
  for (const k in bc) if (bc[k] > topBv) { topBv = bc[k]; topB = Number(k); }
  if (n >= 100 && topBv > exp * 2.2)
    warns.push(
      `蓝球 ${String(topB).padStart(2, "0")} 出现 ${topBv} 次，远超期望 ${exp.toFixed(1)} 次，疑似列错位`
    );

  // 3) 蓝球不应恒等于最小红球（历史 bug 的特征）
  const same = rows.filter(
    (r) => parseInt(r.blue, 10) === parseInt(r.red.split(",")[0], 10)
  ).length;
  if (same > n * 0.3)
    warns.push(`${same}/${n} 期的蓝球等于最小红球，几乎可以断定解析错列`);

  // 4) 红球整体频率应接近 n*6/33
  const rc = {};
  for (const r of rows)
    for (const x of r.red.split(",")) rc[x] = (rc[x] || 0) + 1;
  if (n >= 100) {
    const expR = (n * 6) / 33;
    let maxRv = 0;
    for (const k in rc) if (rc[k] > maxRv) maxRv = rc[k];
    if (maxRv > expR * 1.8 || Object.keys(rc).length < 33)
      warns.push("红球频率分布异常，可能存在数据污染");
  }

  return warns;
}

// 校验历史期数：最小 5 期，最大 99999 期（与 py 版一致）。非法则抛错。
// 严格模式：必须是正整数（拒绝小数/字母/负数/0），不再用 parseInt 宽松解析。
export function validateLimit(n) {
  if (typeof n !== "string") n = String(n ?? "");
  n = n.trim();
  if (!/^\d+$/.test(n)) throw new Error("历史期数必须是 5–99999 之间的正整数");
  const v = parseInt(n, 10);
  if (v < 5 || v > 99999) throw new Error("历史期数需在 5–99999 期之间");
  return v;
}

// 抓取最近 limit 期（默认 500）。500 接口按期号降序返回（最新在前）。
export async function fetchLatest(limit = 500) {
  const count = validateLimit(limit);
  const url = `${BASE_URL}?start=23001&end=26999&limit=${count}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error("抓取失败：HTTP " + res.status);
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("utf-8").decode(buf);
  const rows = parseRows(html);

  // 去重（分页边界可能重复），保留最新 limit 期
  const seen = new Set();
  const dedup = [];
  for (const r of rows) {
    if (seen.has(r.issue)) continue;
    seen.add(r.issue);
    dedup.push(r);
  }
  return limit ? dedup.slice(0, limit) : dedup;
}

export function toCSV(rows) {
  // red 字段内嵌逗号，必须用引号包裹，与静态样本（py 以 csv 模块写出）格式一致，
  // 这样 engine.parseCSV 对「静态样本」与「KV 刷新后」两种来源都能正确解析。
  const lines = ["issue,date,red,blue"];
  for (const r of rows)
    lines.push(`${r.issue},${r.date},"${r.red}",${r.blue}`);
  return lines.join("\n");
}

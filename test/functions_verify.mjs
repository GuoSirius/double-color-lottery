// Node 验证脚本：在本地用静态 CSV 跑通 engine.js 与全部 Functions（无需 Cloudflare 环境）。
// 用法：node test/functions_verify.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as engine from "../engine.js";
import { parseRows, sanityCheck, toCSV } from "../functions/api/fetch_data.js";
import { onRequest as trendFn } from "../functions/api/trend.js";
import { onRequestPost as generateFn } from "../functions/api/generate.js";
import { onRequestPost as backtestFn } from "../functions/api/backtest.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(HERE, "..", "data", "sample_history.csv");
const csvText = readFileSync(CSV_PATH, "utf-8");

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

function ctx(body) {
  const request = new Request("http://localhost/api/x", {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return { request, csvText };
}
const resJson = async (r) => JSON.parse(await r.text());

console.log("\n[1] engine 不变式");
{
  const draws = engine.parseCSV(csvText);
  ok("解析出 500 期", draws.length === 500, `got ${draws.length}`);
  ok("最新一期红球 6 个且在 1-33", draws[draws.length-1].reds.length === 6 &&
     draws[draws.length-1].reds.every(n => n>=1 && n<=33));
  // judge 六级
  const actual = new engine.Draw("x","",[1,2,3,4,5,6],7);
  const t = (reds,blue)=>new engine.Draw("t","",reds,blue);
  ok("6+1 一等奖", engine.judge(t([1,2,3,4,5,6],7),actual)[0]===1);
  ok("6+0 二等奖", engine.judge(t([1,2,3,4,5,6],8),actual)[0]===2);
  ok("5+1 三等奖", engine.judge(t([1,2,3,4,5,8],7),actual)[0]===3);
  ok("5+0 四等奖", engine.judge(t([1,2,3,4,5,8],9),actual)[0]===4);
  ok("4+1 四等奖", engine.judge(t([1,2,3,4,9,10],7),actual)[0]===4);
  ok("2+1 六等奖", engine.judge(t([1,2,9,10,11,12],7),actual)[0]===6);
  ok("0 中 未中奖", engine.judge(t([11,12,13,14,15,16],8),actual)[0]===0);
}

console.log("\n[2] /api/generate");
{
  const r = await resJson(await generateFn(ctx({ strategy:"random", count:5 })));
  ok("ok", r.ok === true, JSON.stringify(r).slice(0,120));
  ok("返回 5 注", r.numbers.length === 5);
  ok("每注红球 6 个不重复且 1-33", r.numbers.every(n =>
    n.reds.length===6 && new Set(n.reds).size===6 && n.reds.every(x=>x>=1&&x<=33)));
  ok("每注蓝球 1-16", r.numbers.every(n=>n.blue>=1&&n.blue<=16));
  ok("cost = 注数*2", r.cost === r.numbers.length*2);

  const hot = await resJson(await generateFn(ctx({ strategy:"hot", count:3, blueCover:false, shapeFilter:true })));
  ok("hot+形态过滤 ok", hot.ok === true, JSON.stringify(hot).slice(0,120));

  const bc = await resJson(await generateFn(ctx({ strategy:"random", count:16, blueCover:true })));
  ok("blueCover=true 覆盖 16 个蓝球", bc.blueCovered === 16, `got ${bc.blueCovered}`);
  ok("guaranteeRate=1", bc.guaranteeRate === 1);
}

console.log("\n[3] /api/backtest");
{
  const r = await resJson(await backtestFn(ctx({ strategy:"random", count:5, periods:100, blueCover:false })));
  ok("ok", r.ok === true, JSON.stringify(r).slice(0,160));
  ok("periods_tested>0", r.periods_tested > 0, `got ${r.periods_tested}`);
  ok("含 roi 字段", typeof r.roi === "number");
  ok("cost = periods*count*2", r.total_cost === r.periods_tested * r.count_per_period * 2);
}

console.log("\n[4] /api/trend");
{
  const r = await resJson(await trendFn(ctx()));
  ok("ok", r.ok === true, JSON.stringify(r).slice(0,120));
  ok("n=500", r.n === 500, `got ${r.n}`);
  ok("strategies 列全", Array.isArray(r.strategies) && r.strategies.length === 6);
  ok("red 含 33 个号", Object.keys(r.red).length === 33);
  ok("blue 含 16 个号", Object.keys(r.blue).length === 16);
}

console.log("\n[5] refresh 解析器 + 数据体检防御");
{
  // 用现有 CSV 反推成 500 风格 HTML 表格，验证 parseRows 能正确还原
  const draws = engine.parseCSV(csvText);
  const rowsHtml = draws.map(d => {
    const reds = d.redsSorted().map(n=>String(n).padStart(2,"0"));
    return `<tr><td>${d.issue}</td><td>${reds[0]}</td><td>${reds[1]}</td><td>${reds[2]}</td><td>${reds[3]}</td><td>${reds[4]}</td><td>${reds[5]}</td><td>${String(d.blue).padStart(2,"0")}</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>${d.date}</td></tr>`;
  }).join("");
  const html = `<table>${rowsHtml}</table>`;
  const parsed = parseRows(html);
  ok("parseRows 还原 500 期", parsed.length === 500, `got ${parsed.length}`);
  ok("还原首期(最旧)蓝球正确", parsed[0].blue === String(draws[0].blue).padStart(2,"0"));
  ok("还原末期(最新)蓝球正确", parsed[parsed.length-1].blue === String(draws[draws.length-1].blue).padStart(2,"0"));

  const warns = sanityCheck(parsed);
  ok("正常数据体检通过(无告警)", warns.length === 0, warns.join("|"));

  // 构造「蓝球列错位」污染数据：把蓝球列替换成最小红球
  const corrupt = draws.map(d => {
    const reds = d.redsSorted().map(n=>String(n).padStart(2,"0"));
    const minRed = reds[0];
    return { issue:d.issue, date:d.date, red:reds.join(","), blue:minRed };
  });
  const cwarns = sanityCheck(corrupt);
  ok("错位数据被体检拦截", cwarns.length > 0, `warns=${cwarns.length}`);
  ok("拦截原因含『最小红球』或『列错位』", cwarns.some(w=>w.includes("最小红球")||w.includes("列错位")));
}

console.log(`\n==== 结果： ${pass} 通过 / ${fail} 失败 ====\n`);
process.exit(fail ? 1 : 0);

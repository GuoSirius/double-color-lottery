// 共享工具：从历史数据加载开奖数组（供各 Functions 复用）
// 数据来源优先级：注入的 csvText（测试用）> KV 存储（刷新后写入）> 静态 /data/sample_history.csv
import { parseCSV } from "../../engine.js";

export async function loadDraws(context) {
  if (context.csvText) return parseCSV(context.csvText);
  const env = context.env || {};
  if (env.SSQ_DATA) {
    const txt = await env.SSQ_DATA.get("history.csv");
    if (txt) return parseCSV(txt);
  }
  const url = new URL("/data/sample_history.csv", context.request.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("无法读取历史数据: " + res.status);
  return parseCSV(await res.text());
}

// 跨域头：允许打包后的 App（Capacitor / 鸿蒙 WebView）从本地源调用远程接口。
// 生产如需收敛，可将 "*" 改为具体来源，例如 "https://ssq-cloudflare-em8.pages.dev"。
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(obj, code = 200) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

// 预检（OPTIONS）响应：浏览器跨域 POST/带自定义头时会先发 OPTIONS 探路。
export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

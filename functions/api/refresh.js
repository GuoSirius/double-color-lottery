// GET /api/refresh —— 重新抓取最新历史数据（含数据质量体检），写入 KV
// 对应 py/app.py._refresh，保留「实时刷新」能力
//
// 数据来源优先级（读取端见 _common.js.loadDraws）：注入的 csvText > KV(SSQ_DATA) > 静态样本。
// 刷新成功后写入 KV，后续 /api/trend、/api/generate 会优先使用更新后的数据。
// 若未绑定 KV，则仅返回本次抓取结果（静态样本不变），便于本地/预览环境先验证抓取链路。
import { fetchLatest, sanityCheck, toCSV, validateLimit } from "./fetch_data.js";
import { json, preflight } from "./_common.js";

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  try {
    // 历史期数：从 URL ?count= 读取，默认 500；前后端统一约束 5–99999
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

    // ★ 必须先体检再落盘：历史上出现过「蓝球列错位」污染整个数据集，
    //   一旦写入会静默毁掉全部走势分析与回测结论。
    const warns = sanityCheck(rows);
    if (warns.length)
      return json({ ok: false, error: "数据质量体检未通过：" + warns.join("；") });

    // 写入 KV（若已绑定）；否则仅返回抓取结果（静态样本不变）
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
      persisted,
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

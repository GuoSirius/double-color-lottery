import { onRequestPost as __api_backtest_js_onRequestPost } from "D:\\workspace\\workbuddy\\2026-07-31-16-05-35\\ssq_tool\\functions\\api\\backtest.js"
import { onRequestPost as __api_generate_js_onRequestPost } from "D:\\workspace\\workbuddy\\2026-07-31-16-05-35\\ssq_tool\\functions\\api\\generate.js"
import { onRequestGet as __api_refresh_js_onRequestGet } from "D:\\workspace\\workbuddy\\2026-07-31-16-05-35\\ssq_tool\\functions\\api\\refresh.js"
import { onRequest as __api_trend_js_onRequest } from "D:\\workspace\\workbuddy\\2026-07-31-16-05-35\\ssq_tool\\functions\\api\\trend.js"

export const routes = [
    {
      routePath: "/api/backtest",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_backtest_js_onRequestPost],
    },
  {
      routePath: "/api/generate",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_generate_js_onRequestPost],
    },
  {
      routePath: "/api/refresh",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_refresh_js_onRequestGet],
    },
  {
      routePath: "/api/trend",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_trend_js_onRequest],
    },
  ]
import { CapacitorConfig } from '@capacitor/cli';

// 双色球选号分析 App 的 Capacitor 配置
// - webDir: 由 sync.mjs 从仓库根目录 index.html 同步而来（单一来源，避免双份维护）
// - androidScheme: 'https'：让安卓 WebView 源为 https://localhost，便于跨域 CORS 命中
const config: CapacitorConfig = {
  appId: 'com.ssq.tool',
  appName: '双色球选号分析',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
};

export default config;

/**
 * 补丁：让 Capacitor 生成的 Android 工程兼容 JDK 21，并把 Gradle 分发包改成国内镜像。
 *
 * Capacitor 6 默认模板使用 Gradle 8.2.1，而 Gradle 8.2.1 不支持 JDK 21（仅支持 8–19）。
 * 本脚本会把 wrapper 升级到 **Gradle 8.x 最新稳定版**（官方自 8.4 起支持 JDK 21），
 * 并把下载地址切到腾讯云镜像，避免国内访问 services.gradle.org 被墙或极慢。
 *
 * 用法：
 *   node scripts/patch-android-gradle.mjs            # 自动取 8.x 最新版
 *   GRADLE_VERSION=8.14.5 node scripts/...           # 指定固定版本（可选）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wrapperFile = path.resolve(__dirname, '../android/gradle/wrapper/gradle-wrapper.properties');

// 8.x 最新版的兜底值（网络不可用时使用，查自 https://services.gradle.org/distributions/）
const FALLBACK_GRADLE = '8.14.5';

async function fetchLatestGradle8() {
  try {
    const res = await fetch('https://services.gradle.org/distributions/');
    if (!res.ok) return FALLBACK_GRADLE;
    const html = await res.text();
    const matches = [...html.matchAll(/gradle-(8\.\d+\.\d+)-all\.zip/g)].map((m) => m[1]);
    if (matches.length === 0) return FALLBACK_GRADLE;
    matches.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return matches[matches.length - 1];
  } catch {
    return FALLBACK_GRADLE;
  }
}

const version = process.env.GRADLE_VERSION || (await fetchLatestGradle8());

if (!/^8\.\d+\.\d+$/.test(version)) {
  console.error(`无效的 Gradle 版本号：${version}`);
  process.exit(1);
}

if (!fs.existsSync(wrapperFile)) {
  console.error('未找到 android/gradle/wrapper/gradle-wrapper.properties');
  console.error('请先运行：npm run cap:add:android');
  process.exit(1);
}

let content = fs.readFileSync(wrapperFile, 'utf8');

// 升级 Gradle 版本并切到腾讯云镜像（properties 文件里 URL 使用 https\:// 转义形式）
const before = content;
content = content.replace(
  /distributionUrl=https:\\\/\\\/[^ ]*gradle-[^\s]+\.zip/,
  `distributionUrl=https\\://mirrors.cloud.tencent.com/gradle/gradle-${version}-all.zip`
);

if (content === before) {
  // 没匹配到，可能是格式差异，直接整行覆盖
  content = content.replace(
    /distributionUrl=.*/,
    `distributionUrl=https\\://mirrors.cloud.tencent.com/gradle/gradle-${version}-all.zip`
  );
}

fs.writeFileSync(wrapperFile, content, 'utf8');
console.log(`✅ 已修补 Gradle wrapper → Gradle ${version} + 腾讯云镜像`);
console.log(`   ${wrapperFile}`);

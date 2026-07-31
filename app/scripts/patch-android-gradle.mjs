/**
 * 补丁：让 Capacitor 生成的 Android 工程兼容 JDK 21，并把 Gradle 分发包改成国内镜像。
 *
 * Capacitor 6 默认模板使用 Gradle 8.2.1，而 Gradle 8.2.1 不支持 JDK 21（仅支持 8–19）。
 * 本脚本将 wrapper 升级到 Gradle 8.5（官方开始支持 JDK 21 的版本），并把下载地址切到
 * 腾讯云镜像，避免国内访问 services.gradle.org 被墙或极慢。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wrapperFile = path.resolve(__dirname, '../android/gradle/wrapper/gradle-wrapper.properties');

if (!fs.existsSync(wrapperFile)) {
  console.error('未找到 android/gradle/wrapper/gradle-wrapper.properties');
  console.error('请先运行：npm run cap:add:android');
  process.exit(1);
}

let content = fs.readFileSync(wrapperFile, 'utf8');

// 升级到 Gradle 8.5（支持 JDK 21），并切换为国内镜像
content = content.replace(
  /distributionUrl=https:\/\/services\.gradle\.org\/distributions\/gradle-[^\s]+\.zip/,
  'distributionUrl=https\\://mirrors.cloud.tencent.com/gradle/gradle-8.5-all.zip'
);

fs.writeFileSync(wrapperFile, content, 'utf8');
console.log('✅ 已修补 Gradle wrapper：Gradle 8.5 + 腾讯云镜像');
console.log(`   ${wrapperFile}`);

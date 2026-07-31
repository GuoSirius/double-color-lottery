/**
 * 补丁：让 Capacitor 生成的 Android 工程兼容 JDK 21，并全面切换到国内镜像。
 *
 * 做三件事：
 *   1. Gradle wrapper  → 升级到 8.x 最新稳定版（自 8.4 起支持 JDK 21），下载源切腾讯云镜像。
 *   2. AGP             → 从 Capacitor 6 默认的 8.2.1 升级到与 Gradle / Android Studio 都兼容的版本。
 *   3. Maven 仓库      → 注入阿里云镜像（保留 google()/mavenCentral() 兜底），避免国内拉不到 AGP。
 *
 * 为什么 AGP 不像 Gradle 那样直接顶到最新：
 *   Gradle 由 wrapper 自动下载，不挑 IDE；但 AGP 版本会反过来要求 Android Studio 的最低版本，
 *   顶太高会导致 IDE 报 "This project requires a newer version of Android Studio" 直接打不开工程。
 *   所以这里会 **探测本机 Android Studio 版本**，取「Gradle 支持的上限」与「AS 支持的上限」的较小值。
 *
 * 用法：
 *   node scripts/patch-android-gradle.mjs              # 全自动
 *   GRADLE_VERSION=8.14.5 node scripts/...             # 固定 Gradle 版本
 *   AGP_VERSION=8.13.0    node scripts/...             # 固定 AGP 版本（跳过自动推断）
 *   NO_MIRROR=1           node scripts/...             # 不注入国内镜像（有梯子时用）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const androidDir = path.resolve(__dirname, '../android');
const wrapperFile = path.join(androidDir, 'gradle/wrapper/gradle-wrapper.properties');
const rootGradleFile = path.join(androidDir, 'build.gradle');

// 8.x 最新版的兜底值（网络不可用时使用，查自 https://services.gradle.org/distributions/）
const FALLBACK_GRADLE = '8.14.5';

/**
 * AGP 兼容矩阵（官方 https://developer.android.google.cn/build/releases/gradle-plugin）
 * agp        : AGP 版本（取该小版本的最后一个 patch）
 * minGradle  : 该 AGP 要求的最低 Gradle 版本
 * minStudio  : 该 AGP 要求的最低 Android Studio 版本
 */
const AGP_MATRIX = [
  { agp: '8.2.1',  minGradle: '8.2',    minStudio: '2023.1.1' }, // Hedgehog
  { agp: '8.3.2',  minGradle: '8.4',    minStudio: '2023.2.1' }, // Iguana
  { agp: '8.4.2',  minGradle: '8.6',    minStudio: '2023.3.1' }, // Jellyfish
  { agp: '8.5.2',  minGradle: '8.7',    minStudio: '2024.1.1' }, // Koala
  { agp: '8.6.1',  minGradle: '8.7',    minStudio: '2024.1.2' }, // Koala FD
  { agp: '8.7.3',  minGradle: '8.9',    minStudio: '2024.2.1' }, // Ladybug
  { agp: '8.8.2',  minGradle: '8.10.2', minStudio: '2024.2.2' }, // Ladybug FD
  { agp: '8.9.3',  minGradle: '8.11.1', minStudio: '2024.3.1' }, // Meerkat
  { agp: '8.10.1', minGradle: '8.11.1', minStudio: '2024.3.2' }, // Meerkat FD
  { agp: '8.11.1', minGradle: '8.13',   minStudio: '2025.1.1' }, // Narwhal
  { agp: '8.12.3', minGradle: '8.13',   minStudio: '2025.1.2' }, // Narwhal FD
  { agp: '8.13.0', minGradle: '8.13',   minStudio: '2025.1.3' }, // Narwhal 3 FD
];

// 探测不到 Android Studio 时的保守默认：Ladybug(2024.2.1) 起即可用，覆盖面最广
const SAFE_DEFAULT_AGP = '8.7.3';

const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/* ---------------- Gradle 版本 ---------------- */

async function fetchLatestGradle8() {
  try {
    const res = await fetch('https://services.gradle.org/distributions/');
    if (!res.ok) return FALLBACK_GRADLE;
    const html = await res.text();
    const matches = [...html.matchAll(/gradle-(8\.\d+(?:\.\d+)?)-all\.zip/g)].map((m) => m[1]);
    if (matches.length === 0) return FALLBACK_GRADLE;
    matches.sort(cmp);
    return matches[matches.length - 1];
  } catch {
    return FALLBACK_GRADLE;
  }
}

/* ---------------- Android Studio 探测 ---------------- */

function detectStudioVersion() {
  const candidates = [
    process.env.STUDIO_PATH && path.join(process.env.STUDIO_PATH, 'product-info.json'),
    'C:/Program Files/Android/Android Studio/product-info.json',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs/Android Studio/product-info.json'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/AndroidStudio/product-info.json'),
    '/Applications/Android Studio.app/Contents/Resources/product-info.json',
    process.env.HOME && path.join(process.env.HOME, 'Applications/Android Studio.app/Contents/Resources/product-info.json'),
    '/opt/android-studio/product-info.json',
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const info = JSON.parse(fs.readFileSync(file, 'utf8'));
      // dataDirectoryName 形如 "AndroidStudio2024.3"，version 形如 "2024.3.2"（部分版本只到两段）
      const raw = info.version || info.dataDirectoryName || '';
      const m = String(raw).match(/(\d{4}\.\d+(?:\.\d+)?)/);
      if (m) return { version: m[1], from: file };
    } catch {
      /* 忽略单个候选路径的解析失败，继续探测下一个 */
    }
  }
  return null;
}

/* ---------------- AGP 版本决策 ---------------- */

function pickAgp(gradleVersion, studioVersion) {
  const usable = AGP_MATRIX.filter((e) => {
    if (cmp(gradleVersion, e.minGradle) < 0) return false;
    if (studioVersion && cmp(studioVersion, e.minStudio) < 0) return false;
    return true;
  });
  if (usable.length === 0) return null;

  const best = usable[usable.length - 1];
  // 探测不到 AS 时不敢顶到 Gradle 支持的上限，退回保守默认（但不低于当前已能用的）
  if (!studioVersion) {
    const safe = AGP_MATRIX.find((e) => e.agp === SAFE_DEFAULT_AGP);
    if (safe && cmp(best.agp, safe.agp) > 0) return safe;
  }
  return best;
}

/* ---------------- 执行 ---------------- */

if (!fs.existsSync(wrapperFile)) {
  console.error('未找到 android/gradle/wrapper/gradle-wrapper.properties');
  console.error('请先运行：npm run cap:add:android');
  process.exit(1);
}

const gradleVersion = process.env.GRADLE_VERSION || (await fetchLatestGradle8());
if (!/^8\.\d+(\.\d+)?$/.test(gradleVersion)) {
  console.error(`无效的 Gradle 版本号：${gradleVersion}`);
  process.exit(1);
}

// 1) Gradle wrapper
{
  let content = fs.readFileSync(wrapperFile, 'utf8');
  const url = `distributionUrl=https\\://mirrors.cloud.tencent.com/gradle/gradle-${gradleVersion}-all.zip`;
  const next = content.replace(/distributionUrl=.*/, url);
  fs.writeFileSync(wrapperFile, next, 'utf8');
  console.log(`✅ Gradle  → ${gradleVersion}（腾讯云镜像）`);
}

// 2) AGP
const studio = detectStudioVersion();
if (studio) {
  console.log(`ℹ️  探测到 Android Studio ${studio.version}`);
} else {
  console.log('ℹ️  未探测到 Android Studio，AGP 采用保守默认（可用 AGP_VERSION=x.y.z 覆盖）');
}

let agpVersion = process.env.AGP_VERSION || null;
if (!agpVersion) {
  const picked = pickAgp(gradleVersion, studio?.version);
  if (!picked) {
    console.error(`没有与 Gradle ${gradleVersion}${studio ? ` + AS ${studio.version}` : ''} 兼容的 AGP，请手动指定 AGP_VERSION`);
    process.exit(1);
  }
  agpVersion = picked.agp;
}

if (!fs.existsSync(rootGradleFile)) {
  console.error('未找到 android/build.gradle');
  process.exit(1);
}

let root = fs.readFileSync(rootGradleFile, 'utf8');
const agpBefore = root.match(/com\.android\.tools\.build:gradle:([\d.]+)/)?.[1];

root = root.replace(
  /com\.android\.tools\.build:gradle:[\d.]+/,
  `com.android.tools.build:gradle:${agpVersion}`
);

if (agpBefore === agpVersion) {
  console.log(`✅ AGP     → ${agpVersion}（已是目标版本，无需变更）`);
} else {
  console.log(`✅ AGP     → ${agpVersion}（原 ${agpBefore ?? '未知'}）`);
}

// 3) 阿里云镜像仓库（保留官方源兜底，幂等）
if (process.env.NO_MIRROR === '1') {
  console.log('⏭️  已跳过国内镜像注入（NO_MIRROR=1）');
} else if (root.includes('maven.aliyun.com')) {
  console.log('✅ 仓库镜像 → 已存在阿里云镜像，跳过');
} else {
  const mirrors = [
    "        maven { url 'https://maven.aliyun.com/repository/google' }",
    "        maven { url 'https://maven.aliyun.com/repository/central' }",
    "        maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }",
  ].join('\n');
  const count = (root.match(/repositories \{\s*\n\s*google\(\)/g) || []).length;
  root = root.replace(/repositories \{\s*\n(\s*)google\(\)/g, `repositories {\n${mirrors}\n$1google()`);
  console.log(`✅ 仓库镜像 → 已注入阿里云镜像 ${count} 处（google()/mavenCentral() 保留为兜底）`);
}

fs.writeFileSync(rootGradleFile, root, 'utf8');

const matched = AGP_MATRIX.find((e) => e.agp === agpVersion);
if (matched) {
  console.log('');
  console.log(`   AGP ${agpVersion} 要求：Gradle ≥ ${matched.minGradle}、Android Studio ≥ ${matched.minStudio}`);
}
console.log('');
console.log('👉 回到 Android Studio 点工具栏大象图标「Sync Project with Gradle Files」重新同步。');

# 双色球选号分析 · App 版（Capacitor）

> 这是把网站 `index.html` 打包成**手机 App** 的工程。你不用重写界面，网站代码直接被装进一个原生「外壳」里跑。
> 最终产物：**安卓 App（.apk / .aab）**，以及可选的 **iPhone App（.ipa，需 Mac 电脑）**。

---

## 一、你会得到什么

- 一个安卓手机上能安装、能用的 App，图标、启动页、界面都和网站一致。
- 点「生成 / 回测 / 复制 / 更新」走的是**远程服务器**（`https://ssq-cloudflare-em8.pages.dev`），所以不用在手机里再跑后台。
- 网站改了之后，重新跑一下同步命令就能更新 App 里的页面（见下文）。

---

## 二、开始前要准备的东西（一次性）

| 需要 | 说明 | 下载/入口 |
|------|------|-----------|
| **Node.js ≥ 24** | 跑打包命令用的运行环境（npm 会跟着一起装好） | https://nodejs.org （选 LTS 最新版，安装时一路下一步） |
| **Git** | 一般你已经有了 | https://git-scm.com |
| **安卓：Android Studio** | 用来编译和导出安卓安装包 | https://developer.android.com/studio |
| **iPhone（可选）：Mac 电脑 + Xcode** | 苹果只允许在 Mac 上编 iOS，且需 $99/年 开发者账号 | Mac App Store 搜 Xcode |

> 小提示：「终端 / 命令行」在 Windows 上叫 **PowerShell** 或 **命令提示符**；Mac 上叫 **终端(Terminal)**。下文所有命令都在**项目根目录或 `app/` 目录**里敲。

---

## 三、打包安卓 App（一步一步来）

### 第 1 步：进入 app 目录
```bash
cd app
```
（如果你现在在仓库根目录，就先 `cd app`；已经在 `app` 里就跳过）

### 第 2 步：安装打包工具（第一次要做，后面不用）
```bash
npm install
```
- 会联网下载一堆东西，**第一次可能要几分钟**，保持网络畅通。
- 成功后 `app/` 里会多出一个 `node_modules/` 文件夹（不用管它）。

### 第 3 步：把网站页面同步进 App
```bash
npm run sync
```
- 这条命令把根目录的 `index.html` 复制进 `app/www/`。
- **以后你改了网站想更新 App，只要重跑这一条**就行。

### 第 4 步：生成安卓工程（只做一次）
```bash
npx cap add android
```
- 会生成 `app/android/` 文件夹（这是真正的安卓原生工程）。
- 如果报错 `cap: command not found`，先确认第 2 步 `npm install` 成功了。

### 第 5 步：把页面同步到安卓工程
```bash
npx cap sync
```

### 第 6 步：用 Android Studio 打开
```bash
npx cap open android
```
- 自动打开 Android Studio。第一次打开会**自动下载 Gradle 和安卓 SDK**，可能要等很久（十几分钟都正常），别关窗口。

### 第 7 步：导出安装包（APK）
在 Android Studio 里：
1. 顶部菜单 **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. 编完右下角会弹提示，点 **locate** 打开输出目录。
3. 文件在：`app/android/app/build/outputs/apk/debug/app-debug.apk`
4. 把这个 `app-debug.apk` 拷到安卓手机上，点开安装即可（手机可能提示「允许安装未知来源应用」，同意即可）。

> 想在手机上**直接点运行调试**？手机开「开发者选项 → USB 调试」，用数据线连电脑，Android Studio 顶部选你的设备，点绿色 ▶ 就能装到手机上跑。

---

## 四、打包 iPhone App（可选，需 Mac）

只有 **Mac 电脑** 能做，且上架苹果商店要 **$99/年** 的 Apple 开发者账号。

```bash
cd app
npm install
npm run sync
npx cap add ios
npx cap sync
npx cap open ios        # 打开 Xcode
```
在 Xcode 里：选真机或模拟器 → 顶部 **Product → Archive** 出包；上架走 **Organizer → Distribute App**。

---

## 五、接口是怎么连的（你不用改代码）

`index.html` 里已经写好：一旦运行在 App 里（检测到 Capacitor 原生环境），就自动把请求发到
`https://ssq-cloudflare-em8.pages.dev/api/...`；在电脑浏览器里打开时则走本地同源。
**所以你不需要改任何地址**，后台服务器也已开启跨域(CORS)支持。

---

## 六、常见问题

| 现象 | 处理 |
|------|------|
| `npm install` 卡住/很慢 | 保持联网，耐心等；公司网络可换手机热点 |
| `npx cap` 提示找不到命令 | 确认在 `app/` 目录、且 `npm install` 已完成 |
| Android Studio 一直「Building / Indexing」 | 首次下载 SDK/Gradle，正常现象，等它转完 |
| 手机装不上 APK | 允许「未知来源」；或改用 Android Studio 直接 Run 到手机 |
| App 打开后白屏 | 检查手机能否访问 `ssq-cloudflare-em8.pages.dev`（网站本身要能打开） |

---

## 七、想上应用商店？

- **安卓（Google Play）**：一次性 $25 注册开发者；用 **Build → Generate Signed Bundle / APK** 生成 **AAB**（不是 APK），上传后台。
- **国内渠道**（应用宝 / 华为 / 小米等）：各自开发者平台实名后上传 APK/AAB。
- **iPhone（App Store）**：Mac + Xcode + $99/年 Apple 开发者，走 Xcode Archive 上架。

> 本工程只负责「把网站变成可安装的 App 外壳」。商店账号、签名证书、上架审核需你自己在对应平台办理，我这边无法代注册。

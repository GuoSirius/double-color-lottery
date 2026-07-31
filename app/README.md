# 双色球选号分析 · App 版（Capacitor）

> 这是把网站 `index.html` 打包成**手机 App** 的工程。你不用重写界面，网站代码直接被装进一个原生「外壳」里跑。
> 最终产物：**安卓 App（.apk / .aab）**，以及可选的 **iPhone App（.ipa，需 Mac 电脑）**。

---

## 一、你会得到什么

- 一个安卓手机上能安装、能用的 App，图标、启动页、界面都和网站一致。
- 点「生成 / 回测 / 复制 / 更新」走的是**远程服务器**（`https://ssq-cloudflare-em8.pages.dev`），所以不用在手机里再跑后台。
- 网站改了之后，重新跑一下同步命令就能更新 App 里的页面（见下文）。
- ⚠️ **App 不会自动更新**：网站改版后，必须重新 `npm run sync` → `npx cap sync` → 重新构建/上架，App 里的页面才会变。想「改网站即生效」请用鸿蒙版（见仓库 `harmony/`）。

---

## 二、开始前要准备的东西（一次性）

| 需要 | 说明 | 下载/入口 |
|------|------|-----------|
| **Node.js ≥ 24** | 跑打包命令用的运行环境（npm 会跟着一起装好） | https://nodejs.org （选 LTS 最新版，安装时一路下一步） |
| **Git** | 一般你已经有了 | https://git-scm.com |
| **安卓：Android Studio** | 用来编译和导出安卓安装包 | https://developer.android.google.cn/studio （国内镜像，比国际版 `developer.android.com` 更易打开） |
| **iPhone（可选）：Mac 电脑 + Xcode** | 苹果只允许在 Mac 上编 iOS，且需 $99/年 开发者账号 | Mac App Store 搜 Xcode |

> 小提示：「终端 / 命令行」在 Windows 上叫 **PowerShell** 或 **命令提示符**；Mac 上叫 **终端(Terminal)**。下文所有命令都在**项目根目录或 `app/` 目录**里敲。

> 🌏 **国内网络特别提醒（重要！）**：你在中国大陆，`developer.android.com`、`dl.google.com`、`registry.npmjs.org` 等**国际域名经常被墙或极慢**，下面打包过程里三处会受影响（Android Studio 下载、`npm install`、Gradle/SDK 下载）。请提前按文末「六（附）」里的镜像方案处理，否则会卡很久甚至失败。

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
- 会联网下载一堆东西，**第一次可能要几分钟**。**国内用户建议先切淘宝镜像源**（见文末「六（附）」），否则可能卡很久：
  ```bash
  npm config set registry https://registry.npmmirror.com
  ```
- 切完源再 `npm install`，速度会快很多。
- 成功后 `app/` 里会多出一个 `node_modules/` 文件夹（不用管它）。

### 第 3 步：把网站页面同步进 App
```bash
npm run sync
```
- 这条命令把根目录的 `index.html` 复制进 `app/www/`。
- **以后你改了网站想更新 App，只要重跑这一条**就行。

### 第 4 步：生成安卓工程（只做一次）
```bash
npm run cap:add:android
```
- 会生成 `app/android/` 文件夹（这是真正的安卓原生工程）。
- 本条命令已包含**自动补丁**，帮你做三件事（详见「六（附）· 5」）：
  1. **Gradle** 升级到 8.x 最新稳定版（兼容 JDK 21），下载源切腾讯云镜像；
  2. **AGP**（安卓 Gradle 插件）从模板默认的 8.2.1 升级到与你本机 Android Studio 匹配的版本；
  3. **Maven 仓库**注入阿里云镜像，避免国内拉不到 AGP 卡死。
- 如果你之前用 `npx cap add android` 生成过，单独打补丁：
  ```bash
  npm run patch:android
  ```
- 如果报错 `cap: command not found`，先确认第 2 步 `npm install` 成功了。

### 第 5 步：把页面同步到安卓工程
```bash
npx cap sync
```

### 第 6 步：用 Android Studio 打开
```bash
npx cap open android
```
- 自动打开 Android Studio。第一次打开会**自动下载 Gradle 和安卓 SDK**，可能要等很久（十几分钟都正常），别关窗口。若长时间卡死不动，见文末「六（附）」的 Gradle/SDK 镜像应对。

### 第 7 步：导出安装包（APK）
在 Android Studio 里：
1. 顶部菜单 **Build → Generate App Bundles or APKs → Build APK(s)**
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

## 附：把 App 图标换成你自己的品牌

工程里已经放好了一张品牌图标源图：**`app/resources/icon.png`**（1024×1024，双色球双球设计）。
但 Capacitor **不会自动把它用上**——`npx cap add android/ios` 生成的是 Capacitor 默认占位图标（电容 logo）。
需要再从这张源图生成各尺寸图标，步骤如下：

```bash
cd app
npm install -g cordova-res          # 第一步：装图标生成工具（一次性）
npx cordova-res capacitor --skip-config --copy   # 第二步：从 icon.png 生成安卓/iOS 各尺寸并拷贝
npx cap sync                        # 第三步：同步进原生工程
```

- 安卓：生成 `android/app/src/main/res/mipmap-*` 各密度图标。
- iOS：生成 `ios/App/App/Assets.xcassets/AppIcon.appiconset` 全套尺寸。
- 想换图？直接替换 `app/resources/icon.png`（建议 1024×1024、透明背景最佳），重跑上面命令即可。

> 装不上 `cordova-res` 时，可手动：把 `icon.png` 导出 48/72/96/144/192 px 五张，放进安卓工程
> `res/mipmap-mdpi`~`mipmap-xxxhdpi` 目录覆盖同名文件（iOS 同理手动放 AppIcon.appiconset）。

---

## 六、常见问题

| 现象 | 处理 |
|------|------|
| `npm install` 卡住/很慢 | **先切淘宝镜像源**：`npm config set registry https://registry.npmmirror.com`，再 `npm install`；公司网络可换手机热点 |
| `npx cap` 提示找不到命令 | 确认在 `app/` 目录、且 `npm install` 已完成 |
| Android Studio 一直「Building / Indexing」 | 首次下载 SDK/Gradle，正常现象，等它转完 |
| **首次启动弹窗："Unable to access Android SDK add-on list"** | 这是去 Google 拉 SDK 列表被墙。点 **Cancel** 跳过，进 IDE 后通过 `SDK Manager → SDK Update Sites` 换成清华/中科大镜像（见下方「附」），再下载 SDK。 |
| **弹窗 "Gradle 8.2.1 is incompatible with the Gradle JVM version 25"** | 你装了 JDK 21，但 Capacitor 6 默认 Gradle 8.2.1 不支持 JDK 21。运行 `npm run patch:android` 自动升级 **Gradle + AGP** 并换国内镜像；或另装 JDK 17（见下方「附 5」）。 |
| **报错 "This project requires a newer version of Android Studio"** | AGP 版本高于你的 IDE。要么升级 Android Studio，要么按「附 5」的对照表指定较低的 AGP：`AGP_VERSION=8.7.3 npm run patch:android`。 |
| 同步时报 `Could not resolve com.android.tools.build:gradle` | 拉 AGP 被墙。`npm run patch:android` 会自动注入阿里云镜像；已经跑过还失败就换手机热点重试。 |
| **警告 `Using flatDir should be avoided...`** | **无害警告，可直接忽略**，不影响打包。这是 Capacitor 官方模板自带的（用于加载 Cordova 插件的本地 aar/jar），本项目没装 Cordova 插件所以那个目录是空的。详见下方「附 7」。 |
| 构建日志里一堆黄色 `warning:` / `Deprecated` | 只要最后显示 **BUILD SUCCESSFUL** 就是成功了。Gradle 的警告 ≠ 错误，真正的失败会明确写 **BUILD FAILED** 并给出 `* What went wrong:` 段落。 |
| 手机装不上 APK | 允许「未知来源」；或改用 Android Studio 直接 Run 到手机 |
| App 打开后白屏 | 检查手机能否访问 `ssq-cloudflare-em8.pages.dev`（网站本身要能打开） |

---

## 六（附）、国内网络不通的完整解决办法（中国大陆必看）

你在中国大陆，下面这些**国际域名经常被墙或极慢**，按本文档操作时会卡住。逐条对照处理：

### 1. Android Studio 下载慢 / 打不开
- 国际版 `https://developer.android.com/studio` 在国内常访问失败。
- **改用中国官方镜像**：👉 https://developer.android.google.cn/studio （界面中文、内容一致、通常能正常下载）。
- 若「下载」按钮点了也卡（个别地区 `dl.google.com` CDN 抽风），用**迅雷 / IDM** 等多线程下载器，或搜「Android Studio 国内镜像下载」。

### 2. 首次启动提示 "Unable to access Android SDK add-on list"
这是 Android Studio 去 Google 拉 SDK 仓库列表被墙，弹窗让你 Setup Proxy 或 Cancel。**直接点 Cancel**，然后手动换国内镜像：

1. 进入 Android Studio 主界面 → **More Actions → SDK Manager**。
2. 顶部切到 **SDK Update Sites**。
3. 把默认的 Google 源地址改成下面任意一个：
   - 清华镜像：`https://mirrors.tuna.tsinghua.edu.cn/android/repository/`
   - 中科大镜像：`https://mirrors.ustc.edu.cn/android/repository/`
4. 点 **Apply**，再切到 **SDK Platforms** 安装 Android 14/15 + **SDK Tools** 安装 Build-Tools / Platform-Tools。

不想手动改？安装前在 Windows 命令行执行一次（把 `Admin` 换成你的 Windows 用户名）：
```bash
mkdir "C:\Users\Admin\.android" 2>nul
(
echo count=1
echo src01=https\://mirrors.tuna.tsinghua.edu.cn/android/repository/
) > "C:\Users\Admin\.android\repositories.cfg"
```
然后再启动 Android Studio，首次向导就能直接走清华镜像。

### 3. npm install 卡住 / 超时
- 先把 npm 源切成淘宝镜像（国内快很多），**再**装包：
  ```bash
  npm config set registry https://registry.npmmirror.com
  npm install
  ```
- 之后所有 `npx` 命令也走这个源，速度正常。

### 4. Android Studio 打开后 Gradle / SDK 下载卡死
- 首次打开 `app/android` 项目时，Android Studio 会自动下载 **Gradle** 和 **Android SDK**，这一步可能转圈十几分钟。
- 轻微卡顿是正常，耐心等；若长时间（半小时以上）不动，可搜「Gradle 国内镜像」「Android SDK 国内镜像」配置后再重试。
- 不想等？可改用公司/手机热点网络，有时比校园网/企业网更顺。

### 5. Gradle / AGP 版本与 JDK 21 不兼容（`npm run patch:android` 一键搞定）

Capacitor 6 生成的安卓工程用的是 **Gradle 8.2.1 + AGP 8.2.1**，这套组合在 2026 年已经偏旧，典型症状是导入工程时弹窗：

> The project's Gradle version Gradle 8.2.1 is incompatible with the Gradle JVM version 25.

原因：Gradle 8.2.1 最高只支持 **JDK 19**，而现在新机器普遍装 JDK 21。

**解决办法 A（推荐，不用额外装 JDK）**：
```bash
npm run patch:android
```

脚本会自动做三件事：

| 项目 | 改成什么 | 说明 |
|------|----------|------|
| **Gradle** | 8.x 最新稳定版（当前 8.14.5） | Gradle 自 **8.4** 起支持 JDK 21；下载源切 **腾讯云镜像** |
| **AGP** | 与你本机 Android Studio 匹配的最高版本 | 见下方「为什么 AGP 不直接顶到最新」 |
| **Maven 仓库** | 注入**阿里云镜像** | `google()` / `mavenCentral()` 保留为兜底，镜像缺包时自动回源 |

跑完回到 Android Studio，点工具栏的 **Sync Project with Gradle Files**（大象图标），或重启 Android Studio 让它重新同步。

**为什么 AGP 不像 Gradle 那样直接顶到最新？**

Gradle 由 wrapper 自动下载，不挑 IDE；但 **AGP 版本会反过来要求 Android Studio 的最低版本**——顶太高，IDE 会直接报 *"This project requires a newer version of Android Studio"* 连工程都打不开。

所以脚本会**自动探测你本机安装的 Android Studio 版本**，取「Gradle 支持的上限」与「Android Studio 支持的上限」中较小的那个：

| 你的 Android Studio | 自动选用的 AGP |
|---------------------|----------------|
| 2023.1.1 Hedgehog | 8.2.1 |
| 2023.2.1 Iguana | 8.3.2 |
| 2024.1.1 Koala | 8.5.2 |
| 2024.2.1 Ladybug | 8.7.3 |
| 2024.3.1 Meerkat | 8.9.3 |
| 2024.3.2 Meerkat FD | 8.10.1 |
| 2025.1.1 Narwhal | 8.11.1 |
| 2025.1.3 Narwhal 3 FD | 8.13.0 |
| **探测不到** | **8.7.3**（保守默认，Ladybug 及以上都能用） |

探测路径为标准安装位置（Windows `C:\Program Files\Android\Android Studio`、macOS `/Applications/Android Studio.app` 等）。如果你装在自定义目录导致探测不到，有两种办法：

```bash
# 办法一：告诉脚本 Android Studio 装在哪
STUDIO_PATH="D:/MyTools/Android Studio" npm run patch:android

# 办法二：直接指定 AGP 版本（照上表选一个不超过你 IDE 版本的）
AGP_VERSION=8.13.0 npm run patch:android
```

其它可用的环境变量：

```bash
GRADLE_VERSION=8.14.5 npm run patch:android   # 固定 Gradle 版本
NO_MIRROR=1           npm run patch:android   # 不注入国内镜像（有梯子时用）
```

> 脚本是**幂等**的，重复运行不会重复注入镜像，放心多跑几次。

**解决办法 B（装一个兼容的 JDK）**：
- 安装 **JDK 17**（Android 开发最常用的 LTS 版本）。
- 国内下载推荐 Eclipse Temurin 镜像：
  - 清华：`https://mirrors.tuna.tsinghua.edu.cn/Adoptium/`
  - 中科大：`https://mirrors.ustc.edu.cn/Adoptium/`
- 安装后，在弹窗里点 **Open JVM settings** → 选择 JDK 17 的路径 → 重新同步。

> 注意：`app/android/` 是 `npx cap add android` 的生成物，**不入库**。所以每次重新生成工程后都要再跑一次 `npm run patch:android`（或直接用 `npm run cap:add:android`，它已经包含补丁）。

### 6. 其它国际资源
- 文档里若还有指向 `*.google.com`、`github.com` 的下载，遇到打不开就用对应国内镜像（如 `google.cn` 系列、`npmmirror`、`gitclone.com` 等）替代。

> 提示：以上只是**下载/联网**层面的问题。代码、命令本身都没问题，网络通了照着做就能跑通。

### 7. 关于 `Using flatDir should be avoided` 警告

构建日志里出现这句，**是警告不是错误，可以直接无视**：

```text
Using flatDir should be avoided because it doesn't support any meta-data formats.
```

**它从哪来的**：Capacitor 官方安卓模板自带，共两处，都是生成的，不是我们写的——

- `android/app/build.gradle`
- `android/capacitor-cordova-android-plugins/build.gradle`

```gradle
repositories {
    flatDir {
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}
```

**它是干嘛的**：给 Cordova 插件预留的本地 `.aar` / `.jar` 加载目录。Gradle 提示 `flatDir` 不携带 POM 元数据（拿不到传递依赖、版本冲突无法仲裁），所以官方建议少用——但作为「兜底扫本地 libs 目录」的用途，这正是它存在的意义。

**对本项目的影响：零**。我们是纯 WebView 外壳，一个 Cordova 插件都没装，`src/main/libs` 是空目录，`flatDir` 实际什么都没加载。

**不要手贱删掉**：删了当下确实也能编过，但以后一旦装了带原生 `.aar` 的 Cordova 插件就会直接编译失败，而且报错很难联想到这里。另外 `npx cap add android` 会重新生成整个 `android/` 目录，删了也会被覆盖回来。

> 判断构建成没成，只看最后一行：**BUILD SUCCESSFUL** = 成了；**BUILD FAILED** = 失败，此时往上翻找 `* What went wrong:` 那段才是真正的错误原因。

---

## 七、想上应用商店？

- **安卓（Google Play）**：一次性 $25 注册开发者；用 **Build → Generate Signed Bundle / APK** 生成 **AAB**（不是 APK），上传后台。
- **国内渠道**（应用宝 / 华为 / 小米等）：各自开发者平台实名后上传 APK/AAB。
- **iPhone（App Store）**：Mac + Xcode + $99/年 Apple 开发者，走 Xcode Archive 上架。

### 上架前要注意 targetSdk

本工程沿用 Capacitor 6 默认的 `compileSdk / targetSdk = 34`（见 `app/android/variables.gradle`），**本地安装、自用完全没问题**。但各大商店对 `targetSdk` 有硬性下限（Google Play 已要求 ≥ 35，国内渠道通常跟进稍慢），上架前需要手动调高：

```gradle
// app/android/variables.gradle
compileSdkVersion = 35
targetSdkVersion = 35
```

改完在 Android Studio 的 **SDK Manager** 里把对应的 Android SDK Platform 装上，再重新同步。

> ⚠️ 为什么补丁脚本不帮你自动改：`targetSdk` 升到 35 会**强制启用 edge-to-edge（内容延伸到状态栏/导航栏下方）**，WebView 页面可能被状态栏遮住一截。这属于需要真机验证的 UI 变更，所以留给你在准备上架时主动做、顺便测一遍显示效果，而不是在打包脚本里悄悄改掉。

> 本工程只负责「把网站变成可安装的 App 外壳」。商店账号、签名证书、上架审核需你自己在对应平台办理，我这边无法代注册。

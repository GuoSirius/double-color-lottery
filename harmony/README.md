# 双色球选号分析 · 鸿蒙版（HarmonyOS NEXT）

> 这是面向**华为鸿蒙系统（HarmonyOS NEXT）**的 App 工程。它其实是一个「原生壳」：打开 App 后，里面用系统浏览器内核直接加载线上网站
> `https://ssq-cloudflare-em8.pages.dev`，所以界面、功能、按钮都和你用的网站一模一样，而且**网站更新后 App 自动跟着变**，不用重新打包。

---

## 一、你会得到什么

- 一个能在鸿蒙手机（HarmonyOS NEXT）上安装运行的 App（图标 + 启动页 + 全屏网站）。
- 因为直接加载线上站点，**不需要在手机里跑任何后台**，也不用手动配接口地址。
- 想换显示的网址？改一个文件 `entry/src/main/ets/pages/Index.ets` 里的 `src` 即可。

---

## 二、开始前要准备的东西（一次性）

| 需要 | 说明 | 获取方式 |
|------|------|-----------|
| **DevEco Studio** | 华为官方的鸿蒙开发工具（类似安卓的 Android Studio） | 华为开发者联盟官网 → 开发者工具 → DevEco Studio（下「HarmonyOS NEXT」版本） |
| **HarmonyOS SDK** | 编译用的系统库 | 装好 DevEco 后第一次打开会自动提示安装，跟着点就行（需联网）。本工程适配 **DevEco Studio 6.1.1.300（SDK 6.1.1 API 24）** |
| **华为账号 + 实名认证** | 用来登录 DevEco、生成调试签名、以后上架应用市场 | 华为开发者联盟 https://developer.huawei.com/consumer/cn/ |
| （上架才需要）**企业/个人开发者资质** | 发布到华为应用市场(AppGallery) 用 | 同上加开发者认证 |

> 小提示：本工程已内置占位图标和必要配置。**真机调试**可以用「自动签名」免证书；**正式发布**才需要去华为申请正式签名证书。

---

## 三、用 DevEco 打开并跑起来（一步一步）

### 第 1 步：安装并打开 DevEco Studio
按官网指引装好 DevEco Studio。首次启动会让你登录华为账号、下载 HarmonyOS SDK，按提示一路完成（耗时视网速，耐心等）。

### 第 2 步：打开本工程目录
1. DevEco 启动后选 **Open Project**（或菜单 File → Open）。
2. 选择本机上的 `harmony/` 文件夹（就是本文档所在的这个目录），点 OK。
3. 第一次打开会提示 **Sync / 下载依赖（oh-package）**，点同意让它跑完。

### 第 3 步：登录华为账号 + 配置签名
- 右上角登录你的**华为账号**（需已完成实名认证）。
- 菜单 **File → Project Structure → Signing Configs（签名配置）**：
  - 勾选 **Automatically generate signature（自动生成签名）**，点 Apply / OK。
  - 这一步是给「真机/模拟器调试」用的临时签名，不用你自己做证书。
  - （正式上架时再换成你在华为后台申请的正式证书。）

### 第 4 步：准备一台设备
二选一：
- **真机**：鸿蒙手机用数据线连电脑，手机上确认「允许调试 / USB 调试」。
- **模拟器**：菜单 **Tools → Device Manager → 新建/启动一个 Phone 模拟器**（首次需下载镜像，较慢）。

### 第 5 步：运行
点工具栏的绿色 **▶ Run**，选择你的设备/模拟器。DevEco 会编译并把 App 装上去自动打开。
看到网站界面就成功了 🎉

### （可选）只出安装包，不点运行
菜单 **Build → Build HAP(s) / APP(s) → Build HAP(s)**，编完在
`harmony/entry/build/default/outputs/default/entry-default-signed.hap`
得到可安装的 `.hap` 文件，用华为手机上的「AppGallery Connect」或 `hdc install` 装到手机。

---

## 四、想改显示的网址 / 换图标？

- **换网址**：编辑 `entry/src/main/ets/pages/Index.ets`，把
  `Web({ src: 'https://ssq-cloudflare-em8.pages.dev', ... })` 里的网址改掉，重新 Run 即可。
- **换图标**：替换这两个文件为正式的 1024×1024 PNG（透明或纯色底均可）：
  - `AppScope/resources/base/media/app_icon.png`
  - `entry/src/main/resources/base/media/app_icon.png`
  - 以及启动图标 `entry/src/main/resources/base/media/startIcon.png`
  > 现在用的是脚本生成的占位图标，仅用于跑通流程；上架前请换上正式设计稿。

---

## 五、常见问题

| 现象 | 处理 |
|------|------|
| 打开工程后 Sync 失败 | 通常是 DevEco 版本与工程 SDK 版本不匹配。本工程已适配 **DevEco 6.1.1.300 / SDK 6.1.1(24)**；若你装的是其他版本，打开 `build-profile.json5` 把 `compileSdkVersion` / `compatibleSdkVersion` / `targetSdkVersion` 改成你本机 SDK Manager 里实际装的版本 |
| 点 Run 提示「no device」 | 先连真机或启动模拟器（Device Manager） |
| 签名报错 | 确认已登录华为账号且**实名认证**；重做第 3 步「自动生成签名」 |
| App 打开白屏 | 手机要能访问 `ssq-cloudflare-em8.pages.dev`（网站本身要能打开） |
| 想上架但提示缺证书 | 去华为开发者联盟申请正式签名，替换 Signing Configs 里的配置 |

---

## 六、想上华为应用市场（AppGallery）？

1. 华为开发者联盟完成**企业或个人开发者认证**（需实名）。
2. 在后台创建应用、上传**正式签名**后的 APP 包（`.app`）。
3. 提交审核，通过后即在 AppGallery 上架。

> 账号注册、实名认证、签名证书、上架审核都在华为平台办理，我这边无法代操作。

---

### 附：本工程关键文件速查
- `entry/src/main/ets/pages/Index.ets` —— 加载网站的页面（改网址在这里）
- `entry/src/main/module.json5` —— 模块/Ability 配置（图标、入口）
- `AppScope/app.json5` —— 应用名、包名 `com.ssq.tool`、版本
- `build-profile.json5` —— 编译配置（已适配 **DevEco 6.1.1.300 / SDK 6.1.1(24)**）
- `hvigorfile.ts` —— Hvigor 应用级构建脚本（DevEco 6.x 必需）
- `entry/hvigorfile.ts` —— Hvigor 模块级构建脚本（DevEco 6.x 必需）

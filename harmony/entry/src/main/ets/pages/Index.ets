// 双色球选号分析 鸿蒙版入口页
// 直接用 ArkUI Web 组件加载线上站点（与 API 同源，无需额外处理跨域）。
// 站点本身已实现移动端底部操作栏与按钮级 loading，体验与原生一致。
import { webview } from '@kit.ArkWeb';

@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController();

  build() {
    Column() {
      Web({ src: 'https://ssq-cloudflare-em8.pages.dev', controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .width('100%')
        .height('100%')
    }
    .width('100%')
    .height('100%')
  }
}

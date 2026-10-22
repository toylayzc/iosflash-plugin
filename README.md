# iosflash插件：在 iPadOS 浏览器里玩 4399 的 Flash 小游戏

一个 Tampermonkey 用户脚本。它在 4399 的游戏播放页加载 [Ruffle](https://ruffle.rs)（用 WebAssembly 实现的 Flash 模拟器），并处理 4399 页面上挡住游戏的几道限制，让 iPad 上也能玩 4399 自己托管的单机 Flash 小游戏。

当前是调试版：页面底部会显示日志面板，方便排查问题。

## 安装

1. 在 iPad 的 Safari 上安装 Tampermonkey 扩展。
2. 打开下面的地址，Tampermonkey 会提示安装：
   `https://raw.githubusercontent.com/toylayzc/iosflash-plugin/main/4399-debug.user.js`
3. 第一次代理下载时 Tampermonkey 会请求跨域权限，选「总是允许」。
4. 浏览器要用「请求桌面网站」模式，否则 4399 会跳转到移动版，页面上没有 Flash。

## 使用

- 要进游戏的播放页（地址形如 `/flash/45256_3.htm`），不要停在介绍页（`/flash/45256.htm`）。
- 解密较大的游戏需要十几秒，等进度条走完会出现「开始」按钮。
- 日志面板上的按钮：收起/展开、复制日志、重新扫描、手动播放 swf。

## 能玩和不能玩的

| 类型 | 例子 | 结果 |
|---|---|---|
| 4399 自己托管的单机 Flash 游戏 | 45256 | 可以 |
| 嵌在第三方网站 iframe 里的在线网游 | 35538 奥拉星（100bt.com）、32979 洛克王国（qq.com） | 不行 |
| 用到 Ruffle 还不支持的 AS3 功能的游戏 | 因游戏而异 | 可能黑屏或报错 |

在线网游需要一直连接游戏服务器，浏览器里的 Ruffle 做不到这种连接，脚本无法解决。

## 4399 页面上挡住游戏的限制，以及脚本的处理

排查时逐个找出来的，按游戏加载的先后顺序排列：

1. **原版脚本不生效**
   用户脚本运行在隔离环境里，写的 `window.RufflePlayer.config` 页面看不到。另外，不带版本号的 unpkg 地址会 302 跳转，Ruffle 会推算错 wasm 文件所在的目录。
   处理：主逻辑注入到页面里运行，Ruffle 固定用 0.7.1 版并显式设置 `publicPath`。

2. **Flash 检测把游戏换成「不支持」提示**
   `flashopen*.js` 会反复调用测试 swf 里的 `checkflash()`，Ruffle 下这个调用不通，失败几次后就把游戏区域换成 `blockflashtip.html`。
   处理：把 `showBlockFlash()` 换成空函数；提示页如果已经出现，就调用页面自己的 `closeBlockFlash()` 还原。

3. **swf 跨域，Ruffle 读不到**
   游戏 swf 放在 `sda/sxiao/szhong.4399.com`，广告组件放在 `cdn.comment.4399pk.com`、`stat.api.4399.com`，这些服务器都不返回跨域头。
   处理：浏览器原生 fetch 被拦后，改用 `GM_xmlhttpRequest` 代理下载。代理只允许 4399 系列域名。

4. **防盗链返回替身文件**
   不带 4399 的 Referer 时，swf 服务器返回一个 23832 字节的替身 swf，不是游戏本体。
   处理：代理请求时带上当前播放页地址作为 Referer。

5. **加载遮罩一直不收起（白屏）**
   页面加载 4 秒后，`showMidWindows()` 本该收起盖在游戏上面的 `#addiv`（`loading.htm`）。但它第一行是 `if (trycount > 5) return false;`，而 `trycount` 是第 2 步检测的失败次数，在 Ruffle 下必然超过 5。
   处理：等 4399 的检测放弃之后，把 `trycount` 清零一次。有的页面检测阈值是 10，检测还在跑时清零会让它永远重试，所以必须等它放弃之后再清。

6. **防沉迷**
   收起遮罩前，4399 会等防沉迷提示（`#Anti_open`）关闭。没登录或没实名认证时会一直等。
   这是未成年人保护机制，脚本不会绕过。请登录 4399 并完成实名认证。

## 排查时确认过、不影响游戏的

- **游戏日志里的 `PreLoader/loadProgress()` 报 `Error #1009`**
  45256 的 `18.swf` 只是 4399 的外壳，里面的游戏是用异或加密的，在 Ruffle 里要解密约 13 秒。这个报错是游戏的预加载器还没挂到舞台上就读了 `stage`，只发生一次，后面的进度条和「开始」按钮都正常。
- **`PercentLoaded()`**
  4399 靠这个方法判断游戏是否加载完。Ruffle 0.7.1 已经实现，加载完成后返回 100。

## 调试方法

本机复现 iPad 上的问题时用过这几种方法：

- 无界面 Chrome 配合 DevTools 协议：打开真实播放页，在 `readyState=interactive` 时注入脚本（模拟 iPad 上 Tampermonkey 的注入时机），再用 `elementFromPoint` 检查游戏区域被哪个元素挡住。
- 用 JPEXS FFDec 反编译 swf。外壳里的加密数据按 `L4399Main` 里的密钥逐字节异或，就能还原出内层游戏。

## 文件

- `4399-debug.user.js`：当前的调试版脚本。
- `历史/4399-原版.js`：最初不生效的版本，留作对照。

## 版本记录

| 版本 | 改动 |
|---|---|
| 1.1.0 | 页面内日志面板；固定 Ruffle 版本和 `publicPath`；注入到页面环境 |
| 1.2.0 | 绕过 Flash 检测；用 `GM_xmlhttpRequest` 代理跨域 swf |
| 1.3.0 | 代理带 Referer，绕过防盗链替身；检查 swf 文件头；监听播放器事件 |
| 1.4.0 | 代理白名单加 `4399pk.com` 等域名 |
| 1.5.0 | 清零 `trycount`，修白屏；记录 Ruffle 的 AVM 报错；遇到防沉迷时提示 |
| 1.5.1 | 修清零时机，阈值为 10 的页面不再无限重试；汇总里识别第三方网游 iframe |

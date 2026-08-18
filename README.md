# Melon Archive

一个用于Melonbooks与Toranoana商品详情页的油猴脚本。它会在页面标题附近添加两个按钮：

- **复制信息**：生成统一格式的同人志标题并复制到剪贴板。
- **复制并下载封面**：复制标题，并用同一标题作为文件名下载商品封面。

标题格式如下：

```text
(イベント) [サークル (作家)] タイトル (ジャンル)
```

当页面有社团名但没有作者名时，脚本会保留空的`()`，方便之后手动补充作者。

## 安装

1. 安装[Tampermonkey](https://www.tampermonkey.net/)等用户脚本管理器。
2. 打开[melon-archive.user.js](https://raw.githubusercontent.com/uyuni-saline/melon-archive/main/melon-archive.user.js)。
3. 在用户脚本管理器的安装页面确认安装。

脚本通过`@updateURL`与`@downloadURL`跟踪`main`分支中的版本。

### 从0.9.3升级

0.9.3使用了`https://gist.github.com/jkhaoqi110`作为`@namespace`。新版将其改为本项目所有者对应的`https://github.com/uyuni-saline`，并同时调整了`@name`。由于脚本管理器通常以`@namespace`和`@name`组合识别脚本，新版可能被当作一份新脚本安装。

首次安装新版后，请禁用或卸载旧版，避免两个版本同时向页面注入按钮。

## 支持页面

- Melonbooks：`/detail/detail.php`与`/products/detail.php`
- Toranoana：`.jp`及`.shop`域名下的`tora`与`tora_r`商品详情页

## 1.0.0重构内容

- 将站点判断、页面提取、标题生成、封面下载和UI注入分层整理。
- 用语义更严格的`@match`替代旧版正则`@include`。
- 移除FileSaver.js外部依赖，改用浏览器原生Blob URL保存文件。
- 改进异步元素等待，避免已完成后仍残留计时器。
- 避免嵌套链接与`span`导致商品字段重复。
- 扩充封面图片选择器，并增加`og:image`回退。
- 根据图片MIME类型选择扩展名，不再始终写成`.jpg`。
- 加强文件名跨平台清洗，包括控制字符、Windows保留名与Unicode截断。
- 使用原生`button`元素，补充键盘焦点与忙碌状态。
- 防止重复注入按钮，并为错误状态提供更清晰的提示。
- 增加纯函数单元测试，且不引入开发依赖。

## 权限说明

| 元数据 | 用途 |
| --- | --- |
| `GM_addStyle` | 注入两个操作按钮的样式 |
| `GM_setClipboard` | 复制生成的标题 |
| `GM_notification` | 显示提取或下载错误 |
| `GM_xmlhttpRequest` | 将页面显示的封面URL读取为Blob |
| `@connect *` | 允许从商品页实际使用的图片CDN下载封面；请求目标只取自当前页面的封面元素 |

`@connect *`用于兼容商店更换或并用图片CDN的情况。脚本不会上传页面信息，也不会向封面以外的地址发送数据。

## 本地检查

项目只需要Node.js，无需安装npm依赖：

```bash
npm run check
npm test
```

功能性页面测试仍建议分别在Melonbooks和Toranoana的实际商品页中进行，因为两站可能随时调整HTML结构。

## 项目结构

```text
melon-archive.user.js  可直接安装的完整用户脚本
test/core.test.cjs     标题、文件名、URL识别等纯逻辑测试
package.json           本地检查命令
```

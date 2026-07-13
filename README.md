# ddys-tizen

DDYS 的三星 Tizen TV 电视端 Web App。它把 DDYS API 的首页、分类、搜索、详情和播放资源做成适合电视遥控器操作的界面，并在三星电视上优先使用 `webapis.avplay` 播放。

## 功能

- 首页推荐：最新更新、热门推荐、分类入口。
- 分类浏览：电影、剧集、动画、综艺、纪录片。
- 搜索：支持电视输入法输入片名。
- 详情页：封面、年份、类型、地区、评分、简介、资源列表。
- 播放器：Tizen `AVPlay` 优先，浏览器调试时自动使用 HTML5 video fallback。
- 遥控器：方向键移动焦点，确认键打开，返回键回首页/退出播放，彩色键快捷切换搜索、收藏、历史、设置。
- 收藏：影片收藏保存在电视本地。
- 历史：记录最近播放影片和资源。
- 设置：API Base、API Key、鉴权模式、分页数量、缓存、资源过滤。
- 自检：Tizen API、遥控器 API、AVPlay、video fallback、本地存储、API 连接。
- 打包：生成 `.wgt` 和 Release ZIP。

## 使用

Release 中提供：

- `ddys-tizen-v0.1.0.wgt`：Tizen Web App 包。
- `ddys-tizen-v0.1.0.zip`：源码与文档包。
- 对应 `.sha256` 校验文件。

安装到三星电视通常需要 Samsung Tizen Studio 或电视开发者模式。电视与电脑在同一局域网后，可通过 Tizen Studio Device Manager 连接电视并安装 `.wgt`。

## 配置

打开 App 后进入“设置”：

| 项目 | 默认值 | 说明 |
| --- | --- | --- |
| API Base | `https://ddys.io/api/v1` | DDYS API 地址 |
| API Key | 空 | 可选鉴权 Key |
| API Key 模式 | `query` | `query`、`bearer` 或 `header` |
| API Key Query | `api_key` | query 模式下的参数名 |
| 每页数量 | `24` | 首页、分类、搜索的分页数量 |
| 缓存秒数 | `600` | API 内存缓存时间 |
| 只显示直连播放资源 | 关闭 | 开启后过滤网盘、磁力等资源 |
| 显示外部资源 | 开启 | 关闭后只展示可播放资源 |

## 遥控器

- 方向键：移动焦点。
- 确认键：打开影片、播放资源、保存设置。
- 返回键：播放页返回；其他页面回首页。
- 红色键：搜索。
- 绿色键：收藏。
- 黄色键：历史。
- 蓝色键：设置。
- 播放/暂停、快退、快进、停止：播放页控制。

## 兼容

目标是三星 Tizen TV Web App 环境。普通浏览器也可打开 `index.html` 调试界面和 API 行为，但真实电视播放能力取决于设备固件、解码器、资源格式和网络环境。

## 验证

```bash
node tools/check.mjs
node --test tests/*.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-package.ps1
```

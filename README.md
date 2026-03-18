# Trend Radar

一个 Chrome 热榜聚合插件。

平时想快速扫一下几个中文平台的热榜，不想来回切站，所以做了这个 popup 版的小面板。点一下扩展图标，就能在一个地方切着看。

## 现在支持

| 平台 | 分类 |
| --- | --- |
| 百度 | 热搜、小说、电影、电视剧、汽车、游戏 |
| 微博 | 实时热搜 |
| 知乎 | 热榜 |
| B站 | 热搜 |
| 贴吧 | 热议 |
| 头条 | 热榜 |

## 功能大概就是这些

- 点击扩展图标直接打开 popup
- 默认每 60 秒自动刷新，也可以手动刷新
- 抓取失败时尽量回退到最近一次成功的数据
- 点条目直接开新标签页

## 本地加载

1. 打开 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点“加载已解压的扩展程序”
4. 选择当前仓库根目录
5. 然后点扩展图标就行

## 自检

有个很简单的 smoke 脚本，用来看接口现在是不是还活着：

```bash
npm run smoke
```

## 代码位置

- `manifest.json`
  - 扩展入口和权限
- `src/popup.html`
  - popup 结构
- `src/popup.css`
  - popup 样式
- `src/popup.js`
  - popup 交互、切换、刷新
- `src/background.js`
  - 后台消息和缓存
- `src/providers.mjs`
  - 各平台抓取和数据映射
- `src/config.mjs`
  - 平台和分类配置
- `rules/request-headers.json`
  - 微博请求头规则
- `scripts/smoke.mjs`
  - 自检脚本

## 备注

- 这是无构建的 MV3 扩展，直接原生 HTML / CSS / JavaScript
- 不依赖本地服务，也没有额外 npm 依赖
- 平台接口如果哪天改字段了，优先看 `src/providers.mjs`

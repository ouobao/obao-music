# 欧包音乐 · 逐页布局/视觉 BUG 修复记录

> 审查时间：2026-10-21
> 视角：UI 设计师（逐页、逐组件、逐元素）
> 运行态：Electron 1220×780（默认），浅色/深色；1040×680 用 CDP 设备模拟复核
> 方法：真实窗口截图（PrintWindow）+ CDP 计算样式/几何实测 + 交互触发
> 说明：本文只记录**这一轮新发现并修复的布局/视觉问题**；语义色、对比度、Hero 压缩等上一轮已修内容见 `UI_AESTHETIC_AUDIT_2026-10-20.md` 第 11 节。

---

## 0. 结论

上一轮解决的是"设计语言过载"，这一轮解决的是**具体页面上的布局错位与组件级缺陷**。共确认并修复 15 项，其中 6 项是用户一眼能看出来的错位/遮挡：

1. 表头「时长」左对齐、数据右对齐（差 30px）；
2. 榜单卡片 hover 播放钮占位导致文字列宽跳动；
3. 播放队列出现 17px 原生滚动条；
4. 相似歌曲抽屉固定 594px 高，5 首歌下面空 400px；
5. 歌词页最后几行滚到播放坞下方被裁切；
6. 搜索提交后输入框不失焦，白色双环跟着进入结果页。

---

## 1. 修复清单

| # | 页面/组件 | 问题 | 根因 | 修复 |
| --- | --- | --- | --- | --- |
| 1 | 歌曲表格（全部页面） | 表头「时长」左对齐，时长数值右对齐，错位约 30px | `.song-table-header` 只给第 2 列加了 padding，第 5 列未设 `text-align` | 表头第 5 列 `text-align: right`；`#` 列居中；1170 断点下 5 列模板改为第 4 列右对齐 |
| 2 | 排行榜卡片 | hover 时文字列宽从 214 → 204px 跳动，播放钮压住描述文字 | 播放钮 `position: static`，参与 flex 布局，hover 时从 0 → 46px 撑开 | 改为 `position: absolute` 定位到卡片右上角，`.chart-card-body` 预留 46px 右内边距 |
| 3 | 播放队列抽屉 | 右侧出现 17px Fluent 原生滚动条 | `.queue-song-list` 只有 `overflow-y: auto`，没有隐藏滚动条 | `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` |
| 4 | 相似歌曲抽屉 | 面板固定 594px 高，5 首歌下方空 400px | `.drawer-panel` 用 `bottom: var(--stage-bottom)` 强制拉满 | 改为 `bottom: auto` + `max-height` 约束，高度由内容决定 |
| 5 | 两个抽屉 | 没有关闭按钮，只能点遮罩或再点一次触发键 | 标题区只放了「清空 / 换一批」 | 新增 `.drawer-header-actions` + `.drawer-close-btn`，队列与相似歌曲都有关闭按钮 |
| 6 | 播放队列 | 顶部「正在播放」卡与列表首项是同一首歌，重复占 103px | 卡片和列表都渲染当前曲 | 删除顶部卡，当前曲在列表里已有波形 + 高亮 |
| 7 | 歌词页 | 最后 3 行滚到播放坞下方被裁切 | `.lyrics-scroll-container` 在 flex 链路里按内容撑到 716px，越过 `main-body` 的 598px 内容盒 | `.lyrics-scroll-zone` 加 `overflow: hidden` 兜底裁切；`main-body` 底部保留 118px 给全局播放坞 |
| 8 | 歌词页 | 封面列 380px 只放 240px 封面，与歌词列之间空 165px | 列宽用 `0.78fr / 1.22fr` 比例分配 | 改为 `minmax(200px, 260px) minmax(0, 1fr)`，gap 40px，间距收到 50px |
| 9 | 顶部搜索 | 提交搜索后输入框不失焦，白色 focus ring 一直显示 | `submitSearch` 只关下拉，没有 `blur()` | 提交后 `inputRef.current?.blur()` |
| 10 | 搜索下拉 / 右键菜单 / 抽屉 / 弹窗 | 浮层半透明，透出下层侧栏文字与卡片 | 统一用 `--popover-bg`（0.97）或 `--bg-panel`（0.95）+ blur | 新增 `--bg-panel-solid`（深色 `#141722` / 浅色 `#fff`），所有浮层改用实色并移除多余 blur |
| 11 | 搜索结果页 | 「已显示 120 条结果」与实际渲染条数不符 | 计数用 `songs + artists + albums + playlists` 全量，但「综合」只渲染每类前 8/6/6 条 | 按 `activeResultView` 分别统计实际渲染数量，标签改为「本页展示 N 条」/「共 N 条结果」 |
| 12 | 搜索结果页 | 关键词标题 34px，压过下方真正的内容标题 | 复用 `--text-display` | 降到 28px，与详情页标题同级 |
| 13 | 歌手搜索结果 | 每张歌手卡是 203×197 的空白盒，头像只有 116px，一屏只放 8 个 | `.artist-card` 有 24px padding + 边框 + `surface-0` 底 | 去掉卡片外壳，头像 148px、名字 13px，一屏 5 列 10 个 |
| 14 | 专辑详情 | 每行都重复专辑名，标题列被挤到 240px | 专辑页仍显示「专辑」列 | `showAlbum={false}`，标题列获得完整宽度 |
| 15 | 登录弹窗 | 两个按钮宽度不等（128 vs 141），平台切换选中态几乎看不出 | 按钮 `padding` 撑宽；滑块用 `--surface-4` 与容器同色 | 按钮 `flex: 1 1 0` 等宽；滑块改为 16% 白 + 描边 + 阴影（浅色为纯白） |

### 附加修复

| # | 位置 | 问题 | 修复 |
| --- | --- | --- | --- |
| 16 | 播放坞 1040 断点 | 中列 480px 挤压左列，歌名截成 8 个字 | 中列收到 420px，左右等宽；左列封面 48px、标题降一档；播放键仍精确居中（520/520） |
| 17 | 播放坞进度条 | 浅色下轨道 `14%` 黑几乎不可见（约 1.3:1） | 提到 `22%` |
| 18 | Toast | `top: 60px` 压在 66px 高的顶栏上，且半透明 | 下移到 `chrome-top + 10px`，背景改实色 |
| 19 | 浅色 Hero | scrim 84% 白把封面洗平，卡片边界只剩 0.07 边框 | 降到 72/46/14，让封面环境色透出 |
| 20 | 二维码状态 | 粉色脉冲图标与白色二维码形成彩色噪点 | 图标改中性灰，仅"已扫码/成功"用绿色 |
| 21 | `TopBar.tsx` | 首行两个 import 挤在一行 | 拆行 |
| 22 | 最近播放统计卡 | 两张 150px 小方块挤在左侧，数值与标签挤在一起 | 改 `grid` + `repeat(auto-fit, minmax(180px,1fr))`，等宽 254px；数值 26px/1.1，标签改 tertiary |
| 23 | 最近播放「清空历史」 | 与普通区块按钮同色，破坏性操作没有语义区分 | 加 `.history-clear-btn`，danger 色 + danger 描边 + hover 淡红底 |
| 24 | 歌手头像缺失 | 纯色圆形占位，看不出是谁 | 加 `.artist-avatar--fallback`，显示名字首字 + 40px 字重 |
| 25 | 浅色 Hero | scrim 84% 白把封面洗平，卡片边界几乎不可见 | 降到 72/46/14（见 #19） |
| 26 | 全部分类面板 | 280px 宽面板按 420px 算 left，整体左移 140px，离锚点很远 | 改用 `right` 定位，右缘精确对齐「全部分类」按钮（1088 = 1088） |
| 27 | 全部分类面板 | 面板底部被播放坞压住 25px | JS 按「锚点下方 → 坞上方」计算可用高度，`max-height` 420px，bottom 658 < 坞顶 680 |
| 28 | 全部分类面板 | 17px 原生滚动条 + 底部硬切 | 隐藏滚动条；抬高可用高度；底部 28px `mask-image` 渐隐 |
| 29 | 全部分类面板 | 面板打开时「全部分类」按钮与面板内「全部歌单」同时粉紫，语义冲突 | 按钮改用 `.panel-open` 中性按下态；面板内选中项改 `text-primary` 反色 |
| 30 | 歌手详情 | 「热门单曲/所有专辑」tab 比表格宽 4px（负边距），与 Hero 间距 37px | 专用 `.filter-pills-bar.artist-detail-tabs`，margin 20/0/12、padding 0，与表格同缘 318–1200 |
| 31 | 歌手详情 | 副标题「Eason Chan · 1863 首单曲」与简介粘在一起 | `.hero-desc` 加 `margin-top: 6px` |
| 32 | 顶部搜索 | 浅色下焦点双环 2px 0.85 黑 + 4px 0.18，像给输入框套了黑框 | 浅色 token 降到 0.55/0.1；搜索框改单层 1px + 3px 淡晕 |

---

## 2. 运行态验证数据

```
1220×780 详情页
  hero:            265px（318,76 → 1200,341）
  table top:       361
  header「时长」:   text-align right，与 04:10 右缘对齐
  表头字号:        11px / tertiary

1040×680 首页
  播放键中心:      520 = 视口中心 520
  左列宽度:        267px（原 ~180px）
  歌名:            完整显示「想你就写信 (Live)」

队列抽屉
  panel:           404 × 594，bottom 666（坞顶 680，间距 14）
  滚动条宽度:      0（原 17）
  关闭按钮:        存在

歌词页
  scroll-zone:     598px 高，bottom 662（坞顶 680）
  当前行:          33px / opacity 1
  可见行:          4 行完整，不再压到坞下

搜索
  overview 计数:   本页展示 50 条 = 30 单曲 + 8 歌手 + 6 专辑 + 6 歌单
  输入框失焦:      document.activeElement !== input

浮层
  下拉背景:        rgb(20, 23, 34)（实色）
  抽屉背景:        rgb(20, 23, 34)
  右键菜单:        rgb(20, 23, 34)
```

---

## 3. 验证截图

- `screenshots/2026-10-21-review-charts-dark.png` — 修复前排行榜
- `screenshots/2026-10-21-review-discovery-dark.png` — 修复前歌单广场
- `screenshots/2026-10-21-review-history-dark.png` — 修复前最近播放
- `screenshots/2026-10-21-review-search-dark.png` — 修复前搜索结果
- `screenshots/2026-10-21-review-artists.png` — 修复前歌手网格（203px 空盒）
- `screenshots/2026-10-21-review-categories.png` — 修复前全部分类面板
- `screenshots/2026-10-21-review-lyrics.png` — 修复前歌词（末行被坞切断）
- `screenshots/2026-10-21-review-login.png` — 修复前登录弹窗（按钮不等宽）
- `screenshots/2026-10-21-review-dropdown-light.png` — 修复前浅色下拉焦点环
- `screenshots/2026-10-21-fix-queue-2.png` — 修复后队列
- `screenshots/2026-10-21-fix-charts.png` — 修复后排行榜
- `screenshots/2026-10-21-fix-artists.png` — 修复后歌手网格
- `screenshots/2026-10-21-fix-lyrics-2.png` — 修复后歌词（深色）
- `screenshots/2026-10-21-fix-login.png` — 修复后登录弹窗
- `screenshots/2026-10-21-fix-1040.png` — 修复后 1040 播放坞
- `screenshots/2026-10-21-final-home-dark-cdp.png` — 最终首页深色（CDP，无捕获伪影）
- `screenshots/2026-10-21-final-home-light.png` — 最终首页浅色
- `screenshots/2026-10-21-final-detail-light.png` — 最终详情页浅色
- `screenshots/2026-10-21-final-lyrics-light.png` — 最终歌词页浅色
- `screenshots/2026-10-21-final-artists-light.png` — 最终歌手网格浅色
- `screenshots/2026-10-21-final-state.png` — 最终干净状态（浅色首页）
- `screenshots/2026-10-21-fix-categories.png` — 修复后全部分类面板
- `screenshots/2026-10-21-fix-history.png` — 修复后最近播放
- `screenshots/2026-10-21-fix-dropdown-light.png` — 修复后搜索下拉（浅色，实色背景 + 轻焦点环）
- `screenshots/2026-10-21-review-categories.png` — 修复前分类面板
- `screenshots/2026-10-21-review-artist-detail.png` — 修复后歌手详情
- `screenshots/2026-10-21-review-chart-detail.png` — 榜单详情
- `screenshots/2026-10-21-review-album-detail.png` — 专辑详情
- `screenshots/2026-10-21-review-dropdown-light.png` — 修复前浅色下拉焦点环

> 注：`PrintWindow` 在部分合成层上会产生竖线/文字残影（例如详情页左侧细线、首页 hero 下方碎片）。这些不是 DOM 问题，已用 CDP `Page.captureScreenshot` 交叉验证；截图里带 `-cdp` 后缀的即为交叉验证图。

---

## 4. 改动文件

**样式**
- `src/renderer/styles/tokens.css` — 新增 `--bg-panel-solid`
- `src/renderer/styles/components.css` — 抽屉高度/关闭按钮/滚动条、浮层实色、Toast 位置、进度轨道、登录按钮等宽、平台滑块、1040 播放坞断点
- `src/renderer/styles/views.css` — 表头对齐、榜单 hover 定位、歌手网格、搜索标题字号、浅色 hero scrim
- `src/renderer/styles/lyrics.css` — 歌词滚动区裁切、封面列宽、浮层实色

**组件**
- `src/renderer/components/TopBar.tsx` — 提交后失焦、import 拆行
- `src/renderer/components/QueuePanel.tsx` — 删除重复的"正在播放"卡、关闭按钮
- `src/renderer/components/SimilarSongsPanel.tsx` — 关闭按钮、统一 drawer 类名
- `src/renderer/components/views/SearchResultsView.tsx` — 计数按实际渲染量
- `src/renderer/components/views/PlaylistDetailView.tsx` — 专辑页隐藏专辑列、简介宽度交还 CSS

---

## 5. 已知残留

1. **搜索结果标题**仍带全角引号，关键词极长时靠 `text-overflow: ellipsis` 截断；未做多行展示。
2. **队列虚拟滚动阈值 40**：超过 40 首切虚拟列表，行高固定 56px，若未来支持多行标题需要同步改 `QUEUE_ITEM_SIZE`。
3. **PrintWindow 捕获伪影**是环境问题，不影响应用本身；最终视觉以 CDP 截图为准。
4. **最近播放统计卡**固定 `max-width: 520px`，宽屏下右侧留白；这是刻意的"两卡一组"排布，不铺满整行。
5. **专辑详情隐藏专辑列**后，若未来需要在专辑页展示"合作专辑"字段，需要单独加列而不是复用 `showAlbum`。

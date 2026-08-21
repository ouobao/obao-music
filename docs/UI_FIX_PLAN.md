# 欧包音乐 UI 问题修复实施方案（供实施使用）

> 本文档针对用户提出的 15 项 UI/交互问题，给出逐项的现象、根因（精确到 `文件:行号`）、修改方案与验收标准。
> 实施前请完整阅读本文档 + `docs/FEATURES.md` + `ui-redesign-demo/UI_REDESIGN_PROMPT_GUIDE.md`（Aether Flow 设计规范）。
> 所有行号以**当前未提交工作树**为准（`git status` 存在大量 `M`/`D`/`??`，旧组件已被删除，勿按旧路径实施）。

---

## 0. 基线现状与总体结论

- 架构：Electron 33 + React 18 + TS + Vite 5 + Zustand 5 + lucide-react（已声明但几乎未用，全项目手写内联 SVG）。
- 样式入口：`src/renderer/styles/global.css` → `tokens.css` / `components.css` / `views.css`。旧 `app.css`、`TopBar.module.css` 已删除。
- 当前页面组件：`src/renderer/components/views/` 下 `HomeView` / `ChartsView` / `PlaylistDiscoveryView` / `PlaylistDetailView`(5合1) / `SearchResultsView` / `ListeningHistoryView`。
- 已存在资产：`docs/FEATURES.md`（功能规格）、`ui-redesign-demo/`（设计 Demo 与规范，含歌词页参考）。
- **验证基线**：`npm run typecheck` 当前通过；仓库无测试框架（package.json 无 test script）。改动后必须执行 `npm run typecheck`，并以 `npm run dev` 实机验收。
- 十五项问题可归纳为四类根因：
  1. **状态机/竞态缺陷**（问题 2、5、6、15 的空白与闪变）
  2. **数据契约缺口**（问题 6 详情元数据、问题 7 QQ 歌手/歌单搜索、问题 1 歌单封面源、问题 11 删除语义）
  3. **布局与视觉规范缺失**（问题 1、3、4、8、10、12、14）
  4. **交互/动效缺失**（问题 9、11、12、15）

---

## 1. 全局基础设施改造（所有后续项的前置条件）

### 1.1 图标统一为 lucide-react

`package.json:28` 已有 `lucide-react@0.468`，但渲染层全部使用手写 SVG（`Sidebar.tsx:8-50`、`PlayerBar.tsx:7-41,119-121,171-191,213-217,244-253,256-259`、`TopBar.tsx:94-103,108-111,210-219`、`SongTable.tsx:281-297`、`LyricsPanel.tsx:87-89,148-165,192`、`MediaCards.tsx:37-55,74-76,97-101`、`NotificationHost.tsx:62-65`）。这是“图标风格不统一”的总根源。

**方案**：建立单一图标映射模块 `src/renderer/components/icons.tsx`（或 `utils/icons.ts`），全项目唯一导入点，禁止继续手写 SVG：

| 用途 | lucide 组件 | 尺寸/描边 |
|---|---|---|
| 发现音乐 | `Compass` 或 `House` | 17, strokeWidth 1.8 |
| 排行榜 | `BarChart3`（推荐，柱状语义最贴切） | 17, 1.8 |
| 歌单广场 | `LayoutGrid` | 17, 1.8 |
| 最近播放 | `History` | 17, 1.8 |
| 顺序播放 | `ListMusic` 或 `ArrowRightLeft` | 15, 2 |
| 随机播放 | `Shuffle` | 15, 2 |
| 单曲循环 | `Repeat1` | 15, 2 |
| 列表循环 | `Repeat` | 15, 2 |
| 播放/暂停 | `Play` / `Pause`（fill 版） | 16 |
| 上一首/下一首 | `SkipBack` / `SkipForward`（fill 版） | 16 |
| 音量 | `Volume1`（低）→ `VolumeX`（静音，新增） | 15, 2 |
| 队列 | `ListMusic` | 17, 2 |
| 相似推荐 | `Sparkles` | 16, 2 |
| 喜欢 | `Heart` | 15, 2 |
| 更多操作 | `MoreHorizontal` | 15, fill |
| 播放键（卡片/行 hover） | `Play`（fill） | 16 |
| 歌词折叠 | `ChevronDown` | 16, 2 |
| 关闭 | `X` | 12, 2 |
| 主题 | `Sun` / `Moon` | 15, 2 |
| 后退/前进 | `ChevronLeft` / `ChevronRight` | 14, 2 |
| 搜索 | `Search` | 13, 2 |
| 播放列表条目 | 不再用音符图标，改用封面（见问题 1） | — |

**注意**：所有图标统一 `strokeWidth`（描边类 1.8~2）、统一 24 viewBox、容器固定尺寸并 `flex-shrink:0`，避免不同 viewBox 导致的基线错位。`Play`/`Pause`/`SkipBack`/`SkipForward` 用 `fill="currentColor"` 版本。当前播放中的波形 `playing-wave`（`global.css:22-43`）保留。

### 1.2 请求状态机规范（修所有空白/闪变问题的基础）

现状问题：各 store 用 `loading: boolean + data: []` 隐式表达状态，且大量 `await IPC` 没有 `try/finally`，IPC reject 会永久卡 loading；首帧 `loading=false && data=[]` 会被误判为空态。

**统一规范**（新代码一律遵循；存量 store 按第 2 节逐项改造）：

```
每个可加载资源的状态字段：
  data / error / status / updatedAtMs / revision
  status ∈ idle | loading | refreshing | appending | success | success-empty | error | unsupported
```

| 场景 | 渲染 |
|---|---|
| `idle`（从未请求）或首帧前 | 骨架（或空，但绝不能是“空态文案”） |
| `loading` 且无旧数据 | 骨架 |
| `refreshing` 且有旧数据 | 保留旧内容 + 非阻塞指示（顶部细进度条/角落 spinner） |
| `appending` | 旧内容 + 尾部追加骨架 |
| `success` 且数组非空 | 内容 |
| `success-empty` | EmptyState |
| `error` 且无旧数据 | 错误态 + 重试按钮 |
| `error` 且有旧数据 | 旧内容 + 内联/toast 提示 |
| `unsupported`（local provider 等） | EmptyState 专用文案 |

**竞态纪律**：
- 每个请求闭包捕获 `revision = ++revisionByKey[key]`，响应落地前校验 `revision === revisionByKey[key]` 且参数（provider/query/key/offset）未变，否则丢弃。
- `finally` 中只清理**当前 revision 对应的锁**，防止旧请求误清新请求 loading。
- 所有 `await window.musicPlayer.*` 必须 `try/catch/finally`（主进程已把 provider 错误包装成 `{ok:false}`，但仍需防御 preload/channel 异常）。
- 缓存：renderer TTL 10 分钟（`homeFeedStore.ts:23`、`discoveryFeedStore.ts:32` 已有常量），进入页面命中 TTL 直接展示旧数据 + 后台静默刷新；`forceRefresh` 只允许用户手动刷新或 provider 切换触发。

### 1.3 骨架屏系统（问题 15 的实施基础）

现状：只有 `MediaCards.tsx:83-91` 的 `LoadingBlock`（44px 行块）和 `global.css:81-91` 的 `.skeleton-block` 脉冲动画，没有按布局的骨架，也没有 ARIA。

**方案**：
1. 在 `MediaCards.tsx`（或新建 `components/Skeleton.tsx`）提供组合原语：
   - `SkeletonBlock`（基础块，支持 width/height/radius）
   - `SkeletonText`（文本条，width 比例）
   - `SkeletonCover`（1:1 封面占位，可带 `size`）
   - `SkeletonSongRow`（38px 封面 + 两行文本，高度对齐 `.song-row` 的 58px）
   - `SkeletonCardGrid({count, minColWidth})`（与 `.media-grid` 相同列公式 `repeat(auto-fill,minmax(180px,1fr))`）
   - `SkeletonPills({count})`
   - `SkeletonBanner({height})`
2. 尺寸必须与真实内容完全一致（见 2.15 矩阵），保证加载完成零位移。
3. 可用性：异步区域根节点 `aria-busy="true"`；骨架根 `aria-hidden="true"`；提供 `role="status"` 的读屏文案或直接依赖错误/空态的 `role`。
4. 防闪：骨架延迟 `~150ms` 出现、最短显示 `~300ms`（快速请求不闪骨架）。
5. reduced-motion：`[data-reduce-effects="true"] .skeleton-block { animation: none; opacity: 0.65; }` 并同步修复 `useTheme.ts:4-19` 第二个 effect 覆盖系统 `prefers-reduced-motion` 的问题（合并为单一 `reduceEffects` 计算）。

### 1.4 设计 token 补充（tokens.css）

在 `:root` / `[data-theme="light"]` 中补充（供问题 4/8/10/12/13 使用）：

```css
/* 状态色（语义化，暗/亮两套） */
--color-success: #34c77b;  --color-warning: #f5a623;  --color-danger: #f43f5e;
/* toast/提示专用 */
--toast-bg / --toast-text / --toast-border / --toast-shadow
/* 详情 Hero 专用（问题 8） */
--detail-hero-bg / --detail-hero-fg / --detail-hero-muted / --detail-hero-border
/* 层级（当前散落 9/10/14/15/20/100/1000/2000/3000/5000，集中定义） */
--z-topbar: 9; --z-sidebar: 10; --z-drawer-overlay: 14; --z-drawer: 15;
--z-player: 20; --z-dropdown: 100; --z-lyrics: 1000; --z-modal: 2000;
--z-toast: 3000; --z-context-menu: 5000;
/* 焦点环 */
--focus-ring: 0 0 0 2.5px var(--accent-glow);
```

并恢复 `button` 的 `:focus-visible` 可见焦点样式（`tokens.css:142-152` 目前 `outline:none`，键盘不可见焦点）。全局统一规则：

```css
:focus-visible { outline: none; box-shadow: var(--focus-ring); }
```

### 1.5 通用 Popover 菜单组件（问题 11/12 共用）

现状：`PlayerBar` 的模式/音质弹层是内联手写（`PlayerBar.tsx:152-242`），`.popover-menu-item` 无任何样式（`components.css:1118-1148` 只有容器）；`SongTable` 右键菜单是 `div`（`SongTable.tsx:194-222`）；全部无键盘语义。

**方案**：新建 `components/PopoverMenu.tsx` 组件，统一提供：
- `items: { key, icon?, label, checked?, disabled?, children?, onSelect }[]`，支持子菜单（`children`）。
- 渲染 `role="menu"` / `role="menuitem"` / `role="menuitemradio"`（单选语义：播放模式/音质），`aria-checked`、`aria-expanded`、`aria-haspopup`、`aria-disabled`。
- 交互：打开后焦点落到当前选中项；↑↓/Home/End 移动；→ 开子菜单、← 回父级；Escape 关闭并焦点回触发器；点击外部关闭。
- 定位：边缘防溢出（`Math.min(x, innerWidth - w - 8)` 等，参考 `SongTable.tsx:187-191`）。
- 动画：沿用 `.popover-menu` 的 open/close transition（`components.css:1118-1148`），补齐 `.popover-menu-item` 样式（hover/active/checked/disabled + check 图标 + focus-visible）。
- `SongTable` 右键菜单与 `PlayerBar` 弹层都迁移到该组件（或至少复用其 CSS 与键盘逻辑）。

### 1.6 Toast 通知系统（问题 12 第 2 点）

现状：`NotificationHost.tsx:5-10` 把 warning/error 映射为同一玫红、无状态图标、无 ARIA；`AppNotificationHost` 内联样式（`NotificationHost.tsx:22-67`）；`notificationStore.ts:29-43` 模块级单 timer、无 hover/focus 暂停；位置 `top:68`（已经是顶部，但样式与整体割裂）。

**方案**：
- 组件化 `Toast.tsx`：`data-tone="success|warning|error|info"`，每 tone 一个 lucide 图标（`CheckCircle2`/`AlertTriangle`/`XCircle`/`Info`，`aria-hidden`）；success/info 用 `role="status"`，warning/error 用 `role="alert"`，`aria-atomic="true"`。
- 样式走 CSS 类（不再内联），使用 1.4 新增 token：玻璃拟态 `backdrop-filter: var(--blur-strong)`、`border-radius: var(--radius-pill)`、顶部居中滑入（`translateY(-8px)→0` + opacity，320ms `--ease-desktop-out`）。
- 交互：hover/focus 暂停倒计时（store 增加 `pause`/`resume` 或组件内剩余时间计算）；关闭按钮与 action 按钮可聚焦、有 `aria-label`。
- `PlaybackNotice`（`NotificationHost.tsx:71-103`）保持底部持久条，但修复 `switch_source`/`login` 动作点击仅 dismiss 的问题（`NotificationHost.tsx:96`）：登录动作打开 LoginDialog，切换来源切换 provider；并加 `max-width` 与窄屏换行。

---

## 2. 逐项修复方案

### 2.1 问题 1：侧栏上半 item 未对齐、图标不统一；下半歌单区无封面

**根因**：
- 导航图标为不同几何的手写 SVG（`Sidebar.tsx:8-50`），图标画风（描边/填充/viewBox/元素密度）不一；“未对齐”来自 `.nav-item` 高 38px、icon 容器 20px 但各 SVG 实际 17px，且左侧 `active::before` 竖条（`components.css:162-171`）与 padding 造成视觉偏移。
- 歌单项只渲染音符图标（`Sidebar.tsx:167-172`），**封面数据已存在**：`Playlist.coverUrl`（netease `electron/providers/neteaseProvider.cts:2313-2328`、qq `electron/providers/qqProvider.cts:3323-3361` 均映射封面），只是 UI 没消费。

**修改**：
1. `Sidebar.tsx`：`NAV_ITEMS` 与歌单项图标改用 1.1 的 lucide 映射；`PlaylistNavItem`（`Sidebar.tsx:165-176`）改为 `<button>`，前面渲染 `28px×28px` 圆角封面 `<img src={playlist.coverUrl}>`（无封面回退 `coverTone` 色块 + `Music2` 小图标）。
2. `components.css`：`.nav-item` 固定 `height:38px; padding:0 10px;`、`.nav-item-icon` 固定 `22px` 容器并居中；`.playlist-nav-item` 改为 `gap:8px`，封面 `flex-shrink:0`。
3. 可访问性：歌单项当前选中态（`selectedPlaylistId` 匹配）+ `aria-current="true"`。

**验收**：展开态四导航项文本/图标基线对齐；歌单列表全部显示封面；封面缺失时布局不塌陷；键盘 Tab 可聚焦歌单项。

### 2.2 问题 13：左侧移除网易云/QQ 切换，顶部切换驱动左侧内容

**根因**：`Sidebar.tsx:129-140` 重复渲染 provider 切换；`TopBar.tsx:177-188` 也有一份。且“顶部切换驱动左侧内容”目前不统一：
- 首页 provider 来自 `App.tsx:91` `params.providerId ?? activeProviderId`（历史路由 params 可能带旧 provider）；
- 排行榜/歌单广场直接读 `activeProviderId`（`ChartsView.tsx:12`、`PlaylistDiscoveryView.tsx:12`）；
- `App.tsx:95` 把 `local` 硬塞进 `RemoteProviderId` 传给 HomeView，HomeView 无 local 分支。

**修改**：
1. `Sidebar.tsx`：删除 129-140 的 provider 切换区（保留“我的歌单”分组标题）；provider 切换只保留 `TopBar.tsx:177-188`。
2. `App.tsx:89-117`：根视图 provider 统一为 `activeProviderId`，不再用 `params.providerId` 兜底；`home` 分支对 `local` 渲染专用 EmptyState（提示切换平台）；`charts`/`playlistDiscovery` 已有 local 分支（`ChartsView.tsx:26-28`、`PlaylistDiscoveryView.tsx:28-30`）保留。
3. 切换联动：`TopBar` 切换 → `setActiveProvider`（`providerSessionStore.ts:60-62`）→ 各视图 effect 已依赖 provider 变化自动重载；补充 `loadProviderPlaylists(activeProviderId)` 已由 `Sidebar.tsx:64-68` effect 覆盖，验证即可。
4. 细节：`setActiveProvider` 时清空对应页面的过期 error 状态（由各 store 的 revision 机制自然处理）。

**验收**：左侧不再出现平台切换按钮；顶部切换后首页/排行榜/歌单广场/侧栏歌单同步变化；反复快速切换无串数据。

### 2.3 问题 14：侧栏收起时保留用户歌单入口

**根因**：`components.css:211-220` 折叠态把整个 `.sidebar-playlist-section` 设为 `opacity:0; width:0; height:0; pointer-events:none`，歌单完全不可见不可用。

**修改**：
1. `components.css`：折叠态**不隐藏** `.sidebar-playlist-section`；改为只隐藏标题文字与 provider 按钮行：
   ```css
   .app-layout.sidebar-collapsed .nav-group-title,
   .app-layout.sidebar-collapsed .sidebar-brand-text,
   .app-layout.sidebar-collapsed .nav-item-label { opacity:0; width:0; height:0; overflow:hidden; }
   .app-layout.sidebar-collapsed .playlist-nav-item { justify-content:center; padding:6px 0; }
   .app-layout.sidebar-collapsed .playlist-nav-item > span { display:none; }
   ```
2. 折叠态 `.sidebar-playlist-list` 保持 `overflow-y:auto` 可滚动；歌单项 `title` 属性已存在，作为 tooltip。
3. 若担心 64px 宽度下封面过挤：封面缩至 24px 或保留 28px 均可，但列表必须可见可点。

**验收**：折叠后侧栏下半仍显示歌单封面列，可滚动、可点击打开歌单；展开后恢复文字；键盘可访问。

### 2.4 问题 10：右上角登录/平台区样式拥挤

**根因**：`TopBar.tsx:177-193` 同时放平台切换（双按钮）、主题按钮、用户徽章；`UserBadge`（`TopBar.tsx:224-243`）未用 `avatarUrl`、昵称无长度限制；`.search-capsule` 固定 `width:250px`（`components.css:310-313`）挤压右侧；无窄窗口策略。

**修改**（推荐方案 A，改动小且满足需求）：
1. `UserBadge`：使用 `statuses[activeProviderId]?.avatarUrl` 渲染头像（`LoginStatus` 有该字段），无图回退首字母；`.user-name` 加 `max-width:96px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`；`padding` 收紧（`3px 8px 3px 3px`）。
2. `components.css`：`.search-capsule` 改 `width: clamp(180px, 24vw, 250px)`；`.topbar-left` `min-width:0`；`.topbar-right { flex-shrink:0 }`；新增 `@media (max-width: 1024px)`：隐藏 `.user-name` 文本（只留头像）、provider 按钮文字缩短（“网易云”→“云”可选）或降为图标。
3. 平台切换保留在顶栏（问题 13 已移除此处的重复歧义），整体顺序：`[平台切换][主题][用户]`，间距 `gap:8px`。

（可选方案 B：把平台切换并入用户头像的下拉菜单，进一步减压；但需新建账号菜单，工作量更大，留作后续优化。）

**验收**：长昵称/未登录/两平台登录状态在 1024/760/600px 宽下不重叠、不挤压搜索框；头像正常显示。

### 2.5 问题 11：歌曲右键菜单（删除 + 添加到歌单子菜单封面 + 来源语义）

**根因**：
- `SongTable` 无来源上下文（`SongTable.tsx:21-27`），所有列表的“下一首播放/入队”固定写死 `'playlist'` 来源（`SongTable.tsx:93-94`）；
- 菜单无删除/移除项（`SongTable.tsx:199-208`）；renderer 全库没有调用 `removeSongFromPlaylist`（IPC 链路已存在：`providerTypes.ts:253-255`、`preload.cts:128-133`、`main.cts:1001-1010`）；
- 子菜单无封面（`SongTable.tsx:210-221`）；
- `addToPlaylist` 直接 IPC 绕过 store（`SongTable.tsx:171-182`），成功不更新 `playlistTracks` 缓存，失败路径无 `try/finally`（IPC 抛异常时 `playlistPending` 卡死）。

**修改**：
1. `SongTable` 增加 `origin` prop：
   ```ts
   export type SongOrigin =
     | { kind:'playlist'; providerId:ProviderId; playlistId:string; ownership?:Playlist['ownership'] }
     | { kind:'chart'|'search'|'home'|'history'|'artist'|'album'|'recommendation'|'local'; providerId:ProviderId }
   ```
   各调用方显式传入（`HomeView.tsx:69/80/94/106/195`、`PlaylistDetailView.tsx:77/112/199/232/294`、`SearchResultsView.tsx:117/145`、`ListeningHistoryView.tsx:40`）。
2. 删除语义矩阵（按 origin 显示菜单项）：
   - `ownership === 'created'` 的 playlist：显示 **“从此歌单移除”** → `libraryStore.removeSongFromPlaylist(providerId, song, playlistId)`；
   - `isLiked` 歌单 / 任意列表：显示 **“取消喜欢”**（已有 `toggleLiked`）；
   - `kind:'history'`：显示 **“从最近播放移除”** → `listeningHistoryStore` 新增 `removeEntry(providerId, songId)`（现有只有全量 `clear()`，`listeningHistoryStore.ts:41-47`），按 `providerId+songId` 删除并持久化；
   - 队列抽屉内：`QueuePanel.tsx:42-69` 已有按 `queueItemId` 删除，保持；
   - 订阅歌单/榜单/搜索/首页/歌手/专辑：**不显示伪删除项**；
   - local 歌曲：隐藏“添加到歌单/喜欢”等远端写操作（`localProvider` 不支持 mutation）。
3. `libraryStore` 新增 mutation action：`addSongToPlaylist(providerId, song, playlistId)` / `removeSongFromPlaylist(...)`，成功后在 `playlistTracks[key]` 中确定性增删歌曲并更新 `likedSongIds`；失败返回 error 供 toast，不改缓存。
4. 子菜单：过滤出“同 provider 且可写”的自建歌单；每项渲染 `28px` 封面缩略图 + 标题；当前歌曲所在歌单 `disabled`；“暂无可用歌单”保持。
5. 菜单迁移到 1.5 的 PopoverMenu（含键盘与 ARIA）。

**验收**：自建歌单右键可移除且列表即时更新；我喜欢歌单可取消喜欢且红心同步；最近播放可单条移除且刷新后仍在移除状态；QQ/网易云/本地/搜索等场景菜单项符合矩阵；子菜单显示封面；无网络异常卡 pending。

### 2.6 问题 12 第 1 点：PlayerBar 图标统一、播放模式/音质/音量弹层

**根因**：
- `MODE_ICONS`（`PlayerBar.tsx:7-41`）中 `sequence`/`singleLoop`/`listLoop` 三图标**完全相同**；
- `.popover-menu-item` 无样式（`components.css` 仅有容器 `.popover-menu:1118-1148`），active/hover/focus 无反馈；
- 音量是点击 div（`PlayerBar.tsx:255-271`），无键盘、无静音、无数值反馈；进度条同样只有 click 无拖拽（`PlayerBar.tsx:196-203`）；
- 播放模式语义在 `playerStore.ts:326-354,479-500` 中 sequence/listLoop 行为相同，需一并修正。

**修改**：
1. 图标替换为 1.1 lucide 映射：`ListMusic`(顺序) / `Shuffle`(随机) / `Repeat1`(单曲循环) / `Repeat`(列表循环)；播放/暂停、上一首/下一首、音量、队列、相似推荐全部统一。
2. 弹层迁移到 `PopoverMenu`：触发器 `aria-expanded`/`aria-controls`，菜单项 `role="menuitemradio"` + `aria-checked` + 选中 check 图标；打开即焦点当前项；打开后点击外部/Escape 关闭并还焦点。
3. 音量：改为 `<input type="range" min=0 max=100>`（自定义样式为现有 slider 外观，补 `-webkit-slider-thumb`），支持 ↑↓ 步进 ±5、`aria-valuetext="音量 58%"`；音量图标动态（0=`VolumeX`，<50=`Volume1`，≥50=`Volume2`）；点击图标切换静音（记忆原音量）。
4. 进度条：支持 `pointerdown/move/up` 拖拽 seek；hover 显示时间气泡（可选）；保持 `seekRevision` 机制（`playerStore`）。
5. `playerStore`：明确 `sequence` 播到队尾停止（或按产品决定回绕）、`listLoop` 回绕第一首、`singleLoop` 重复；`setPlaybackMode`/`setPlaybackQuality` 立即持久化独立 localStorage key（`playerStore.ts:9-12,100-113,377-389` 目前只写 key 不恢复的问题一并修）。

**验收**：四种模式图标互不相同；弹层有选中态与键盘导航；音量可键盘调节并读屏；图标在深/浅色主题均清晰；窄窗不裁切。

### 2.7 问题 12 第 2 点：Toast（见 1.6，已包含）

### 2.8 问题 2：发现音乐两大色块无图 + “新碟速递”闪现被替换 + 板块过紧

**根因**（分三部分）：
1. **无图**：第一块 banner 只依赖 `dailySong = feed.dailySongs[0]`（`HomeView.tsx:43,141`）。QQ 的 `dailySongs` 恒为空数组（`qqProvider.cts:711` `dailySongs: []`，状态恒 `skipped`）；网易云未登录不请求日推（`neteaseProvider.cts:778-780`），未登录时也为空 → 回退 `coverTone || 渐变` 纯色块。第二块 banner（`HomeView.tsx:152-160`）写死 `var(--accent-gradient)`，根本没有图片数据源。
2. **闪变**：`HomeView.tsx:64-118` 各板块是条件渲染（数据到才出现），加载顺序通常“新碟速递”（`discoveryFeedStore.loadNewAlbums`）先完成 → 先渲染；随后 `homeFeedStore` 推荐与“继续探索/久未收听”完成后**插入其上方**，把新碟推到视口外，用户观感是“新碟被替换成新歌”。另外 `discoveryFeedStore.ts:162-176` 的 `loadAll` 与子任务共用同一个锁 key（`loading[providerId]`），`loadContinueExploring`（`discoveryFeedStore.ts:47-51`）因父锁已置 true 直接 return → 首轮“继续探索”不加载（`HomeView.tsx:86-96` 区段常空）。
3. **紧凑**：`.section-header` 只有 `margin-bottom:20px` 无上边距（`views.css:71-76`），多 section 垂直堆叠粘连。

**修改**：
1. Banner 数据源修复：
   - 第一块：`dailySong` 缺失时回退 `feed.newSongs[0]`（QQ 有 newSongs），再回退 `newAlbums[0].coverUrl`（`discoveryFeedStore.newAlbumsByProvider`）；只有全部缺失才渐变。未登录文案保留。
   - 第二块：不再写死渐变。优先取 `chartsStore.chartsByProvider[providerId][0].coverUrl`（首页 effect 中顺带 `loadCharts(providerId)`）；QQ/无榜数据时回退 `newAlbums[1]?.coverUrl ?? frequentAlbums[0]?.coverUrl`；最终才渐变。图片上叠加现有 `.banner-card::before` 渐变 scrim（`views.css:30-35`）保证文字对比度。
   - 两 banner 都增加骨架态（`SkeletonBanner`），loading 时显示骨架而非“加载中”文案色块。
2. 固定槽位渲染（消除闪变）：重构 `HomeView` 为**先渲染全部固定槽位**（banner → 历史日推(仅网易云) → 每日推荐 → 新歌速递 → 继续探索 → 久未收听 → 新碟速递 → 常听歌手），每槽位 loading 时渲染等尺寸骨架、成功空数组时渲染小型空态占位（或整槽隐藏但骨架期高度已被骨架占据，完成后空槽直接消失——允许此时有一次高度收缩，但**不允许槽位顺序变化**）。数据到达只替换槽内容。
3. `discoveryFeedStore.loadAll` 锁重构：聚合锁 key 用 `${providerId}:all`，子任务锁用 `${providerId}:${module}`，互不干扰；每个子任务 `try/finally`；`loadAll` 在所有子任务 settle 后翻转聚合状态。
4. `homeFeedStore`：`load` 走 TTL 缓存（10 分钟内不请求），`refresh` 才 `forceRefresh:true`（`homeFeedStore.ts:30-39` 目前每次进首页强制刷新删缓存）；补 `try/finally`。
5. 间距：新增 `.home-page` wrapper（`HomeView.tsx:57` 根 div 加 class），在 `views.css` 加 `.home-page .section-header { margin-top: 36px }` 或直接给每个 Section 加统一 `margin-top`；**不要改全局 `.section-header`**（会影响其他页面头）。
6. 设计感增强（问题 3 一并）：banner 高度 156→180、圆角 `--radius-xl`、hover 时 scrim 变亮 + 封面轻微 `scale(1.03)` 过渡；媒体卡片 hover 已有 play badge（`MediaCards.tsx:44-56`），为首页新碟/常听专辑卡片补充 `onPlay`（点击播放整碟/歌手首专）与 `playCount` badge 以提升层次。

**验收**：登录态网易云与 QQ 首页两张 banner 均有真实封面；冷启动/切平台时无“新碟闪现后消失”的板块位移；各板块间距舒适；10 分钟内反复进出首页不发重复请求、无骨架闪烁。

### 2.9 问题 4：排行榜底部过量留白、布局单一、空态缺陷

**根因**：
- `ChartsView.tsx:32-40` 把榜单压成统一 1:1 卡片网格；`subtitle` 用 `chartUpdateLabel(updatedAt) || description`（35 行）导致有更新时间时描述被丢弃，卡片信息单薄。
- 两个确定空白 bug：已有缓存时刷新 → `isLoading=true && charts.length>0` → 50 行骨架条件 `!charts.length` 与 52 行网格条件 `!isLoading` 同时不满足 → 整页空白；成功返回空数组且无 error → 三个条件全不满足 → 空白无空态。
- 榜单总数少（每平台约 10 个），`auto-fill minmax(180px,1fr)` 在宽屏下列满后 `margin-bottom:40px`（`views.css:119`）造成视觉“过量留白”。

**修改**：
1. 渲染分支修正：
   ```
   isLoading && charts.length === 0 → 骨架网格（1:1 卡片 ×6）
   charts.length > 0             → 网格（isLoading 时叠加非阻塞刷新指示，不清空）
   !isLoading && error && charts.length === 0 → 错误态 + 重试
   !isLoading && !error && charts.length === 0 → EmptyState("暂无排行榜数据")
   ```
2. 布局单一改善（轻量方案，不动公共 `MediaCardGrid` 消费方）：榜单页单独使用 `ChartCard` 布局——标题双行（title + 更新时间 badge），`subtitle` 改为 `chart.description`（`ChartSummary` 有该字段），`updatedAt` 以 badge 呈现（复用 `badge` prop）；卡片加 hover play（播放榜单前几首或进入详情）。可选增强：按 `group`（如 `neteaseProvider`/`qqProvider` 榜单均带 group，如“官方榜/特色榜/全球榜”）分节展示，顶部 3 张加大卡 + 其余标准卡，消除单一感。
3. 底部留白：`.charts-view .media-grid { margin-bottom: 0 }`（页面级覆盖，不改公共类）。
4. `chartsStore`：补 TTL、revision、`try/finally`；`loadChartTracks` 的永久缓存（`chartsStore.ts:35-42`）加 TTL；刷新保留旧数据（`refreshing` 语义）。

**验收**：缓存存在时点击刷新网格不消失；空榜单显示空态；失败可重试；页面底部无 40px+ 多余留白；榜单卡片信息层次丰富。

### 2.10 问题 5：歌单广场只有“全部”、反复进入偶发空白

**根因**：
- `PlaylistDiscoveryView.tsx:33` `categories.filter((c) => c.hot || !c.group).slice(0, 8)` 把完整分组砍成 8 个 → 观感“只有全部”。（provider 实际返回完整分组：`neteaseProvider.cts:1356`、`qqProvider.cts:1012`。）
- **反复进入空白**：`playlistDiscoveryStore.ts:63-71` initial 模式 `merged=[]` 却用旧缓存 id 建立 `seen` → 第二次进入同一分类时，第一页 30 项全部命中旧 seen → 全被丢弃 → `merged=[]` → `PlaylistDiscoveryView.tsx:122` 显示“该分类暂无歌单”。
- 分页隐患：append 的 offset 用去重后数组长度（`playlistDiscoveryStore.ts:49`），页面重叠时 offset 不单调 → 可能重复请求/无限循环。
- 锁与竞态：`loadingPlaylists[key]` 释放无 `try/finally`（81 行），IPC reject 永久锁死 key。

**修改**：
1. `playlistDiscoveryStore.ts`：
   - `loadPlaylists` initial：`merged = page.playlists`（内部按 id 去重即可，**不基于旧缓存建 seen**）；append：旧数组 + 新页去重。
   - 新增 `nextOffsetByKey[key]`：append 用 `nextOffset = page.offset + page.playlists.length`（若 provider 返回了 consumed 数则用 consumed）；`hasMore` 用服务端字段。
   - 请求记录 `{ providerId, categoryId, mode, offset, revision }`，提交前校验 key 与 revision；`try/finally` 清理锁且只清当前 revision。
   - `loadCategories` 同样 `try/finally` + TTL。
2. `PlaylistDiscoveryView.tsx`：
   - 快捷栏保留前 8（hot 优先），旁边新增“全部分类”按钮 → 弹出（或展开）按 `group` 分组的完整分类面板（用 1.5 PopoverMenu 或一个分组列表下拉）。
   - `CategoryPlaylistGrid`：`loading && playlists.length === 0` → 卡片网格骨架（`SkeletonCardGrid`，不是行块）；`refreshing` 时保留网格 + 顶部细指示；append 中尾部追加骨架；empty/error 分支保持不变。
   - 进入页面时若 `categories` 未加载先渲染 pill 骨架。
3. 竞态验收：同一分类连续进出 10 次，每次首屏均完整显示第一页 30 项。

### 2.11 问题 6：歌单详情顶部信息不加载 + 布局不符合“名称/介绍/操作”上中下结构

**根因**：
- `App.tsx:103` 已传 `title` 但 `PlaylistDetailView.tsx:37-38` 丢弃；`usePlaylistTracks` 只从 `libraryStore.providerPlaylists` 查歌单（`PlaylistDetailView.tsx:51`），**搜索/歌单广场进入的公共歌单不在库中** → `playlist` undefined → 顶部只有“歌单”占位标题。
- 根因 2：`getPlaylistTracks` 契约只回 `Song[]`（`libraryStore.ts:46-48`），provider 已拿到完整详情（QQ 响应含 `dirinfo.title` 等）但被丢弃，renderer 拿不到公共歌单的封面/描述/创建者/统计。
- 布局：`DetailHeader`（`PlaylistDetailView.tsx:299-344`）是“封面+右侧纵向信息”的左右结构，与用户期望的“上（封面）中（名称）下（介绍/操作）”不符；类型标签 `typeLabel`（“精品歌单/官方榜单/专辑大碟/个性推荐集”）用户认为无意义（问题 8 一并处理）。

**修改**：
1. **契约扩展（推荐）**：`src/shared/musicTypes.ts` / `providerTypes.ts` / `electron/providers/types.cts` / `global.d.ts` / `preload.cts` / `main.cts` 增加 `getPlaylistDetail(providerId, playlistId)` 返回 `PlaylistDetail { playlist: Playlist(含 coverUrl/description/creatorName/playCount/updateLabel), tracks: Song[] }`；netease/qq provider 内部已有详情响应，映射为完整 `Playlist` 即可；local 固定 `local:library`。同步更新 `docs/FEATURES.md` §2.1 契约表。（若不想动 IPC：退而求其次把 `getPlaylistTracks` 返回值扩展为 `{ playlist, tracks }`，但会影响调用方与旧缓存结构，评估后取其一，文档默认前者。）
2. **renderer 详情 store**：新建 `playlistDetailStore`（或并入 `libraryStore`）按 `providerId:playlistId` 索引 `{ detail, status, error }`；搜索/歌单广场进入前先用 `DiscoveredPlaylist` 做缓存 seed（导航参数或各 store 查询），provider 详情返回后覆盖。
3. **统一 DetailHero 布局（上中下）**，覆盖歌单/榜单/专辑/推荐集合：
   ```
   <section class="detail-hero">
     <div class="detail-hero-media">  <!-- 上：封面 176px(桌面)/104px(窄屏) -->
     <h1 class="detail-hero-title">    <!-- 中：名称（两行截断） -->
     <p class="detail-hero-desc">      <!-- 下：介绍（默认 3 行 clamp，可展开） -->
     <div class="detail-hero-stats">   <!-- 统计徽章 -->
     <div class="detail-hero-actions"> <!-- 播放全部/随机 等操作 -->
   </section>
   ```
   移除 `typeLabel` 实体类型徽章（`PlaylistDetailView.tsx:69/105/226/287`；歌手页 159 的“歌手”标签同样移除）；保留有意义的年份/统计。
4. `PlaylistDetail`：加载中渲染 `DetailHero` 骨架 + 行骨架（不再显示“歌单”假标题）；`title` 参数作为首帧 fallback（不再丢弃）。
5. `PlaylistDetailView.tsx:72` 的 `playlist.songIds.length` 回退保留。

**验收**：从搜索/歌单广场/侧栏进入歌单，顶部均显示封面+名称+介绍+统计+操作；加载中为骨架而非占位文本；窄窗 760px 不溢出；描述长文本 clamp 并可展开。

### 2.12 问题 7：QQ 搜索结果不加载歌手和歌单

**根因**：IPC/类型/渲染链路已通（`providerTypes.ts:86-101`、`SearchResultsView.tsx:147-179` 的 `EntityResult` 已能渲染四类 section），但 `qqProvider.cts:359-406` 的 `searchEntities` **只请求歌曲与专辑**，`artists`/`playlists` 被硬编码 `createSearchEntitySection<T>(false)`（396-398）→ UI 只能显示“当前音乐来源不支持歌手搜索”。

**修改**（主要工作量在 Electron provider）：
1. `qqProvider.cts` 扩展 `QQSearchResponse`（4001-4011）增加 `singer`/`songlist`（或对应新接口）字段。QQ 音乐 web 搜索 `t` 参数：0=歌曲、8=专辑；歌手/歌单的类型码与字段结构**实施前必须先抓取一次真实响应 fixture 验证**（构造 `createSearchUrl(kw, 30, 0, T)` 跑一次并 dump JSON），不要盲猜字段名。
2. 仿照 `getQQSongSearchSection`/`getQQAlbumSearchSection`（421-462）实现 `getQQArtistSearchSection`、`getQQPlaylistSearchSection`：复用 `resolveQQSearchSection`（492-501，section 级 try/catch 不拖垮整次搜索）、`createSearchEntitySection(true, items, total, query)`（504-551）、`mapQQSearchAlbum` 同类的 mapper；歌手映射可复用 `getQQSmartboxSuggestions` 或专辑/歌曲 mapper 中的 singer 信息构建 `ArtistSummary`；歌单映射构建 `DiscoveredPlaylist`。
3. 更新 `searchEntities` 的 `Promise.all` 为四路（按 `query.entityTypes` 过滤），`createQQEmptySearchEntityResults`（408-419）同步。
4. 分页与缓存复用现有 `CACHE_KEYS.searchEntities`（key 已含 entityTypes），无需改 store。
5. 若验证发现 QQ 无独立的歌手/歌单搜索接口：退路方案——用 `smartbox`（`qqProvider.cts:4013-4021` 已含 `singer`/`playlist` group）返回的热门条目做第一页，并在文档中如实记录能力边界。**优先找正式搜索接口。**

**验收**：QQ 搜索“周杰伦”时歌手/歌单分区有结果；分页正常；单 section 失败不影响歌曲/专辑展示（section 级 error）。

### 2.13 问题 8：歌手详情顶部过大、浅色反色错误、介绍无限制、去掉无意义标签

**根因**：
- 歌手详情专属 Hero：`views.css:484-528`——`padding:36px 30px` + 140px 圆形头像 + 34px 标题，占屏过大；`.artist-detail-title/.artist-detail-sub` 硬编码 `#fff`（518-527），浅色主题下反色错误；`detail.description` 无行数/高度限制（`PlaylistDetailView.tsx:167`）。
- 实体类型标签无意义：`PlaylistDetailView.tsx:69/105/159/226/287` 与 `views.css:347-356` 的 `.detail-type-badge`。

**修改**：
1. 统一 `DetailHero`（见 2.11 第 3 点），歌手用 `round` 变体：媒体尺寸 176px（圆形头像）/104px（窄屏）；顶部整体高度 ≤ 280px（含安全 padding 24px）；背景若使用 `detail.imageUrl` 大图，只作为低透明 scrim（`background-size:cover` + `::before` 遮罩），**不再撑开高度**。
2. 反色修复：
   - 文字一律用 token：`var(--text-primary)` / `var(--text-secondary)`，删除硬编码 `#fff`/`rgba(255,255,255,…)`（`views.css:518-528`、`PlaylistDetailView.tsx:147` 的 `rgba(0,0,0,0.35)` scrim 亦改为 `var(--detail-hero-scrim)` 双主题 token）。
   - 浅色主题验证：图片缺失时媒体容器回退 `coverTone` 或 `--detail-hero-bg`，不得出现白字白底。
3. 介绍限制：`.detail-hero-desc`（及歌手页 `detail.description`）`display:-webkit-box; -webkit-line-clamp:3; overflow:hidden` + “展开/收起”按钮（超过 3 行才显示），介绍最大宽度 720px（已有 `max-width:720px` 保留）。
4. 删除 `.detail-type-badge` 渲染与样式（保留 `.stat-badge` 用于年份/曲数/更新频率等有信息量的统计）。
5. 歌手页信息压缩：别名/地区/单曲数/专辑数合并为一行副标题（`PlaylistDetailView.tsx:161-166`），描述与操作按钮归入 `detail-hero` 下部。

**验收**：歌手页顶部总高 ≤ 280px；深/浅色主题下标题、副标题、描述均清晰可读（对比度达标）；超长介绍 clamp 3 行可展开；页面不再出现“歌手/歌单/专辑大碟”等纯类型标签。

### 2.14 问题 9：歌词页全面改造（移除体验文字、右侧中部工具、沉浸态、播放底栏、名称跳转、进出动画）

**根因**：
- `LyricsPanel.tsx:91` 顶部“全屏歌词体验”文案；`92-113` 偏移/译文按钮在 header 右侧而非歌词区右侧中部；`147-169` 只有三个播放键，无完整底栏。
- 无 chrome 自动隐藏逻辑（无 idle timer）；`App.tsx:141` 条件渲染——打开即挂载（CSS `.lyrics-overlay.active` 首帧无过渡）、关闭即卸载（无退出动画）。
- `openArtist/openAlbum`（`LyricsPanel.tsx:73-81`）只 `navigateToView` 不 `onClose` → 固定歌词层盖住新视图，观感“点了又回歌词”。
- 无封面衔接动画（HEAD 历史版本曾有完整过渡实现，可参考：封面 origin 矩形 + 调色板 + GSAP，见 `ui-redesign-demo/app.js` 的歌词切换逻辑与 `docs/FEATURES.md` §3.3 歌词系统描述）。

**修改**：
1. **DOM 重构**（`LyricsPanel.tsx`）：
   - 删除“全屏歌词体验”标题行；header 只保留折叠按钮（`ChevronDown`）。
   - 歌词滚动区改为 `display:grid; grid-template-columns: 1fr auto;`：左侧 `.lyrics-scroll-container` 保持现有逐行渲染；右侧新增**垂直居中工具列** `.lyrics-tools`：偏移 `-0.5s / 重置 / +0.5s`（含当前偏移显示）、译文开关（`译/词`）、字号（可选）。工具列样式与现有 `section-action-btn` 一致，`aria-label` 齐全。
2. **完整歌词底栏**：抽取 `PlayerBar` 的控件为一个可复用组件（`surface: 'main' | 'lyrics'`），歌词页渲染 `LyricsPlayerBar`：模式、上一首、播放/暂停、下一首、进度条（可 seek）、相似（仅网易云）、音质、队列、音量全量保留（复用 2.6 改造后的弹层组件）。`.lyrics-overlay` 内新增 `.lyrics-playerbar` 样式（毛玻璃、底部圆角或通栏，z-index 在 overlay 内层）。
3. **沉浸态状态机**（放 `LyricsPanel` 内部 state）：
   ```
   chrome: 'visible' | 'hidden';  无操作 5000ms → hidden（chrome 与底栏一起 fade/slide 隐藏）
   唤醒事件：pointermove、pointerdown、wheel、keydown、focusin（任一 → visible 并重置计时）
   隐藏时仅视觉隐藏（opacity/translate），pointer-events 仍需支持整屏任意移动唤醒（在 overlay 根上监听）
   键盘焦点元素不被移出；reduced-motion 时仅做 opacity。
   ```
4. **Presence 进出动画**（替换 `App.tsx:141` 的裸条件渲染）：
   - 状态：`closed → entering → interactive → exiting → closed`。`App` 持 `isLyricsOpen`（playerStore 已有 `setLyricsOpen`），打开时先记录 PlayerBar 封面 DOM 矩形 + 封面调色板（`playerStore.currentSong.coverTone/coverUrl`），挂载 overlay 后下一帧加 `active` 触发 enter；关闭时先进入 `exiting`，动画完成（约 360-420ms）后 `setLyricsOpen(false)` 卸载。
   - 动画细节：`.lyrics-overlay` 现有 transition（`components.css:837-862`）可作基础（`translateY(100%)→0`），增强为封面 origin→目标矩形的 GSAP 衔接（封面 `FLIP`：初始用 PlayerBar 封面矩形做 `transform` 起点，结束到 `.lyrics-big-cover` 位置）；背景用 `currentSong.coverUrl` 做超大模糊 + `--lyrics-overlay-bg` 叠加（现有 token 已有）。reduced-motion：跳过 FLIP，仅 160ms opacity。
   - 参考实现：`ui-redesign-demo/app.js` 歌词切换部分；HEAD 历史版本 `lyricsTransition.ts` 的阶段机（entering/handoff/unlocking/interactive/exiting/returning/restoring，2600/1200ms）可作为实现参考，但建议取轻量版（进入 ~420ms、退出 ~320ms）。
5. **名称跳转修复**：`openArtist`/`openAlbum` 改为 `closeLyricsThenNavigate(view, params)`：启动退出动画 → 完成后 `setLyricsOpen(false)` + `navigateToView`，保证详情页不被歌词层遮挡。
6. 键盘：Escape 关闭（走退出动画）；空格切换播放（已存在，保留并确保输入控件内不拦截）；打开时焦点给折叠按钮、关闭后焦点还给 PlayerBar 封面按钮。
7. 修复 `useTheme.ts:4-19` reduced-motion 覆盖问题，供歌词动画与骨架共用（见 1.3）。

**验收**：
- 进入/退出均有动画（含减弱动效快速版）；封面从底栏衔接至歌词大封面（非必须但推荐）。
- 顶部无“全屏歌词体验”；偏移/译文工具位于歌词区右侧中部。
- 歌词页底栏具备主底栏全部功能；5s 无操作后 chrome+底栏隐藏，动一下鼠标/键盘立即浮现。
- 点击歌手/专辑最终落在对应详情页且歌词层完全退出。
- 点击歌词行 seek 正常。

### 2.15 问题 15：所有页面加载骨架（全覆盖矩阵）

配合 1.2 状态机与 1.3 组件，逐页实施。**规则**：骨架只在“无旧数据”时出现；有缓存/TTL 命中时保留内容 + 非阻塞刷新指示；成功后空数组 → EmptyState；失败无数据 → 错误 + 重试。

| 页面 | 骨架组成（尺寸对齐真实内容） | 实施位置 |
|---|---|---|
| 发现音乐 | Banner 双卡（180px 高）×2；历史日推（仅网易云）：日期 pill ×7 + 行 ×3；每日推荐：行 ×4；新歌速递：行 ×8；继续探索：行 ×12；久未收听：行 ×12；新碟速递：1:1 卡片 ×6；常听歌手：1:1 卡片 ×4 | `HomeView.tsx`（固定槽位重构，见 2.8） |
| 排行榜 | 1:1 卡片 ×6（`SkeletonCardGrid`）；刷新态保留旧网格 + 顶部细进度条 | `ChartsView.tsx:50-52` |
| 榜单/歌单/专辑详情 | Hero（封面 176 + 标题 2 行 + 描述 3 行 + 按钮）+ 歌曲行 ×8（行高对齐 58px）；曲目独立 error/empty | `PlaylistDetailView.tsx:75/111/218` |
| 歌手详情 | Hero 骨架（圆形头像 176）+ pills ×2 + 歌曲行 ×8 | `PlaylistDetailView.tsx:129` |
| 推荐集合 | Hero + 行 ×8；同时修 `RecommendationCollectionDetail` 无 error/finally 导致永久骨架的问题（`PlaylistDetailView.tsx:242-282`） | 同上 |
| 歌单广场 | 分类 pill ×8；首屏 1:1 卡片 ×12；append 尾部追加卡片骨架；分类与网格骨架独立 | `PlaylistDiscoveryView.tsx:48/120-128` |
| 搜索 | 综合页：歌曲行 ×5 + 歌手圆卡 ×8 + 专辑/歌单卡各 ×6；分 Tab 对应单类骨架；loadMore 时按钮 spinner + 尾部行骨架；首帧不再闪现“未找到相关结果”（`SearchResultsView.tsx:110` 前补 loading 分支） | `SearchResultsView.tsx:110-186` |
| 最近播放 | 数据为同步 localStorage 读取（`listeningHistoryStore.ts:14-30`），**无需骨架**；仅补空态与删除项（问题 11） | 保持 |
| 侧栏歌单 | 展开态行骨架 ×6（28px 封面 + 文字条）；折叠态封面方块骨架 ×6 | `Sidebar.tsx:142-149` |

**基础设施验收**：慢请求下每页骨架不产生布局位移；`aria-busy`/`aria-hidden` 正确；`prefers-reduced-motion` 与 `data-reduce-effects` 下骨架静止、页面动画降级；错误分支均有重试按钮。

---

## 3. 实施顺序与依赖

按依赖关系分七阶段（每阶段结束 `npm run typecheck` + `npm run dev` 冒烟）：

1. **阶段 0 基线**：提交/备份当前工作树（当前有大量未提交变更）；`npm run typecheck` 确认通过；截图留存。
2. **阶段 1 基础设施**（依赖最少，先行）：1.1 lucide 图标模块 → 1.4 token 补充（含状态色/层级/focus-visible）→ 1.5 PopoverMenu → 1.6 Toast → 1.3 Skeleton 原语。
3. **阶段 2 外壳层**：Sidebar（问题 1/13/14）→ TopBar（问题 10）→ PlayerBar 图标+弹层+音量+进度（问题 12 第 1 点）→ NotificationHost（问题 12 第 2 点）。
4. **阶段 3 store 数据层**（纯逻辑，无视觉风险）：1.2 状态机套用至 `homeFeedStore` / `discoveryFeedStore`（含 loadAll 锁） / `chartsStore` / `playlistDiscoveryStore`（含 initial 去重 bug） / `libraryStore`（含 add/remove mutation）/ `recommendationHistoryStore` / `artistCatalogStore`（try/finally + revision）；`listeningHistoryStore.removeEntry`。
5. **阶段 4 页面层**：HomeView（问题 2/3，含固定槽位）→ ChartsView（问题 4）→ PlaylistDiscoveryView（问题 5）→ SearchResultsView（问题 7 渲染侧微调 + 骨架）→ 详情页（问题 6/8：契约 + playlistDetailStore + DetailHero）。
6. **阶段 5 歌词页**（问题 9，依赖阶段 2 的 PlayerBar 抽取与阶段 1 动画 token）。
7. **阶段 6 骨架全覆盖 + 回归**（问题 15 矩阵逐页核对 + reduced-motion 修复）。

**阶段 4 与 7 的 QQ 搜索（问题 7）**需抓 fixture 验证接口类型码，可并行给 Electron provider 做（不影响渲染侧）。

---

## 4. 验收测试总表

仓库无测试框架；验收以 `npm run dev` 手工矩阵 + `npm run typecheck` 为主（如需自动化，可在阶段 1 后引入 Playwright 做 5 条核心视觉回归：首页骨架、歌单广场反复进入、详情 Hero、歌词进出、Toast）。

| # | 场景 | 关键动作 | 预期 |
|---|---|---|---|
| 1 | 侧栏 | 展开/折叠、点歌单、键盘 Tab | 图标统一对齐、歌单有封面、折叠态歌单仍可用、无平台切换按钮 |
| 2 | 首页 | 网易云未登录 / 登录 / QQ 三种状态冷启动；反复进出 | banner 均有图；无板块位移；10 分钟 TTL 不重复请求；板块间距舒适 |
| 3 | 排行榜 | 刷新、空数据 mock、切平台 | 刷新不清空网格；空态/错误态齐全；底部无多余留白 |
| 4 | 歌单广场 | 同一分类进出 10 次、连续滚到加载更多 | 首屏恒 30 条；offset 单调；append 骨架正常 |
| 5 | 歌单详情 | 从搜索/广场/侧栏进入 | 顶部完整（封面/名称/介绍/统计/操作）；骨架替代假标题 |
| 6 | QQ 搜索 | “周杰伦”等关键词 | 歌手/歌单分区有数据；单 section 失败不拖垮整页 |
| 7 | 歌手/专辑详情 | 深/浅主题、超长描述、窄窗 | Hero ≤280px；文字对比度达标；描述 clamp 可展开；无类型标签 |
| 8 | 歌词页 | 进出、无操作 5s、点歌手/专辑、点歌词行 | 动画完整；右侧中部工具；底栏全功能且可沉浸隐藏；跳转落详情页 |
| 9 | 顶栏登录区 | 长昵称、未登录、600px 窗宽 | 不拥挤不换行不遮挡搜索框 |
| 10 | 右键菜单 | 自建歌单/喜欢歌单/最近播放/搜索/本地 | 删除项符合语义矩阵；子菜单带封面；失败不卡 pending |
| 11 | PlayerBar 弹层 | 键盘全流程操作模式/音质/音量 | 图标互异；radio 选中态；音量可键盘；焦点管理正确 |
| 12 | Toast | 成功/警告/错误/信息、hover 停留 | 顶部居中、风格统一、ARIA 正确、悬停不消失 |
| 13 | 骨架屏 | 人为延迟 IPC 1.5s 遍历全部页面 | 骨架按布局显示、无位移、reduced-motion 下静止 |
| 14 | provider 联动 | 顶部切网易云↔QQ↔本地 | 首页/榜单/广场/侧栏歌单同步；无串数据 |
| 15 | 持久化 | 重启应用 | 播放模式/音质/音量/主题/侧栏折叠均恢复正确 |

---

## 5. 风险与注意事项

1. **未提交工作树**：当前 `git status` 有大量增删改（旧组件删除、新 views/store 未提交）。实施前建议先提交一版，防止后续修改无法 diff。
2. **契约变更**（问题 6/7）：`getPlaylistDetail` 新增与 QQ `searchEntities` 扩展涉及 `src/shared/*`、`electron/providers/*`、`main.cts`、`preload.cts`，任何 channel 名/返回结构变化必须同步 `docs/FEATURES.md` §2；`getPlaylistTracks` 的现有调用方（`libraryStore`、`useSongRemoteActions`、`ensureLikedSongIds`）需一并回归。
3. **QQ 搜索类型码未验证**：`t` 参数取值与 `QQSearchResponse` 的 singer/songlist 字段必须以真实响应 fixture 为准，实施前先抓包验证；禁止凭猜测写 mapper。
4. **全局 CSS 波及**：`.section-header`、`.media-grid`、`.pill-item`、`.context-menu` 被多页面共享；任何全局改动需先在首页/排行榜/广场/搜索四处回归。页面级差异一律用页面 wrapper class（如 `.home-page`、`.charts-view`）覆盖。
5. **localStorage key 不得变更**（`FEATURES.md` §6.2 清单）：播放会话、音量、ui-state、defaultProviderId、历史等 key 保持不变，否则老用户会话丢失。
6. **reduced-motion**：`useTheme.ts` 两 effect 冲突必须先修（1.3），否则骨架/歌词动画的降级不可靠。
7. **性能**：骨架延迟 150ms + 最短 300ms；封面 `loading="lazy"` 已有（`MediaCards.tsx:31`），详情大图与 banner 建议加 `decoding="async"`；避免为骨架引入新的 requestAnimationFrame 循环。
8. **兼容性**：`backdrop-filter` 在 Electron 33 无问题；`aspect-ratio`、`-webkit-line-clamp` 均可用；动画统一 GPU 属性（transform/opacity）。
9. **文档同步**：全部完成后更新 `docs/FEATURES.md`（新契约、新组件、交互变化）与 `UI_REFACTOR_SUMMARY.md`。

---

## 附录 A：问题→文件映射速查

| 问题 | 主要文件（当前工作树） |
|---|---|
| 1/13/14 | `src/renderer/components/Sidebar.tsx`、`src/renderer/styles/components.css:211-247` |
| 2/3 | `src/renderer/components/views/HomeView.tsx`、`state/homeFeedStore.ts`、`state/discoveryFeedStore.ts`、`styles/views.css:6-76`、`electron/providers/qqProvider.cts:693-718`、`neteaseProvider.cts:761-804` |
| 4 | `components/views/ChartsView.tsx`、`state/chartsStore.ts`、`styles/views.css:115-120` |
| 5 | `components/views/PlaylistDiscoveryView.tsx`、`state/playlistDiscoveryStore.ts:46-82` |
| 6/8 | `components/views/PlaylistDetailView.tsx`、`state/libraryStore.ts`、`styles/views.css:323-528`、`electron/providers/neteaseProvider.cts` / `qqProvider.cts` 的 getPlaylistTracks |
| 7 | `electron/providers/qqProvider.cts:359-462,2992-3008,4001-4021`、`components/views/SearchResultsView.tsx:147-179` |
| 9 | `components/LyricsPanel.tsx`、`App.tsx:141`、`styles/components.css:836-1035`、`ui-redesign-demo/app.js` |
| 10 | `components/TopBar.tsx:177-243`、`styles/components.css:249-459` |
| 11 | `components/SongTable.tsx:21-27,93-94,171-222`、`state/libraryStore.ts`、`state/listeningHistoryStore.ts` |
| 12 | `components/PlayerBar.tsx:7-41,150-271`、`styles/components.css:1118-1148`、`components/NotificationHost.tsx`、`state/notificationStore.ts` |
| 15 | 全部 `components/views/*`、`components/MediaCards.tsx:83-91`、`styles/global.css:81-91`、`hooks/useTheme.ts:4-19` |

## 附录 B：已确认的确定性 Bug 清单（必修，无需设计讨论）

1. `playlistDiscoveryStore.ts:63-71`：initial 复用旧缓存 seen → 二次进入空白。
2. `playlistDiscoveryStore.ts:49`：append offset 用去重后长度 → 重叠页死循环风险。
3. `discoveryFeedStore.ts:162-176` vs `47-51`：loadAll 与子任务共享锁 → “继续探索”首轮不加载。
4. `homeFeedStore.ts:39`：每次进首页 `forceRefresh` → 无缓存收益 + 闪变放大器。
5. `ChartsView.tsx:50-52`：缓存+loading、成功空数组两个分支渲染空白。
6. `useTheme.ts:16-19`：第二个 effect 覆盖系统 reduced-motion。
7. `LyricsPanel.tsx:73-81`：跳详情不关歌词层。
8. `SongTable.tsx:93-94`：所有列表入队来源写死 'playlist'。
9. `PlayerBar.tsx:7-41`：三个播放模式图标相同。
10. `PlaylistDetailView.tsx:37-38`：丢弃 App 传入的 title；详情只查 libraryStore。
11. 各 store 缺 `try/finally`：IPC reject 永久 loading（`homeFeedStore.ts:35-61`、`libraryStore.ts:32-51`、`chartsStore.ts:23-33`、`playlistDiscoveryStore.ts:31-82`、`recommendationHistoryStore.ts`、`artistCatalogStore.ts:24-68`）。
12. `PlaylistDetailView.tsx:242-282`（推荐集合）：无 error/finally → 失败永久骨架。

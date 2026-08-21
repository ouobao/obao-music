# 欧包音乐 (obao-music) 完整功能规格文档

> 本文档记录应用全部功能，作为前端完全重写的唯一依据。前端删除后，以本文档 + `ui-redesign-demo/`（Aether Flow 设计规范）为准重建。

---

## 1. 项目总览

| 项 | 值 |
|---|---|
| 产品名 | 欧包音乐 |
| 架构 | Electron 33 (主进程 `electron/`) + React 18 + TypeScript + Vite 5 渲染进程 (`src/renderer/`) |
| 状态管理 | Zustand 5 |
| 动画 | GSAP (+@gsap/react)、three.js（3D 环境背景） |
| 图标 | lucide-react |
| 其他 | qrcode（二维码登录）、no router（自研导航栈） |
| 音乐平台 | 网易云 (netease)、QQ 音乐 (qq)、本地文件 (local) |
| 数据通道 | `window.musicPlayer`（preload contextBridge，IPC，无 HTTP 层） |

---

## 2. 前端-后端契约（IPC 全表）

所有 `music.*` 方法返回 `ProviderIpcResult<T>` = `{ok:true,data} | {ok:false,error:{code,providerId,message}}`，错误码仅 `provider_not_ready / provider_unsupported / provider_failed`。类型定义保留在 `src/shared/`（musicTypes.ts / providerTypes.ts / global.d.ts）。

### 2.1 window.musicPlayer 完整接口

```ts
window.musicPlayer = {
  app: {
    getVersion(): Promise<string>,
    setWindowTheme({preference:'system'|'light'|'dark', resolvedThemeId:'white'|'black'}): Promise<void>
  },
  diagnostics: {
    markReady(): void,
    report({level, event, area?, message?, stack?, route?, entityId?, timestamp?}): void  // 限流 180 条/60s
  },
  window: {
    minimize(), toggleMaximize(), toggleFullscreen(): Promise<boolean>,
    setFullscreen(b): Promise<boolean>, close(),
    getCursorPosition(): Promise<{x,y,inside}|null>
  },
  audio: {
    getOutputSettings(): Promise<AudioOutputSettings>,
    setExclusiveMode(enabled): Promise<AudioOutputSettings>,
    restart(): Promise<void>
  },
  tray: {
    updatePlaybackState({title, artist, hasSong, isPlaying}): void,           // send
    onPlaybackAction(cb: ('previous'|'toggle'|'next')=>void): ()=>void        // 订阅
  },
  music: {
    // 登录
    getLoginStatus(providerId), login(providerId),
    loginQrCreate(providerId), loginQrPoll(providerId, key), loginQrCancel(providerId, key),
    logout(providerId),
    // 搜索
    search(providerId, keyword, opts?),                // 仅歌曲（本地平台用）
    getSearchSuggestions(providerId, kw, opts?),
    getSearchHotSearches(providerId, opts?),
    searchEntities(providerId, keyword, opts?),        // song/artist/album/playlist 四类
    // 歌单
    getUserPlaylists(providerId, opts?),
    getPlaylistTracks(providerId, playlistId, opts?),
    getPlaylistDetail(providerId, playlistId, opts?),   // 歌单详情 {playlist, tracks, creatorName?, playCount?, trackCount?, updateLabel?}
    getCharts(providerId, opts?), getChartTracks(providerId, chartId, opts?),
    getPlaylistCategories(providerId, opts?),
    getDiscoveredPlaylists(providerId, query, opts?),   // {categoryId, limit?, offset?}
    // 艺人/专辑
    getArtistDetail(providerId, artistId, opts?), getAlbumDetail(providerId, albumId, opts?),
    // 推荐
    getRecommendationHome(providerId, opts?),           // daily + new
    getNewAlbums(providerId, opts?),
    getHomepageBlocks(providerId, opts?),               // 仅网易云
    getSimilarSongs(providerId, song, opts?),           // 仅网易云
    getRecommendationHistoryDates(providerId, opts?),
    getRecommendationHistory(providerId, date, opts?),
    // 播放
    getSongUrl(providerId, song, quality),              // 返回 musicplayer-audio://source/<uuid>
    getProgramPlayback(providerId, program),
    getLyrics(providerId, song),                        // {ok, lrc?, tlyric?}
    // 写操作
    setSongLiked(providerId, song, liked),
    addSongToPlaylist(providerId, song, playlistId),
    removeSongFromPlaylist(providerId, song, playlistId),
    // 电台（当前无 provider 实现）
    startRadioSession(providerId), refillRadioSession(session),
    skipRadioSessionItem(session, item), submitRadioNegativeFeedback(session, item),
    // 本地
    importLocalFiles()                                   // 弹文件对话框
  }
}
```

### 2.2 关键类型（src/shared/musicTypes.ts）

- **Song**: `{id, providerId, platformSongId?, platformNumericSongId?, platformSongType?, platformMediaId?, title, artist, album, artists?, albumRef?, durationMs, coverTone, coverUrl?, artistImageUrl?, sourceContext?}`
- **Playlist**: `{id, providerId, platformDirectoryId?, title, description, songIds, coverTone, coverUrl?, sourceLabel?, ownership?: 'liked'|'created'|'subscribed', isLiked?}`
- **ArtistSummary/AlbumSummary/ArtistDetail/AlbumDetail**: 见 src/shared/musicTypes.ts（含 topSongs/albums 等）
- **QueueItem**: `{id, mediaId, mediaType:'song'|'program', songId?, source, sourceContext?}`
- **SourceContext**: `{type:'playlist'|'search'|'local'|'artist'|'album'|'podcast'|'radio'|'recommendation', providerId, playlistId?...}`
- **PlaybackRestriction**: `{category:'login_required'|'vip_required'|'paid_required'|'copyright_unavailable'|'region_unavailable'|'provider_risk'|'playback_auth_incomplete'|'url_unavailable', message, action:'login'|'upgrade'|'purchase'|'switch_source'|'retry'|'none'}`
- **Quality**: `'standard'|'higher'|'exhigh'|'lossless'`
- **LoginStatus**: `{providerId, loggedIn, userId?, nickname?, avatarUrl?, vipLabel?, stale?, playbackReady?, message?}`
- **LyricLine**: `{startMs, text}`（前端解析自 LRC）

### 2.3 平台能力矩阵

| 能力 | netease | qq | local |
|---|---|---|---|
| charts / searchExperience / playlistDiscovery / artistCatalog / recommendations / releaseCatalog | ✅ | ✅ | ❌ |
| homepageBlocks / similarSongs / recommendationHistory | ✅ | ❌ | ❌ |
| programPlayback / radioSession | ❌ | ❌ | ❌ |
| QQ searchEntities：song(t=0)+album(t=8)+artist(smartbox 热门) section 可用；**QQ 无歌单搜索接口**（search_for_qq_cp/client_search_cp 全类型码实测仅返回歌曲/专辑，smartbox 无 playlist group，wesearchface H5 已废弃），playlist section 恒 `available:false` | | | |
| 本地歌单固定 `local:library`；`getPlaylistDetail` 本地返回完整本地曲库 | | | |

### 2.4 播放 URL 与限制

- 播放 URL 统一为 `musicplayer-audio://source/<uuid>`（主进程代理，TTL 2h），直接用 `<audio>` 播放。
- 网易云：br 映射 standard→128000 / higher→320000 / exhigh→320000 / lossless→999000；需登录；-460/-462 → `provider_risk`。
- QQ：standard→C400.m4a / higher→M500.mp3 / exhigh→M800.mp3 / lossless→F000.flac；需完整登录（playbackReady，含 authst 播放凭证），否则 `playback_auth_incomplete`。
- 本地：`file://` 流式，无限制。

---

## 3. 前端功能规格（重建依据）

### 3.1 视图模型（自研导航栈，非路由）

视图类型与参数（`uiStore.navigateToView(view, params)`，支持 back/forward 栈）：

| view | params | 说明 |
|---|---|---|
| `home` | — | 发现音乐首页（按当前 provider 显示网易云/QQ 两套内容） |
| `search` | keyword | 搜索结果页 |
| `charts` | — | 排行榜列表 |
| `playlistDiscovery` | categoryId | 歌单广场 |
| `playlist` | providerId, playlistId | 歌单详情 |
| `chart` | providerId, chartId | 榜单详情 |
| `artist` | providerId, artistId | 歌手主页 |
| `album` | providerId, albumId | 专辑大碟 |
| `recommendationCollection` | providerId, collectionId | 推荐集合（daily/new/history/homepage:xxx） |
| `listeningHistory` | — | 最近播放 |

### 3.2 布局外壳（App.tsx）

三栏式 Electron 布局（与 demo 一致，类名体系见 demo）：
- `Sidebar`（左侧 210px，可折叠 64px）
- `TopBar`（顶部 56px，可拖拽区域）
- `MainContent`（中间内容区，视图切换动画）
- `PlayerBar`（底部 76px）
- 右侧 Drawer：QueuePanel + SimilarSongsPanel（带遮罩点击关闭）
- 覆盖层：LyricsPanel（全屏歌词）、LoginDialog（登录）、ContextMenu（右键菜单）、NotificationHost（toast）

**全局协调职责**：搜索提交/建议/热搜下拉、相似推荐会话（revision 防竞态）、歌词页过渡、窗口 Tab 键拦截、抽屉外点击关闭、托盘状态上报、媒体会话注册。

### 3.3 核心交互功能清单

#### 播放器（playerStore + AudioEngine）
- [x] 播放/暂停/上一首/下一首（AudioEngine 隐藏 `<audio>` 执行）
- [x] 播放模式 4 种：顺序 sequence / 随机 shuffle / 单曲循环 singleLoop / 列表循环 listLoop
- [x] 音质 4 档：标准 standard / 较高 higher / 极高 exhigh / 无损 lossless（切换触发重新解析 URL）
- [x] 音量 0-100（默认 58，localStorage 持久化）
- [x] 进度条拖拽 seek（seekRevision 驱动 AudioEngine 定位）
- [x] 队列管理：enqueue（追加）、enqueueNext（下一首播放）、playSongFromList/playSongsFromList（建队播放）、selectQueueItem、清空
- [x] 播放失败自动跳下一首（排除已失败项）、retryPlayback 重试
- [x] 播放限制提示（PlaybackRestriction → PlaybackNotice 持久提示，含 重新登录/重试 动作）
- [x] 会话恢复：队列+进度+音量 持久化 localStorage `musicplayer.playback-session:v2`（上限 500 条，v1 迁移）
- [x] 听歌历史记录：累计收听 ≥30s 或 ≥50% 时长 → `recordQualifiedListen`（localStorage `musicplayer.listening-history:v1`，上限 500）
- [x] 频谱分析：AudioContext + AnalyserNode 挂载 spectrumStore
- [x] Media Session API（系统媒体控制：播放/暂停/上一首/下一首/seek）
- [x] 托盘联动（updatePlaybackState + onPlaybackAction）

#### 首页（HomeView，按 provider 分流）
- 网易云：每日推荐大卡（daily）、首页专题块（homepage blocks）、历史日推（日期选择器，最多 7 天）、继续探索（听歌历史种子歌手最新歌曲，最多 12 首）、久未收听（30 天+，最多 12 首）、新碟速递（12 张）、常听歌手新专辑（最多 6 张）
- QQ：新歌推荐（new）、继续探索、久未收听、新碟速递、常听歌手新专辑 + 昵称问候
- 榜单精选（标题关键词匹配"新歌/热歌/飙升"）、分类快捷入口、歌单分页批次

#### 搜索（TopBar + SearchResultsView）
- TopBar 搜索框：350ms 防抖，下拉显示 热搜/建议/历史 三组（历史上限 8 条）
- Enter 或点击 → 搜索页；`Ctrl+K` 聚焦快捷键
- 搜索页：单曲总览（歌曲列表 + 歌手 Spotlight + 专辑 + 歌单分区）与 分 Tab（歌曲/歌手/专辑/歌单），每页 30 条分页加载更多

#### 歌单广场（PlaylistDiscoveryView）
- Provider 切换、常用分类快捷键 + 全部分类（分组）、响应式歌单网格（2-6 列）、无限滚动（距底 260px 触发 append）

#### 排行榜（ChartsView）
- 排行榜列表（provider 切换 + 刷新 + 更新时间格式化）

#### 统一详情页（PlaylistDetailView，5 合 1）
- 歌单/榜单/歌手/专辑/推荐集合 共用
- 大封面 Hero 头部（滚动 96/168px 压缩过渡）、曲目虚拟列表（行高 58 + overscan 5）
- 播放全部/随机播放、定位当前播放行、回到顶部按钮、歌手专辑/歌曲 Tab、专辑画廊
- 歌曲行菜单：播放/下一首播放/喜欢/添加到歌单/移除

#### 最近播放（ListeningHistoryView）
- 当前播放置顶 + 历史条目（播放次数、相对时间）、点击入队、双击播放、行菜单

#### 歌词系统（LyricsPanel）
- 全屏沉浸歌词页：封面大图 + 曲目信息 + 歌词滚动区（`1fr auto` 布局，右侧垂直居中工具列：偏移 ±0.5s/重置/译词开关）
- 完整歌词底栏（复用 PlayerBar 控件组件）：模式/上一首/播放暂停/下一首/进度 seek/相似/音质/队列/音量
- 沉浸 chrome：5s 无操作自动隐藏 header 与底栏，任意指针/键盘事件唤醒
- Presence 进出动画（enter 420ms / exit 320ms，封面 FLIP 衔接，reduced-motion 降级为 160ms opacity）
- 逐行高亮（active/near-1/near-2 + blur/scale 距离渐变）、点击歌词行 seek 跳转并平滑居中
- 歌词偏移微调（±60s，按歌曲持久化）、字号缩放、翻译歌词对齐（1.5s 容差）
- 点击歌手/专辑先退出歌词层再导航至详情页（不被遮挡）

#### 队列抽屉（QueuePanel）
- 右侧滑出 350px、虚拟列表、双击播放、当前项高亮、来源标签、清空

#### 相似推荐（SimilarSongsPanel，仅网易云种子歌）
- 播放全部/单曲播放/下一首播放/刷新

#### 登录（LoginDialog）
- QQ/网易云 Tab；二维码登录全流程（create → QRCode.toCanvas → 2s 轮询 → waiting/scanned/expired/failed/success 状态机）；登录态展示（nickname/播放授权）、登出、默认平台设置

#### 设置（TopBar 设置弹层）
- 页面切换风格（soft/directional/layered）、减少动效、3D 背景开关、音频独占模式+重启

#### 通知系统（AppNotificationHost）
- toast 通知（成功/警告/错误/信息 tone，3.5s 自动消失，hover/focus 暂停倒计时）；播放限制持久提示（不自动消失，含动作按钮：去登录/重试/切换来源）

#### 侧边栏（Sidebar）
- 导航：发现音乐 / 排行榜 / 歌单广场 / 最近播放（lucide 图标统一）
- 账号歌单库：我喜欢的/创建的歌单/收藏的歌单 三分类，按 provider 分区显示，每项 28px 封面（无封面回退色块+音符）
- 折叠态仅隐藏文字，歌单封面列仍可滚动/点击
- 折叠/展开、新建歌单入口（当前仅 UI 入口）

#### 统一详情页（PlaylistDetailView，5 合 1）
- 歌单/榜单/歌手/专辑/推荐集合 共用 `DetailHero`（上封面 176px/中标题/下介绍 clamp 3 行可展开+统计徽章+操作）
- 歌单详情走 `getPlaylistDetail` IPC（搜索/歌单广场进入的公共歌单也有完整封面/介绍/创建者/播放量）
- 加载中为 Hero 骨架 + 行骨架；无实体类型标签（如"精品歌单/官方榜单"）
- 歌曲行菜单：立即播放/下一首播放/入队/喜欢/添加到歌单(带封面子菜单)/按来源显示删除项（自建歌单移除、喜欢歌单取消喜欢、最近播放移除）

#### 其他
- 主题切换：暗夜曜黑/极简皓白 双主题（`data-theme`，持久化 localStorage）
- 3D 环境背景（three.js 粒子流场等，可禁用）；详情页封面色彩环境光
- 右键全局上下文菜单（立即播放/添加到队列/喜欢/查看歌手）
- 错误边界（上报诊断 + resetKey 自动恢复）

---

## 4. 后端功能（保留，不改动）

- **main.cts**: IPC 注册（46 handle + 3 on）、单实例锁、系统托盘、`musicplayer-audio` 协议代理、窗口控制（全屏控制器）、主题联动、窗口关闭即隐藏、win32 独占音频模式、Windows 身份设置
- **providers/**: neteaseProvider（weapi 加密、二维码登录、搜索、歌单、榜单、播放 URL、歌词、写操作、推荐、首页 blocks、相似歌曲、历史日推）、qqProvider（cookie 会话、二维码登录、musicu 接口、写操作 webpack 签名）、localProvider（本地文件库、子串搜索）、registry.cts（能力路由 + ProviderIpcResult 包装）、searchSuggestionUtils、providerErrors
- **storage/**: FileCacheStore（provider-cache.json，LRU 500 条/16MB，延迟写 240ms，TTL 表见 2.x）、LocalLibraryStore（local-library.json）
- **audioOutputPreferences**: 独占模式开关（需重启）
- **audioSourceRegistry**: URL 令牌注册（TTL 2h）+ 协议响应（本地 file 流式 / 远程 session fetch 带 Range/CORS）
- **processDiagnostics**: JSONL 日志（2MB 轮转×3，字段脱敏）
- **qqCoverImageCors**: QQ 封面图 CORS 注入
- **runtimePaths**: 数据目录解析（参数/env/便携/安装版），保护目录校验
- **windowFullscreenController**: 全屏状态转换（重试 2 次/1.2s 超时）

---

## 5. 设计系统（Aether Flow，以 ui-redesign-demo 为准）

- **令牌**: `tokens.css`（色彩/缓动/圆角/阴影/模糊/时长，双主题）
- **布局**: `.app-layout` 三栏 Grid（210px / 1fr，56px / 1fr / 76px），折叠 64px
- **模糊标准**: overlay blur(28px) saturate(180%) / strong blur(40px) saturate(190%) / lyrics blur(72px) saturate(220%)
- **缓动**: `cubic-bezier(0.16,1,0.3,1)` 缓出、`cubic-bezier(0.32,1.25,0.32,1)` 歌词弹簧；时长 180/320/480/620ms
- **核心组件类名**（必须严格一致）: sidebar/topbar/playerbar/main-content、nav-item、search-capsule、control-btn、play-primary、media-card、song-row(.playing)、drawer-panel、lyrics-overlay、context-menu、popover-menu、modal-backdrop 等
- **交互铁律**: 视图切换零 DOM 冗余；播放歌曲仅局部更新行状态；抽屉遮罩点击关闭；右键菜单边缘防溢出

---

## 6. 重建注意事项

1. `src/shared/` 保留不动（类型契约）
2. `window.musicPlayer` channel 名不得变更
3. 播放会话恢复依赖 localStorage v2 结构（保留 key：`musicplayer.playback-session:v2`、`musicplayer.volume`、`musicplayer.ui-state`、`musicplayer.defaultProviderId`、`musicplayer.listening-history:v1`、`musicplayer.search-history`、`obao-music-visual-preferences`）
4. 依赖库固定：react、zustand、gsap、three、lucide-react、qrcode
5. dev 构建流程：`npm run dev`（vite + electron），验证脚本 `npm run typecheck`

# 技术债清单（Technical Debt）

> 本文档记录本仓库已知的技术债、处置状态与依据。
> 最近更新：本轮清理（见"已处置"）。

## 已处置（本轮）

### D1 · 遗留死样式表 `src/renderer/styles/app.css` — 已删除

- **事实**：该文件 18,319 行，是旧版 UI 的整套样式。`src/renderer/main.tsx` 只 `import './styles/global.css'`；
  `global.css` 只 `@import` `tokens.css` / `components.css` / `views.css`。`app.css` **不在任何入口**。
- **量级**：文件中 707 个类名 token，仅 49 个还被渲染代码以类名引用，其余 646 个为死选择器。
- **依据**：历史会话记录明确记载"全量引入 `app.css` 会让大半 UI 回退旧版"，故当时移除了入口。
- **风险**：保留一个 18k 行、看似可用的样式表，极易被后续误 `@import` 而瞬间回退整个 UI。
- **处置**：删除文件。

### D2 · `LyricsPanel` 中已废弃的封面飞行/水波转场 — 已删除

- **事实**：`global.css` 将 `.lyrics-transition-flight / -ripple / -app-vignette / -filter-defs` 设为
  `display:none !important`，注释写明"推拉动画不使用飞行卡/水波/暗角层，永久隐藏"。
- **实际生效的转场**：`playSimpleSlideEntry` / `playSimpleSlideExit`（整页从底部推入/推出），只使用 `elements.panel`。
- **问题（真实隐患）**：`resolveLyricsTransitionElements()` 却仍**强制要求** `appVignette / flight / bob / glow /
  shadow / ripple / displacement / edges(4) / refractionTargets` 全部存在，否则返回 `null` 并走
  `lyrics-transition-entry-elements-missing` 失败分支。也就是说：一套用不到的 3D 飞行卡细节，反而是推拉转场能否启动的前置条件。
- **处置**：移除飞行卡/水波/暗角相关的 refs、markup、`LyricsTransitionElements` 字段、前置校验与 GSAP 分支，
  保留入口/退场的推拉与 reduced-motion 路径。

### D3 · 根目录调试残留 — 已删除

| 文件 | 说明 |
|---|---|
| `netease_album.json` / `netease_newsong.json` | 网易云原始接口抓包（无任何代码引用） |
| `test-home-feed.html` | 一次性预览页（无引用） |
| `2.md` / `continue.md` | AI 会话日志（约 1 MB，未跟踪） |
| `dev.log` / `dev2.log` / `vite.log` / `electron.log` | 运行日志 |

### D4 · 未被忽略的本地工具目录 — 已补 `.gitignore`

- `.commandcode/` 此前未忽略（`.freebuff/` 已忽略），现统一加入"Local AI-tooling state"分组。

### D5 · 无引用的死模块 — 已删除

以下文件在 `src/`、`electron/`、`index.html` 中外部引用数均为 **0**（仅自引用），且无动态/字符串引用：

| 文件 | 行数 |
|---|---|
| `src/renderer/components/PlayerBackdropMirror.tsx` | 97 |
| `src/renderer/components/ElasticOptionList.tsx` | 199 |
| `src/renderer/components/ElasticVerticalRange.tsx` | 179 |
| `src/renderer/components/MediaCards.tsx` | 117 |
| `src/renderer/hooks/useAnchoredPopoverStyle.ts` | 77 |
| `src/renderer/hooks/useAnimatedPresence.ts` | 24 |
| `src/renderer/utils/artistDetailDecoder.ts` | 245 |
| `src/renderer/utils/asyncScheduling.ts` | 40 |

---

## 待处置（未在本轮修改）

### T1 · 超大单文件，需要按模块拆分

| 文件 | 行数 | 建议 |
|---|---|---|
| `src/renderer/components/LyricsPanel.tsx` | ~2,600 | 拆出转场时间线、虚拟列表、工具栏、菜单 |
| `electron/providers/qqProvider.cts` | ~4,000 | 拆出登录、搜索、歌单、歌词、写操作 |
| `electron/providers/neteaseProvider.cts` | ~2,700 | 同上 |

> 拆分属高风险重构（涉及行为等价性），需配合测试后再进行，本轮未动。

### T2 · 缺少自动化测试

仓库目前无任何单测/集成测试（`.gitignore` 甚至忽略了 `*.test.ts`）。优先补：

1. `provider` 适配层的返回结构快照/契约测试（纯函数部分最易覆盖）；
2. `utils/` 与 `lyrics/` 下纯函数（`lrc.ts`、`lyricsTimeline.ts`、`format.ts`、`virtualWindow.ts` 等）；
3. `audioSourceRegistry` 的 TTL/句柄解析测试。

### T3 · `visual/threeScene.ts` 与 `visualStore` 的连边

`threeScene.ts` 仅被自身引用，`visualThemes` 也仅被 `visualStore` 类型引用；`useVisualStore` 在渲染组件中
无消费者。疑似"3D 背景"功能已下线但代码保留——需产品上确认是**恢复**还是**删除**。

### T4 · CSS 分层与命名

删除 `app.css` 后，样式仅剩 `tokens / components / views / global`。`global.css` 仍承担了较多
"局部补丁"（歌词页、播放栏定向规则）。建议后续逐步下沉到 `components.css` / `views.css`，
让 `global.css` 只保留入口与 reset。

### T5 · 歌词页无法真正关闭（**既有缺陷**，非本轮引入）

- **现象**：播放歌曲后打开歌词页，点击"收起歌词页"或按 `Esc`，过渡进入 `exiting`，
  但随后相位回落到 `interactive`，`.lyrics-overlay` 仍为 `display:flex / opacity:1 / visibility:visible`，
  面板**并未关闭**。
- **复现**：已在**未改动的原始代码**（`git stash` 后重建）上复现，行为完全一致，故与本轮清理无关。
- **线索**：`closeLyricsPanel()` 在 `transitionDirectionRef.current === 'enter'` 时走 `abortEntryTransitionRef`
  分支；否则走 `startExitTransition`。`playSimpleSlideExit` 的 `onComplete` 会调用
  `finishLyricsClose()` → `setLyricsOpen(false)`，但相位在 300ms 后就已定型为 `interactive`，
  疑似存在某处在 exit 期间把相位写回 `interactive`（例如 hover/depth 事件或 `chrome-hidden` 交互）。
- **建议**：单独排查 `setTransitionPhase('interactive')` 的全部写入点与 `transitionBusyRef` 的时序，
  补齐该路径的回归测试后再修。

### T6 · 入口报 CSP 安全告警（仅开发期）

开发模式下渲染进程会打印 Electron 的 `Insecure Content-Security-Policy` 警告；
打包后不再出现。若需彻底消除，可在 `index.html` 或主进程注入 CSP。


# 🎨 Aether Flow - 桌面端音乐播放器 UI/UX 重构 Prompt 指南与设计规范总纲

> **目标**：本文档为 AI Agent / 开发人员提供一套极其精准、严密且完整的 UI 重构设计规范与提示词 (Prompt Guideline)。请严格按照本规范在全新对话中进行代码编写与 UI 重构，确保重构后的界面在审美、视觉统一度、高斯模糊微效、苹果级物理缓动与桌面端交互体验上与当前 Demo 保持 100% 一致。

---

## 目录
1. [系统核心设计哲学与视觉定位](#1-系统核心设计哲学与视觉定位)
2. [设计令牌系统 (Design Tokens Specifications)](#2-设计令牌系统-design-tokens-specifications)
3. [整体布局架构与网格规范 (Layout Architecture & Grid)](#3-整体布局架构与网格规范-layout-architecture--grid)
4. [核心组件 UI 标准与微交互规范 (Component UI Standards)](#4-核心组件-ui-标准与微交互规范-component-ui-standards)
5. [沉浸式全屏歌词页规范 (Apple Music 级视效)](#5-沉浸式全屏歌词页规范-apple-music-级视效)
6. [5合1 动态多维详情页系统 (Dynamic Detail Views System)](#6-5合1-动态多维详情页系统-dynamic-detail-views-system)
7. [交互防陡动、动效与流畅性准则](#7-交互防陡动动效与流畅性准则)
8. [用于新对话的完整系统 Prompt 模板 (System Prompt Template)](#8-用于新对话的完整系统-prompt-模板-system-prompt-template)

---

## 1. 系统核心设计哲学与视觉定位

- **定位**：针对 Electron / Native 桌面窗口特化的**高级轻奢（Aesthetic High-End Glassmorphism）**音乐播放器 UI。
- **视觉风格**：
  1. **极简暗夜曜黑 (Dark Onyx)** 与 **高对比皓白 (Clean Ivory)** 双主题动态响应。
  2. **高斯模糊玻璃拟物 (Backdrop Blur Glassmorphism)**：使用多层 `backdrop-filter: blur(...) saturate(...)`，营造通透、沉浸且有呼吸感的光影分层。
  3. **苹果级物理缓动 (Apple-tier Physics Easing)**：禁止使用线性 `linear` 或突兀的 `ease`，全面采用贝塞尔曲线 `cubic-bezier(0.16, 1, 0.3, 1)`（缓出）与 `cubic-bezier(0.32, 1.25, 0.32, 1)`（弹簧弹性）。
  4. **零闪烁与零跳动**：主视图切换、Tab / Pill 点击、弹层 popover 显隐必须保持零 DOM 冗余、零页面闪烁。

---

## 2. 设计令牌系统 (Design Tokens Specifications)

在重构代码中，必须首先定义并严格继承以下全局 CSS Variables：

### 2.1 色彩与主题 token

```css
:root {
  /* 基础字体 */
  --font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;

  /* 物理缓动与时间轴 */
  --ease-desktop-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-desktop-in-out: cubic-bezier(0.45, 0, 0.15, 1);
  --ease-spring-gentle: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-lyrics-spring: cubic-bezier(0.32, 1.25, 0.32, 1);

  --duration-micro: 180ms;
  --duration-normal: 320ms;
  --duration-page: 480ms;
  --duration-lyrics: 620ms;

  /* 圆角矩阵规范 */
  --radius-drawer: 20px;
  --radius-xl: 20px;
  --radius-lg: 14px;
  --radius-md: 10px;
  --radius-sm: 6px;
  --radius-xs: 4px;
  --radius-pill: 9999px;

  /* 光影与阴影矩阵 */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.12);
  --shadow-md: 0 6px 18px rgba(0, 0, 0, 0.16);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.24);
  --shadow-float: 0 16px 48px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--border-light);
  --shadow-glow-accent: 0 8px 28px var(--accent-glow);

  /* 统一高斯模糊标准 */
  --blur-overlay: blur(28px) saturate(180%);
  --blur-strong: blur(40px) saturate(190%);
  --blur-lyrics: blur(72px) saturate(220%);

  /* 默认：暗夜曜黑 (Dark Onyx) */
  --bg-app: #0a0b0f;
  --bg-sidebar: rgba(15, 17, 24, 0.85);
  --bg-topbar: rgba(15, 17, 24, 0.75);
  --bg-card: rgba(255, 255, 255, 0.045);
  --bg-card-hover: rgba(255, 255, 255, 0.08);
  --bg-active: rgba(255, 255, 255, 0.14);
  --bg-panel: rgba(18, 20, 30, 0.92);
  --bg-glass: rgba(255, 255, 255, 0.06);
  --bg-glass-strong: rgba(255, 255, 255, 0.12);
  --popover-bg: rgba(24, 27, 38, 0.96);

  /* 歌词页专用 */
  --lyrics-overlay-bg: rgba(8, 9, 13, 0.86);
  --lyrics-text-active: #ffffff;
  --lyrics-text-inactive: rgba(255, 255, 255, 0.35);
  --lyrics-text-hover: rgba(255, 255, 255, 0.75);
  --lyrics-trans-active: rgba(255, 255, 255, 0.8);
  --lyrics-trans-inactive: rgba(255, 255, 255, 0.28);

  /* 文字系统 */
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.75);
  --text-tertiary: rgba(255, 255, 255, 0.48);
  --text-muted: rgba(255, 255, 255, 0.28);

  /* 边框 */
  --border-light: rgba(255, 255, 255, 0.08);
  --border-subtle: rgba(255, 255, 255, 0.04);
  --border-focus: rgba(255, 255, 255, 0.25);

  /* 渐变点缀色 */
  --accent-primary: #f43f5e;
  --accent-secondary: #8b5cf6;
  --accent-gradient: linear-gradient(135deg, #f43f5e 0%, #8b5cf6 100%);
  --accent-glow: rgba(244, 63, 94, 0.35);

  --btn-solid-bg: #ffffff;
  --btn-solid-text: #0c0d12;
  --btn-solid-hover: #f1f2f6;
}

/* 亮色模式 (Light Theme) */
[data-theme="light"] {
  --bg-app: #f4f5f9;
  --bg-sidebar: rgba(255, 255, 255, 0.88);
  --bg-topbar: rgba(255, 255, 255, 0.82);
  --bg-card: rgba(0, 0, 0, 0.035);
  --bg-card-hover: rgba(0, 0, 0, 0.065);
  --bg-active: rgba(0, 0, 0, 0.09);
  --bg-panel: rgba(255, 255, 255, 0.96);
  --bg-glass: rgba(0, 0, 0, 0.04);
  --bg-glass-strong: rgba(0, 0, 0, 0.08);
  --popover-bg: rgba(255, 255, 255, 0.98);

  --lyrics-overlay-bg: rgba(245, 246, 250, 0.88);
  --lyrics-text-active: #0f121d;
  --lyrics-text-inactive: rgba(15, 18, 29, 0.35);
  --lyrics-text-hover: rgba(15, 18, 29, 0.7);
  --lyrics-trans-active: rgba(15, 18, 29, 0.75);
  --lyrics-trans-inactive: rgba(15, 18, 29, 0.25);

  --text-primary: #11141d;
  --text-secondary: rgba(17, 20, 29, 0.75);
  --text-tertiary: rgba(17, 20, 29, 0.5);
  --text-muted: rgba(17, 20, 29, 0.32);

  --border-light: rgba(0, 0, 0, 0.08);
  --border-subtle: rgba(0, 0, 0, 0.04);
  --border-focus: rgba(0, 0, 0, 0.2);

  --accent-primary: #e11d48;
  --accent-secondary: #6366f1;
  --accent-gradient: linear-gradient(135deg, #e11d48 0%, #6366f1 100%);
  --accent-glow: rgba(225, 29, 72, 0.22);

  --btn-solid-bg: #11141d;
  --btn-solid-text: #ffffff;
  --btn-solid-hover: #232736;
}
```

---

## 3. 整体布局架构与网格规范 (Layout Architecture & Grid)

### 3.1 页面空间划分 (Grid Layout)
整体框架为经典的 Electron 三栏式布局：
- **左侧 Sidebar**：固定宽度 `220px`（折叠时为 `68px`），背景使用 `--bg-sidebar` 并叠加 `backdrop-filter: var(--blur-overlay)`。包含 Window 控制按钮区、Logo、导航分组、音源 Source 下拉菜单、底部 User 状态。
- **中间 Main Stage**：`flex: 1` 占据剩余全部可用空间。
  - **顶部 Topbar**：固定高度 `64px`，包含前进/后退、搜索框（自带 Icon、Hot Key 提示 `Ctrl+K`）、音质/播放模式状态胶囊、主题切换与窗口无边框拖拽区 `-webkit-app-region: drag`。
  - **主内容区 View Container**：带独立平滑滚动条，内外边距统一 `32px` Padding。
- **底部 Bottom Player**：固定高度 `84px`，底部浮动或固定粘性。包含：
  - 左侧：当前歌曲封面（带点击唤起全屏歌词触发器）、歌名、歌手、爱心收藏与相似推荐按钮。
  - 中间：播放控制核心（随机、上一首、播放/暂停、下一首、循环模式）、时间进度条（支持 Hover 效果与精确时间点）。
  - 右侧：音质切换按钮 `Hi-Res/无损`、音量滑块、播放队列 Drawer 抽屉切换按钮。
- **右侧 Drawer 抽屉（播放队列 / 相似推荐）**：固定宽度 `360px`，使用 `position: absolute; right: 0;` 配合 `transform: translateX(100%)` 平滑滑入。

---

## 4. 核心组件 UI 标准与微交互规范 (Component UI Standards)

### 4.1 媒体卡片矩阵 (Media Cards Grid)
- **网格规范**：`display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 24px;`
- **卡片样式**：
  - 封面容器：`aspect-ratio: 1 / 1; border-radius: var(--radius-lg); overflow: hidden; position: relative;`
  - Hover 效果：图片 `transform: scale(1.05);` 且平滑缓动 `transition: transform 0.4s var(--ease-desktop-out);`。
  - 浮动播放按钮：悬浮在封面右下角，`transform: translateY(10px) scale(0.9); opacity: 0;`，Hover 时 `transform: translateY(0) scale(1); opacity: 1;`，带 `--shadow-glow-accent` 弥散发光。
  - 播放量 Badge：位于封面右上角，半透明黑底胶囊形 `background: rgba(0,0,0,0.45); backdrop-filter: blur(8px);`。

### 4.2 歌曲列表行 (Song Row Item)
- **容器样式**：`display: grid; grid-template-columns: 40px 1.5fr 1fr 1fr 80px; align-items: center; padding: 10px 16px; border-radius: var(--radius-md);`
- **Hover 态**：`background: var(--bg-card-hover);`
- **播放中激活态 (`.playing`)**：
  - 背景：`background: var(--bg-active); border: 1px solid var(--border-light);`
  - 序号位置：隐藏数字，替换为 3 根跳动的音频波形柱动画 (`@keyframes waveBar`)，颜色使用 `--accent-primary`。

### 4.3 分类胶囊 (Filter Pills Bar)
- **样式**：`display: flex; gap: 10px; overflow-x: auto; margin-bottom: 24px;`
- **Pill 项**：`padding: 8px 18px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 500; background: var(--bg-card); color: var(--text-secondary); transition: all 0.25s ease;`
- **Active 态**：`background: var(--btn-solid-bg); color: var(--btn-solid-text); font-weight: 600; box-shadow: var(--shadow-sm);`

---

## 5. 沉浸式全屏歌词页规范 (Apple Music 级视效)

### 5.1 整体分层与遮罩
- **层级**：`position: fixed; inset: 0; z-index: 100;`，默认 `opacity: 0; transform: translateY(100%); pointer-events: none;`。
- **激活态**：`opacity: 1; transform: translateY(0); pointer-events: auto;`。
- **背景**：采用实时曲目封面的超大高斯模糊背景 (`filter: blur(80px) brightness(0.4) saturate(180%); scale(1.2);`)，最上层叠加 `--blur-lyrics` (blur 72px) 与 `--lyrics-overlay-bg`。

### 5.2 歌词逐行渲染与动态效果 (Lyric Lines Easing & Blur)
- **非当前激活行 (`.lyric-line`)**：
  - 字号 `22px`，颜色 `--lyrics-text-inactive` (opacity 0.35)。
  - 高斯模糊效果：`filter: blur(2.5px); transform: scale(0.96); opacity: 0.35;`
- **临近行 (`.near-1`, `.near-2`)**：模糊度依次降低 (`blur(1px)`)，透明度渐亮。
- **当前激活行 (`.active`)**：
  - 字号 `28px`~`32px`，`font-weight: 700; color: var(--lyrics-text-active); opacity: 1; filter: blur(0); transform: scale(1.03);`
  - 译文：位于正下方，字号 `16px`，`color: var(--lyrics-trans-active);`。
- **Hover 悬停交互**：
  - 鼠标悬停任意歌词行，显示左侧极简 `▶` 播放按钮（`width: 26px; height: 26px; border-radius: 50%; background: var(--accent-primary);`）。
  - **点击歌词行**：触发 `seekToLyric(time)`，底栏进度与音乐播放时间瞬间精准 Seek 跳转至该时间点，并触发平滑 `scrollIntoView({ behavior: 'smooth', block: 'center' })` 居中滚动。

---

## 6. 5合1 动态多维详情页系统 (Dynamic Detail Views System)

重构代码必须具备统一响应五类详情架构的能力：

1. **艺人主页 (Artist Page)**：
   - 顶部 Header：超大艺术 Banner (`height: 280px`) + 圆形头像 (`width: 140px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.2)`)。
   - 统计信息：艺人别名、单曲数、专辑数、粉丝数及关注按钮。
   - 内容 Tab：热门单曲、所有专辑、艺人 MV、相似歌手。
2. **专辑大碟 (Album Page)**：
   - 展现专辑大封面 (`220px x 220px; border-radius: var(--radius-xl)`)+ 发行年份 Badge + 专辑简介 + 完整 Track 列表。
3. **精品歌单 (Playlist Page)**：
   - 包含创建者 Avatar、播放量、收藏/分享按钮及全套歌曲列表。
4. **官方榜单 (Chart Page)**：
   - 专属更新频率 Badge（如：“每周四更新”）、排行榜趋势波形图标及 Top 100 榜单。
5. **个性推荐集 (Recommendation Collection)**：
   - 特别企划 Banner 主题背景与智能推荐算法 Tag。

---

## 7. 交互防陡动、动效与流畅性准则

在编写 JS 逻辑与 CSS 样式时，必须恪守以下 4 大底层交互铁律：

1. **绝对禁止 DOM 节点重复拷贝与追加**：
   - 主视图与子视图切换必须做纯净的单流 `stage.innerHTML = newHtml` 替换，禁止使用二次追加的 `.sub-view-container` 产生重复节点，避免高频点击卡死页面。
2. **局部静默更新 (Silent Update)**：
   - 在歌曲列表中点击播放某首歌曲时，仅更新播放控制底栏与当前歌曲行的 `.playing` 状态及波形，**严禁触发整个主视图的重新渲染与页面转场动画**。
3. **全面板全空白遮罩点击退出 (Backdrop Click Dismiss)**：
   - 所有 Drawer 抽屉面板（播放队列、相似推荐）展开时，全局遮罩层 `.drawer-overlay` 必须设置为高层级（`z-index: 14`）并绑定点击事件 `this.closeAllDrawers()`。点击抽屉外的任何空白或高斯模糊区域均需平滑收起抽屉。
4. **右键上下文菜单 (Context Menu)**：
   - 具备全局统一样式的右键 Popover 菜单（`id="app-context-menu"`），计算 `Math.min(e.clientX, window.innerWidth - width)` 防止边缘溢出。

---

## 8. 用于新对话的完整系统 Prompt 模板 (System Prompt Template)

> 💡 **使用方法**：将下方代码框中的 Prompt 完整复制，直接发送给新的 AI 对话，即可让新 AI 完美继承全套 UI 设计风格与重构标准！

```text
你是一位顶级的桌面端 UI/UX 前端专家，精通 Electron 桌面应用视觉设计、苹果级物理缓动、高斯模糊玻璃拟物 (Backdrop Blur Glassmorphism) 以及高性能响应式 Web 架构。

我需要你按照以下【Aether Flow UI 设计规范与重构指南】，为我完全重构/编写音乐播放器的前端 UI 代码：

### 🎯 核心重构目标与风格要求：
1. **视觉定位**：高级桌面端轻奢玻璃拟物风格 (Aesthetic High-End Glassmorphism)。支持暗夜曜黑 (Dark Onyx) 与极简皓白 (Clean Ivory) 双主题。
2. **高斯模糊标准**：
   - 侧边栏/顶部栏：backdrop-filter: blur(28px) saturate(180%)
   - 弹层/抽屉：backdrop-filter: blur(40px) saturate(190%)
   - 全屏歌词：backdrop-filter: blur(72px) saturate(220%)
3. **物理缓动曲线**：全面使用 cubic-bezier(0.16, 1, 0.3, 1) (缓出) 与 cubic-bezier(0.32, 1.25, 0.32, 1) (歌词弹簧)。禁止使用 linear 或默认突兀 transition。
4. **布局架构**：三栏式 Electron 窗口结构 (左侧 220px 侧边栏, 顶部 64px 拖拽 Topbar, 底部 84px 固定播放器, 右侧 360px 抽屉 Drawer)。
5. **交互准则**：
   - 视图切换零闪烁、零 DOM 节点冗余拷贝。
   - 播放歌曲时仅局部静默更新播放状态与波形，严禁重新渲染全页。
   - 右侧 Drawer 抽屉展开时，点击任意外部遮罩空白处均能顺畅收起。
6. **歌词系统 (Apple Music 级)**：
   - 支持高斯模糊渐变与动态缩放 (未激活行 blur(2.5px) opacity(0.35)，激活行 font-size: 32px opacity(1))。
   - Hover 歌词行显示播放 Button，点击歌词行可精准 Seek 跳转歌曲播放进度并平滑居中滚动。
7. **5合1 动态详情页**：完美响应 歌手主页(Banner+圆形头像+热门单曲+专辑列表)、专辑大碟、精品歌单、官方榜单与个性推荐集。

请以此规范为最高的样式与代码标准，严格保持变量与 UI 组件规范的统一性，输出简洁、优雅、无 Bug 的前端代码！
```

---
*文档生成完成。本规范已妥善保存在 `E:\MusicPlayer\ui-redesign-demo\UI_REDESIGN_PROMPT_GUIDE.md` 中。*

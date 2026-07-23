# 欧包音乐（Ou Bao Music）

Electron + React + Vite 桌面音乐播放器。

## 环境要求

- Windows 10/11
- Node.js 20+（建议 LTS）
- npm（随 Node 安装）

## 首次启动

在仓库根目录进入应用目录并安装依赖：

```bat
cd electron-music-player
npm install
```

然后任选一种方式启动：

### 方式 A：双击启动脚本（推荐）

在 `electron-music-player` 目录双击：

- `启动播放器.cmd` — 启动开发模式
- `关闭播放器.cmd` — 停止相关进程

### 方式 B：命令行

```bat
cd electron-music-player
npm run dev
```

或使用 PowerShell 封装（与 `.cmd` 相同）：

```bat
npm run dev:start
npm run dev:stop
```

## 说明

- 开发模式会先编译 Electron 主进程（`build:electron`），再启动 Vite（`http://127.0.0.1:5173`）与 Electron 窗口。
- 构建产物在 `dist` / `dist-electron`，已忽略，无需提交。
- 运行日志默认写在 `logs/`（本地生成，已忽略）。

## 可选

注册 Windows 应用身份（媒体控件等）：

```bat
npm run windows:register-identity
```

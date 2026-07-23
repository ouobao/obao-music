const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const APP_ID = "com.oubao.music";
const APP_NAME = "欧包音乐";
const projectPath = path.resolve(__dirname, "..");

if (process.platform !== "win32") {
  console.error("Windows 应用身份注册仅支持 Windows。");
  process.exitCode = 1;
} else if (!process.versions.electron) {
  const electronPath = require("electron");
  const env = { ...process.env };

  delete env.ELECTRON_RUN_AS_NODE;

  const result = spawnSync(electronPath, [__filename], {
    cwd: projectPath,
    env,
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} else {
  const { app, shell } = require("electron");

  app.whenReady()
    .then(() => {
      const programsPath = path.join(
        process.env.APPDATA,
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
      );
      const shortcutPath = path.join(programsPath, `${APP_NAME}.lnk`);
      const iconPath = path.join(
        projectPath,
        "assets",
        "branding",
        "oubao-logo.ico",
      );
      const operation = fs.existsSync(shortcutPath) ? "replace" : "create";
      const written = shell.writeShortcutLink(shortcutPath, operation, {
        target: process.execPath,
        cwd: projectPath,
        args: `"${projectPath}"`,
        description: APP_NAME,
        icon: iconPath,
        iconIndex: 0,
        appUserModelId: APP_ID,
      });

      if (!written) {
        throw new Error(`无法写入开始菜单快捷方式：${shortcutPath}`);
      }

      console.log(`已注册 ${APP_NAME}：${shortcutPath}`);
      console.log(`AppUserModelId：${APP_ID}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => {
      app.quit();
    });
}

const { spawn } = require('node:child_process');
const electronPath = require('electron');
const DEV_RESTART_EXIT_CODE = 75;

const env = {
  ...process.env,
  VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173'
};

delete env.ELECTRON_RUN_AS_NODE;

startElectron();

function startElectron() {
  const child = spawn(electronPath, ['.'], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit'
  });
  let spawnError = null;

  console.info('[ElectronSupervisor]', {
    event: 'spawned',
    pid: child.pid ?? null
  });

  child.once('error', (error) => {
    spawnError = error;
    console.error('[ElectronSupervisor]', {
      event: 'spawn-error',
      name: error.name,
      message: error.message
    });
  });

  child.once('close', (code, signal) => {
    console.info('[ElectronSupervisor]', {
      event: 'closed',
      pid: child.pid ?? null,
      code,
      signal
    });

    if (spawnError) {
      process.exit(1);
    }
    if (signal) {
      console.error(`[ElectronSupervisor] Electron terminated by signal ${signal}.`);
      process.exit(1);
    }
    if (code === DEV_RESTART_EXIT_CODE) {
      console.info('[ElectronSupervisor] Restarting Electron while keeping Vite alive.');
      startElectron();
      return;
    }

    process.exit(code ?? 1);
  });
}

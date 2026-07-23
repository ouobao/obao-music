import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron development startup contract', () => {
  const supervisorSource = readFileSync(resolve(process.cwd(), 'scripts/startElectronDev.cjs'), 'utf8');
  const startScriptSource = readFileSync(resolve(process.cwd(), 'scripts/start-dev.ps1'), 'utf8');

  it('preserves Electron exit codes and reports signal termination as a failure', () => {
    expect(supervisorSource).toContain("child.once('close', (code, signal)");
    expect(supervisorSource).toContain('if (signal)');
    expect(supervisorSource).toContain('process.exit(code ?? 1)');
    expect(supervisorSource).not.toContain('process.exit(code ?? 0)');
  });

  it('supervises development-only Electron restarts without ending the Vite command', () => {
    expect(supervisorSource).toContain('const DEV_RESTART_EXIT_CODE = 75');
    expect(supervisorSource).toContain('if (code === DEV_RESTART_EXIT_CODE)');
    expect(supervisorSource).toContain('startElectron();');
  });

  it('requires a live renderer-ready marker and fails on early exit or timeout', () => {
    expect(startScriptSource).toContain("$ReadyFile = Join-Path $RuntimeDir 'electron-renderer-ready.json'");
    expect(startScriptSource).toContain("$ReadyState.state -ne 'renderer-ready'");
    expect(startScriptSource).toContain(
      '-not [int]::TryParse([string]$ReadyState.generation, [ref]$ReadyGeneration)'
    );
    expect(startScriptSource).toContain('$ReadyGeneration -le 0');
    expect(startScriptSource).toContain('Test-DescendantProcess -ProcessId $ReadyPid');
    expect(startScriptSource).toContain("$ReadyProcess.Name -ne 'electron.exe'");
    expect(startScriptSource).toContain('$ReadyProcess.CreationDate');
    expect(startScriptSource).toContain('$Process.HasExited');
    expect(startScriptSource).toContain('exited before the renderer was ready');
    expect(startScriptSource).toContain('did not report renderer readiness within 35 seconds');
    expect(startScriptSource).toMatch(/did not report renderer readiness[\s\S]*?exit 1/);
  });

  it('cleans the managed process tree and transient marker after a failed startup', () => {
    expect(startScriptSource).toContain('function Stop-ProcessTree');
    expect(startScriptSource).toContain('function Clear-FailedStartup');
    expect(startScriptSource).toContain('Stop-ProcessTree -ProcessId $ProcessId');
    expect(startScriptSource).toContain('Remove-Item -LiteralPath $PidFile');
    expect(startScriptSource).toContain('Remove-Item -LiteralPath $ReadyFile');

    const timeoutBlock = startScriptSource.slice(
      startScriptSource.lastIndexOf('} while ((Get-Date) -lt $Deadline)'),
      startScriptSource.lastIndexOf('exit 1')
    );
    expect(timeoutBlock).toContain('Clear-FailedStartup -ProcessId $Process.Id');
  });
});

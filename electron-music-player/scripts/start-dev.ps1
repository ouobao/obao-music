$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$RuntimeDir = Join-Path $ProjectRoot '.runtime'
$LogDir = Join-Path $ProjectRoot 'logs'
$PidFile = Join-Path $RuntimeDir 'dev.pid'
$ReadyFile = Join-Path $RuntimeDir 'electron-renderer-ready.json'
$OutLog = Join-Path $LogDir 'dev.out.log'
$ErrLog = Join-Path $LogDir 'dev.err.log'
$DevServerUrl = 'http://127.0.0.1:5173'

New-Item -ItemType Directory -Force -Path $RuntimeDir, $LogDir | Out-Null

function Test-AliveProcess {
  param([int]$ProcessId)

  return [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Test-DescendantProcess {
  param(
    [int]$ProcessId,
    [int]$AncestorProcessId
  )

  $Visited = New-Object 'System.Collections.Generic.HashSet[int]'
  $CurrentProcessId = $ProcessId
  while ($CurrentProcessId -gt 0 -and $Visited.Add($CurrentProcessId)) {
    if ($CurrentProcessId -eq $AncestorProcessId) {
      return $true
    }

    $CurrentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $CurrentProcessId" -ErrorAction SilentlyContinue
    if (-not $CurrentProcess) {
      return $false
    }
    $CurrentProcessId = [int]$CurrentProcess.ParentProcessId
  }

  return $false
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  $Children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($Child in $Children) {
    Stop-ProcessTree -ProcessId ([int]$Child.ProcessId)
  }

  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Clear-FailedStartup {
  param([int]$ProcessId)

  Stop-ProcessTree -ProcessId $ProcessId
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ReadyFile -Force -ErrorAction SilentlyContinue
}

function Get-RendererReadyState {
  param([int]$ManagedProcessId)

  if (-not (Test-Path -LiteralPath $ReadyFile)) {
    return $null
  }

  try {
    $ReadyState = Get-Content -LiteralPath $ReadyFile -Raw | ConvertFrom-Json
    $ReadyPid = 0
    $ReadyGeneration = 0
    [DateTimeOffset]$ReadyTimestamp = [DateTimeOffset]::MinValue
    if (
      $ReadyState.state -ne 'renderer-ready' -or
      [string]::IsNullOrWhiteSpace([string]$ReadyState.runId) -or
      -not [DateTimeOffset]::TryParse([string]$ReadyState.timestamp, [ref]$ReadyTimestamp) -or
      -not [int]::TryParse([string]$ReadyState.generation, [ref]$ReadyGeneration) -or
      $ReadyGeneration -le 0 -or
      -not [int]::TryParse([string]$ReadyState.pid, [ref]$ReadyPid) -or
      -not (Test-AliveProcess -ProcessId $ReadyPid) -or
      -not (Test-DescendantProcess -ProcessId $ReadyPid -AncestorProcessId $ManagedProcessId)
    ) {
      return $null
    }

    $ReadyProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ReadyPid" -ErrorAction SilentlyContinue
    if (
      -not $ReadyProcess -or
      $ReadyProcess.Name -ne 'electron.exe' -or
      $ReadyTimestamp -lt ([DateTimeOffset]$ReadyProcess.CreationDate).AddSeconds(-1)
    ) {
      return $null
    }

    return $ReadyState
  } catch {
    return $null
  }
}

$Process = $null
if (Test-Path -LiteralPath $PidFile) {
  $ExistingPid = 0
  $ExistingPidText = Get-Content -LiteralPath $PidFile -Raw
  if (
    [int]::TryParse($ExistingPidText.Trim(), [ref]$ExistingPid) -and
    (Test-AliveProcess -ProcessId $ExistingPid)
  ) {
    Write-Host "Ou Bao Music is already running. PID: $ExistingPid"
    Write-Host "Log: $OutLog"
    $Process = Get-Process -Id $ExistingPid
  } else {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  }
}

if (-not $Process) {
  Remove-Item -LiteralPath $ReadyFile -Force -ErrorAction SilentlyContinue

  $NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $NpmCommand) {
    $NpmCommand = Get-Command npm -ErrorAction Stop
  }

  $PreviousReadyFile = [Environment]::GetEnvironmentVariable('ELECTRON_RENDERER_READY_FILE', 'Process')
  try {
    [Environment]::SetEnvironmentVariable('ELECTRON_RENDERER_READY_FILE', $ReadyFile, 'Process')
    $Process = Start-Process `
      -FilePath $NpmCommand.Source `
      -ArgumentList @('run', 'dev') `
      -WorkingDirectory $ProjectRoot `
      -RedirectStandardOutput $OutLog `
      -RedirectStandardError $ErrLog `
      -WindowStyle Hidden `
      -PassThru
  } finally {
    [Environment]::SetEnvironmentVariable('ELECTRON_RENDERER_READY_FILE', $PreviousReadyFile, 'Process')
  }

  Set-Content -LiteralPath $PidFile -Value $Process.Id -Encoding ascii

  Write-Host "Starting Ou Bao Music. PID: $($Process.Id)"
}

Write-Host "Dev server: $DevServerUrl"
Write-Host "Output log: $OutLog"
Write-Host "Error log: $ErrLog"
Write-Host "Renderer ready marker: $ReadyFile"

$Deadline = (Get-Date).AddSeconds(35)
do {
  $Process.Refresh()
  if ($Process.HasExited) {
    $ExitCode = $Process.ExitCode
    Clear-FailedStartup -ProcessId $Process.Id
    if ($ExitCode -eq 0) {
      $ExitCode = 1
    }
    Write-Error "Ou Bao Music exited before the renderer was ready. Exit code: $ExitCode." -ErrorAction Continue
    exit $ExitCode
  }

  $ReadyState = Get-RendererReadyState -ManagedProcessId $Process.Id
  if ($ReadyState) {
    Write-Host "Electron renderer is ready. PID: $($ReadyState.pid), runId: $($ReadyState.runId)"
    exit 0
  }

  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $Deadline)

Clear-FailedStartup -ProcessId $Process.Id
Write-Error "Ou Bao Music did not report renderer readiness within 35 seconds. Check $OutLog and $ErrLog." -ErrorAction Continue
exit 1

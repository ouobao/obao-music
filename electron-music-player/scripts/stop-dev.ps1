$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$RuntimeDir = Join-Path $ProjectRoot '.runtime'
$PidFile = Join-Path $RuntimeDir 'dev.pid'
$Stopped = New-Object 'System.Collections.Generic.HashSet[int]'

function Stop-ProcessTree {
  param([int]$ProcessId)

  if ($Stopped.Contains($ProcessId)) {
    return
  }

  $Stopped.Add($ProcessId) | Out-Null

  $Children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($Child in $Children) {
    Stop-ProcessTree -ProcessId ([int]$Child.ProcessId)
  }

  $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($Process) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    Write-Output "Stopped process PID: $ProcessId"
  }
}

$HadTarget = $false

if (Test-Path -LiteralPath $PidFile) {
  $PidText = Get-Content -LiteralPath $PidFile -Raw
  $Pids = $PidText -split '\s+' | Where-Object { $_ -match '^\d+$' }

  foreach ($PidValue in $Pids) {
    $HadTarget = $true
    Stop-ProcessTree -ProcessId ([int]$PidValue)
  }

  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

$ProjectPathPattern = "*$ProjectRoot*"
$FallbackProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $CommandLine = $_.CommandLine
  $CommandLine -and
    ($CommandLine -like $ProjectPathPattern) -and
    ($CommandLine -match 'npm-cli\.js.+run\s+dev(\s|$)|concurrently|wait-on|startElectronDev|node_modules[\\/]\.bin[\\/]vite|vite[\\/]bin[\\/]vite\.js|node_modules[\\/]electron')
}

foreach ($Process in $FallbackProcesses) {
  $HadTarget = $true
  Stop-ProcessTree -ProcessId ([int]$Process.ProcessId)
}

$ResultMessage = if ($HadTarget) {
  'Ou Bao Music dev processes were stopped.'
} else {
  'No Ou Bao Music dev processes were found.'
}

Write-Output $ResultMessage

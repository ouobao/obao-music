$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$ProjectRoots = @(
  $ProjectRoot,
  ($ProjectRoot -replace '\\', '/')
)
$TargetCommandPattern = '(?i)(node_modules[\\/](?:vite|vitest|@playwright|electron|@esbuild)|(?:^|[\\/\s])(?:vite|vitest|playwright|electron|esbuild)(?:\.|[\\/\s]|$)|npm-cli\.js.+(?:\btest\b|run\s+(?:dev|build|test)))'
$WrapperCommandPattern = '(?i)(npm-cli\.js|npx-cli\.js|concurrently|wait-on|playwright|vitest|vite)'

function Test-ProjectCommand {
  param([string]$CommandLine)

  if (-not $CommandLine -or $CommandLine -notmatch $TargetCommandPattern) {
    return $false
  }

  foreach ($Root in $ProjectRoots) {
    if ($CommandLine.IndexOf($Root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }

  return $false
}

$Processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$ProcessById = @{}
$ChildrenByParentId = @{}

foreach ($Process in $Processes) {
  $ProcessId = [int]$Process.ProcessId
  $ParentProcessId = [int]$Process.ParentProcessId
  $ProcessById[$ProcessId] = $Process

  if (-not $ChildrenByParentId.ContainsKey($ParentProcessId)) {
    $ChildrenByParentId[$ParentProcessId] = New-Object 'System.Collections.Generic.List[int]'
  }
  $ChildrenByParentId[$ParentProcessId].Add($ProcessId)
}

$TargetIds = New-Object 'System.Collections.Generic.HashSet[int]'

foreach ($Process in $Processes) {
  if ($Process.ProcessId -ne $PID -and (Test-ProjectCommand -CommandLine $Process.CommandLine)) {
    $TargetIds.Add([int]$Process.ProcessId) | Out-Null
  }
}

function Add-Descendants {
  param([int]$ProcessId)

  if (-not $ChildrenByParentId.ContainsKey($ProcessId)) {
    return
  }

  foreach ($ChildId in $ChildrenByParentId[$ProcessId]) {
    if ($ChildId -eq $PID) {
      continue
    }

    if ($TargetIds.Add($ChildId)) {
      Add-Descendants -ProcessId $ChildId
    }
  }
}

foreach ($TargetId in @($TargetIds)) {
  Add-Descendants -ProcessId $TargetId

  $CurrentId = $TargetId
  while ($ProcessById.ContainsKey($CurrentId)) {
    $ParentId = [int]$ProcessById[$CurrentId].ParentProcessId
    if ($ParentId -eq 0 -or $ParentId -eq $PID -or -not $ProcessById.ContainsKey($ParentId)) {
      break
    }

    $Parent = $ProcessById[$ParentId]
    if (-not $Parent.CommandLine -or $Parent.CommandLine -notmatch $WrapperCommandPattern) {
      break
    }

    $TargetIds.Add($ParentId) | Out-Null
    $CurrentId = $ParentId
  }
}

$StoppedIds = New-Object 'System.Collections.Generic.List[int]'
$PendingIds = @($TargetIds)
while ($PendingIds.Count -gt 0) {
  $LeafIds = @($PendingIds | Where-Object {
    $CandidateId = $_
    -not ($PendingIds | Where-Object {
      $ProcessById.ContainsKey($_) -and [int]$ProcessById[$_].ParentProcessId -eq $CandidateId
    })
  })

  if ($LeafIds.Count -eq 0) {
    $LeafIds = @($PendingIds[0])
  }

  foreach ($ProcessId in $LeafIds) {
    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
      Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
      $StoppedIds.Add($ProcessId)
    }
  }

  $PendingIds = @($PendingIds | Where-Object { $LeafIds -notcontains $_ })
}

Start-Sleep -Milliseconds 250

$Remaining = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessId -ne $PID -and (Test-ProjectCommand -CommandLine $_.CommandLine)
})

if ($Remaining.Count -gt 0) {
  $RemainingSummary = ($Remaining | ForEach-Object { "$($_.Name):$($_.ProcessId)" }) -join ', '
  throw "Project test processes are still running: $RemainingSummary"
}

if ($StoppedIds.Count -gt 0) {
  Write-Output "Stopped project process IDs: $($StoppedIds -join ', ')"
} else {
  Write-Output 'No project test processes were running.'
}

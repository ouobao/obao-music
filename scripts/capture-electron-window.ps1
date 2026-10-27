param(
  [string]$OutputPath,
  [string]$TitlePattern = '欧包'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
  $OutputPath = Join-Path (Join-Path (Get-Location) 'screenshots') "$stamp-electron.png"
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$nativeSource = @'
using System;
using System.Runtime.InteropServices;

public static class ElectronWindowCapture {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int command);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

Add-Type -TypeDefinition $nativeSource -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Drawing

# 选择目标窗口：机器上可能同时存在其它基于 Electron 的应用
# （同为 electron.exe 进程），只按进程名取第一个会抓错窗口，
# 报出 "window size is invalid: 160x28" 这种无关尺寸。
# 这里按"标题匹配 + 尺寸合理 + 可见"三重过滤，并允许用 -TitlePattern 覆盖。
$candidateProcesses = Get-Process -Name electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$TitlePattern*" }

if (-not $candidateProcesses) {
  $candidateProcesses = Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 }
}

$window = $null
foreach ($candidate in $candidateProcesses) {
  $candidateRect = New-Object ElectronWindowCapture+RECT
  if (-not [ElectronWindowCapture]::GetWindowRect($candidate.MainWindowHandle, [ref]$candidateRect)) { continue }
  $w = $candidateRect.Right - $candidateRect.Left
  $h = $candidateRect.Bottom - $candidateRect.Top
  if ($w -ge 500 -and $h -ge 300) {
    $window = $candidate
    break
  }
}

if (-not $window) {
  throw "No Electron window matching '$TitlePattern' with a usable size was found. Run npm run dev:start first, and bring the app window out of the tray."
}

$rect = New-Object ElectronWindowCapture+RECT
if (-not [ElectronWindowCapture]::GetWindowRect($window.MainWindowHandle, [ref]$rect)) {
  throw 'Could not read the Electron window bounds.'
}

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -lt 500 -or $height -lt 300) {
  throw "Electron window size is invalid: ${width}x${height}"
}

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
try {
  $captured = [ElectronWindowCapture]::PrintWindow($window.MainWindowHandle, $hdc, 2)
} finally {
  $graphics.ReleaseHdc($hdc)
}

function Get-ImageVariation {
  param([System.Drawing.Bitmap]$Image)

  $colors = New-Object 'System.Collections.Generic.HashSet[string]'
  $stepX = [Math]::Max(1, [Math]::Floor($Image.Width / 24))
  $stepY = [Math]::Max(1, [Math]::Floor($Image.Height / 24))
  for ($y = 0; $y -lt $Image.Height; $y += $stepY) {
    for ($x = 0; $x -lt $Image.Width; $x += $stepX) {
      $pixel = $Image.GetPixel($x, $y)
      [void]$colors.Add("$($pixel.R),$($pixel.G),$($pixel.B)")
    }
  }
  return $colors.Count
}

$variation = if ($captured) { Get-ImageVariation -Image $bitmap } else { 0 }
if ($captured -and $variation -ge 20) {
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  Write-Host "Electron screenshot saved with PrintWindow: $OutputPath (${width}x${height})"
  exit 0
}

$graphics.Dispose()
$bitmap.Dispose()

# Electron/Chromium can return a uniform first-frame bitmap from PrintWindow.
# Fall back to the real window region after hiding the OpenCode host window.
$hostWindows = Get-Process -Name OpenCode -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 }
foreach ($hostWindow in $hostWindows) {
  [void][ElectronWindowCapture]::ShowWindowAsync($hostWindow.MainWindowHandle, 6)
}

[void][ElectronWindowCapture]::ShowWindowAsync($window.MainWindowHandle, 9)
[void][ElectronWindowCapture]::SetForegroundWindow($window.MainWindowHandle)
Start-Sleep -Milliseconds 500

$fallbackBitmap = New-Object System.Drawing.Bitmap($width, $height)
$fallbackGraphics = [System.Drawing.Graphics]::FromImage($fallbackBitmap)
$fallbackGraphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $fallbackBitmap.Size)
$fallbackVariation = Get-ImageVariation -Image $fallbackBitmap
if ($fallbackVariation -lt 20) {
  $fallbackGraphics.Dispose()
  $fallbackBitmap.Dispose()
  foreach ($hostWindow in $hostWindows) {
    [void][ElectronWindowCapture]::ShowWindowAsync($hostWindow.MainWindowHandle, 9)
  }
  throw "Electron screenshot was blank (PrintWindow variation=$variation, fallback variation=$fallbackVariation)."
}

$fallbackBitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$fallbackGraphics.Dispose()
$fallbackBitmap.Dispose()
foreach ($hostWindow in $hostWindows) {
  [void][ElectronWindowCapture]::ShowWindowAsync($hostWindow.MainWindowHandle, 9)
}

Write-Host "Electron screenshot saved with screen fallback: $OutputPath (${width}x${height})"

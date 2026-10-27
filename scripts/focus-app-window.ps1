param(
  [string]$TitlePattern = '欧包'
)

$ErrorActionPreference = 'Stop'
$native = @'
using System;
using System.Runtime.InteropServices;
public static class WinFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
'@
Add-Type -TypeDefinition $native -ErrorAction SilentlyContinue

$target = Get-Process -Name electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$TitlePattern*" } |
  Select-Object -First 1

if (-not $target) {
  $target = Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
}

if (-not $target) { throw 'Electron window not found' }

if ([WinFocus]::IsIconic($target.MainWindowHandle)) {
  [void][WinFocus]::ShowWindowAsync($target.MainWindowHandle, 9)
  Start-Sleep -Milliseconds 300
}

[void][WinFocus]::ShowWindowAsync($target.MainWindowHandle, 9)
[void][WinFocus]::SetForegroundWindow($target.MainWindowHandle)
Start-Sleep -Milliseconds 600
Write-Host "Focused: $($target.MainWindowTitle) (PID $($target.Id))"

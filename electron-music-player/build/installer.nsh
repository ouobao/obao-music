; Keep the default application folder on a visible, writable data drive when it exists.
; Runtime data is derived by the application as a sibling directory named
; "欧包音乐数据", so it is preserved across upgrades and uninstallations.
!macro customInit
  IfFileExists "D:\*.*" 0 +2
  StrCpy $INSTDIR "D:\欧包音乐"
!macroend

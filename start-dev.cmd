@echo off
setlocal
cd /d "%~dp0"

where pwsh.exe >nul 2>nul
if %errorlevel%==0 (
  pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
)

set "START_EXIT_CODE=%errorlevel%"
if not "%START_EXIT_CODE%"=="0" (
  echo.
  echo HireScope AI startup failed. Review the message and log path above.
) else (
  echo.
  echo HireScope AI startup completed successfully.
)

pause
exit /b %START_EXIT_CODE%

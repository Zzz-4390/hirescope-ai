@echo off
setlocal
cd /d "%~dp0"

where pwsh.exe >nul 2>nul
if %errorlevel%==0 (
  pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-dev.ps1"
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-dev.ps1"
)

set "STOP_EXIT_CODE=%errorlevel%"
if not "%STOP_EXIT_CODE%"=="0" (
  echo.
  echo HireScope AI stop failed. Review the message above.
) else (
  echo.
  echo HireScope AI stopped successfully.
)

pause
exit /b %STOP_EXIT_CODE%

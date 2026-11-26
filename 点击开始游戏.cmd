@echo off
setlocal DisableDelayedExpansion
pushd "%~dp0" || exit /b 1
if exist "start-game.cmd" goto play
echo Extract all game files into one folder before opening this launcher.
pause
exit /b 1
:play
call start-game.cmd
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%

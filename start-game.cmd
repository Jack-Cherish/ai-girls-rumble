@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "LOG=%TEMP%\AI-Girls-Rumble-startup.log"
> "%LOG%" echo AI Girls Rumble - Windows startup
>> "%LOG%" echo Launcher: "%~f0"
pushd "%~dp0" 2>> "%LOG%"
if errorlevel 1 goto folder_error
if not exist "server.cjs" goto extract_error
if not exist "dist\index.html" goto extract_error

set "NODE_EXE="
for %%N in (node.exe) do set "NODE_EXE=%%~$PATH:N"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NODE_EXE goto private_runtime
"%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" 2>> "%LOG%"
if not errorlevel 1 goto launch

:private_runtime
set "NODE_EXE=%LOCALAPPDATA%\AI-Girls-Rumble\runtime\node.exe"
if not exist "%NODE_EXE%" goto install_runtime
"%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" 2>> "%LOG%"
if not errorlevel 1 goto launch

:install_runtime
if not exist "install-game-node.ps1" goto extract_error
echo Installing the game runtime from nodejs.org for this Windows user...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ".\install-game-node.ps1" 2>> "%LOG%"
if errorlevel 1 goto install_error
if not exist "%NODE_EXE%" goto install_error

:launch
>> "%LOG%" echo Node: "%NODE_EXE%"
"%NODE_EXE%" --version >> "%LOG%" 2>&1
echo Starting AI Girls Rumble. Keep this window open while playing.
"%NODE_EXE%" "server.cjs" --port 4430 --open-game 2>> "%LOG%"
set "RC=%ERRORLEVEL%"
if "%RC%"=="0" goto stopped
>> "%LOG%" echo Server exited with code %RC%.
goto report

:extract_error
>> "%LOG%" echo Game files are missing beside start-game.cmd. Extract the entire ZIP to a folder first.
goto report

:install_error
>> "%LOG%" echo Setup failed. Check the connection to https://nodejs.org and try again.
goto report

:report
popd
goto show_error

:folder_error
>> "%LOG%" echo Cannot open the game folder. Extract the entire ZIP to a local folder.
:show_error
echo.
type "%LOG%"
echo.
echo Startup log: "%LOG%"
pause
exit /b 1

:stopped
popd
exit /b 0


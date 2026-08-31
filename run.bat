@echo off
setlocal

rem Faraday (SIH26117) - the front door.
rem
rem Double-click this, or run `run.bat` from a terminal. It checks what is
rem needed, sets everything up if it has not been set up, and starts the
rem workbench in your browser.
rem
rem Everything it does is idempotent - run it as often as you like. The real
rem work lives in scripts/start.mjs; this file exists so that "how do I run
rem it?" has an answer that does not begin with "first, open a terminal".
rem
rem   run.bat            set up if needed, then open FULLSCREEN (kiosk)
rem   run.bat windowed   the same, in an ordinary browser tab
rem   run.bat check      check the install and stop, starting nothing
rem   run.bat setup      set up and stop, starting nothing
rem   run.bat models     download the inference runtime and the two models
rem   run.bat stop       stop the workbench and the inference runtime

cd /d "%~dp0"

echo.
echo   Faraday - a sovereign, air-gapped AI workbench
echo   ----------------------------------------------
echo.

rem ---- Node is the one hard prerequisite -------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed, or is not on your PATH.
  echo.
  echo   Install the LTS version from https://nodejs.org - take the default
  echo   options - then close this window and run this file again.
  echo.
  pause
  exit /b 1
)

rem ---- pnpm: the harness shells out to it to install plugins ------------------

where pnpm >nul 2>nul
if errorlevel 1 (
  echo   pnpm is not installed. Installing it now...
  echo.
  call npm install -g pnpm
  if errorlevel 1 (
    echo.
    echo   Installing pnpm failed. Try running this window as Administrator.
    echo.
    pause
    exit /b 1
  )
)

rem ---- the inference runtime and the two models ------------------------------
rem
rem `fetch-runtime.ps1` downloads llama-swap, the llama.cpp Vulkan build, and the
rem two models the router picks between - the coder and the vision/document
rem model - then writes llama-swap's config with the discrete GPU it finds on
rem THIS machine. It is idempotent: anything already on disk is skipped, so the
rem cost of running it every time is one directory listing.
rem
rem Prefer pwsh (PowerShell 7) and fall back to the Windows-shipped powershell,
rem because a fresh machine has the second and may not have the first.

rem Where the runtime lives. `fetch-runtime.ps1` picks the same two paths: D:\ai
rem when a D: drive exists, LOCALAPPDATA when it does not, so a machine with one
rem drive is not asked for a second.
if exist "D:\" (set "RUNTIME_ROOT=D:\ai") else (set "RUNTIME_ROOT=%LOCALAPPDATA%\faraday-runtime")
set "LLAMA_SWAP_EXE=%RUNTIME_ROOT%\llama-swap\llama-swap.exe"
set "SWAP_CONFIG=%RUNTIME_ROOT%\llama-swap\config.yaml"

set "PS=pwsh"
where pwsh >nul 2>nul || set "PS=powershell"

if /i "%~1"=="stop" (
  echo   Stopping the workbench and the inference runtime...
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127.0.0.1:3080 .*LISTENING"') do taskkill /f /pid %%p >nul 2>nul
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127.0.0.1:8080 .*LISTENING"') do taskkill /f /pid %%p >nul 2>nul
  echo   Stopped.
  echo.
  pause
  exit /b 0
)

if /i "%~1"=="models" (
  call %PS% -NoProfile -ExecutionPolicy Bypass -File "scripts\fetch-runtime.ps1"
  echo.
  pause
  exit /b %errorlevel%
)

rem ---- what were we asked to do ----------------------------------------------

if /i "%~1"=="check" (
  call npm run doctor
  echo.
  pause
  exit /b %errorlevel%
)

if /i "%~1"=="setup" (
  call npm run setup
  echo.
  pause
  exit /b %errorlevel%
)

rem ---- make sure the runtime and the two models are on disk ------------------
rem
rem Skipped in seconds when they already are. On a cold machine it is a 2.5 GB
rem download and the only slow step in this file, so it says so before starting.

if not exist "%LLAMA_SWAP_EXE%" goto :fetchruntime
if not exist "%SWAP_CONFIG%" goto :fetchruntime
goto :runtimeready

:fetchruntime
echo.
echo   The inference runtime or the models are missing. Fetching them now -
echo   about 2.5 GB on a machine that has never run this. Already-downloaded
echo   files are skipped, so this is quick on every run after the first.
echo.
call %PS% -NoProfile -ExecutionPolicy Bypass -File "scripts\fetch-runtime.ps1"
if errorlevel 1 (
  echo.
  echo   Fetching the runtime failed. The message above says why. The usual
  echo   causes are no internet on this machine, or no room on the drive.
  echo.
  pause
  exit /b 1
)

:runtimeready

rem ---- start the inference runtime the workbench talks to --------------------
rem
rem llama-swap holds one model in VRAM at a time and swaps on demand, which is
rem what lets the router move between the coder and the vision model on a card
rem that cannot hold both.
rem
rem It opens its own window. Closing this one does not stop it; that is
rem deliberate, so a mis-click on the workbench does not take the models down
rem with it. `run.bat stop` closes both.

netstat -ano | findstr /r /c:"127.0.0.1:8080 .*LISTENING" >nul 2>nul
if errorlevel 1 (
  echo   Starting the inference runtime on 127.0.0.1:8080 ...
  start "Faraday - inference" /min "%LLAMA_SWAP_EXE%" --config "%SWAP_CONFIG%" --listen 127.0.0.1:8080
) else (
  echo   The inference runtime is already running on 127.0.0.1:8080.
)

echo.

rem ---- windowed: the old behaviour, an ordinary browser tab -------------------

if /i "%~1"=="windowed" (
  call npm run setup
  if errorlevel 1 (
    echo.
    echo   Setup did not finish. The message above says what stopped it.
    echo.
    pause
    exit /b 1
  )
  echo.
  echo   Starting the workbench at http://127.0.0.1:3080
  echo   Close this window to stop it.
  echo.
  call npm start
  exit /b %errorlevel%
)


rem ---- the normal path: set up, then start ------------------------------------

echo   Setting up. The first run installs the harness and takes a few minutes;
echo   after that this step is nearly instant.
echo.

call npm run setup
if errorlevel 1 (
  echo.
  echo   Setup did not finish. The message above says what stopped it.
  echo   `run.bat check` will re-check everything once you have fixed it.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting the workbench. It serves http://127.0.0.1:3080 and nothing else.
echo.
echo   It will open FULLSCREEN once it is ready - no address bar, no tabs.
echo   Press Alt+F4 to close it, or Ctrl+C in this window to stop everything.
echo   Prefer an ordinary browser tab? Run:  run.bat windowed
echo.

call npm run kiosk
set "EXITCODE=%errorlevel%"

if not "%EXITCODE%"=="0" (
  echo.
  echo   ------------------------------------------------------------------
  echo   The workbench stopped with an error. The reason is printed above.
  echo.
  echo   The usual one is that it is ALREADY RUNNING - open
  echo   http://127.0.0.1:3080 and check before starting another copy.
  echo.
  echo   `run.bat check` re-checks the whole install and names what is wrong.
  echo   ------------------------------------------------------------------
  echo.
  pause
)

endlocal
exit /b %EXITCODE%

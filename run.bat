@echo off
setlocal

rem Blind Flange (SIH26117) - the front door.
rem
rem Double-click this, or run `run.bat` from a terminal. It checks what is
rem needed, sets everything up if it has not been set up, and starts the
rem workbench in your browser.
rem
rem Everything it does is idempotent - run it as often as you like. The real
rem work lives in scripts/start.mjs; this file exists so that "how do I run
rem it?" has an answer that does not begin with "first, open a terminal".
rem
rem   run.bat            set up if needed, then start
rem   run.bat check      check the install and stop, starting nothing
rem   run.bat setup      set up and stop, starting nothing
rem   run.bat ingestion  install the optional Python OCR service

cd /d "%~dp0"

echo.
echo   Blind Flange - a sovereign, air-gapped AI workbench
echo   ---------------------------------------------------
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

rem ---- what were we asked to do ----------------------------------------------

if /i "%~1"=="check" (
  call npm run doctor
  echo.
  pause
  exit /b %errorlevel%
)

if /i "%~1"=="ingestion" (
  call npm run setup-ingestion
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
echo   Your browser should open by itself. Close this window to stop it.
echo.

call npm start

endlocal

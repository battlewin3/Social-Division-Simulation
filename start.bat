@echo off
title ABM Social Simulation

where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: PowerShell not found
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1" %*
if %errorlevel% neq 0 (
    echo.
    echo Retrying with interactive menu...
    powershell -ExecutionPolicy Bypass -NoProfile -Command "& '%~dp0start.ps1' menu"
)
pause

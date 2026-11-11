@echo off
title Lumiere Virtual Jewellery Try-On Launcher
echo ===================================================================
echo     Lumiere Virtual Jewellery Try-On - Web Platform
echo ===================================================================
echo.
echo Starting Backend API on http://localhost:4000...
start "Lumiere Backend API (Port 4000)" cmd /k "python server.py"

echo Starting Next.js Web Frontend on http://localhost:3000...
cd frontend
start "Lumiere Frontend (Port 3000)" cmd /k "pnpm dev"

echo.
echo ===================================================================
echo Services launched!
echo - Web App: http://localhost:3000
echo - API Docs: http://localhost:4000/api/docs
echo ===================================================================


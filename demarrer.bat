@echo off
cd /d "%~dp0"
title Comptage Palettes
if not exist node_modules (
  echo Installation des composants...
  call npm install --omit=dev
)
if not exist .env copy .env.example .env >nul
npm start
pause

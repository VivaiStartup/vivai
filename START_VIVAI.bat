@echo off
setlocal

REM === CAMBIA QUI I PERCORSI ===
set FE_DIR=C:\project\vivai
set BE_DIR=C:\project\vivai-api

REM === Start PHP API (porta 8000) ===
start "VIVAI API (PHP)" cmd /k "cd /d %BE_DIR% && php -S localhost:8000 -t public"

REM === Start Frontend (Vite) ===
start "VIVAI Frontend (Vite)" cmd /k "cd /d %FE_DIR% && npm run dev"

echo.
echo Avviato! Frontend: http://localhost:40001  -  API: http://localhost:8000
echo.
endlocal
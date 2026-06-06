@echo off
echo ==================================================
echo   DEPLOIEMENT VERS PRODUCTION (GITHUB)
echo ==================================================
echo.
echo Note: Vercel se deploie automatiquement depuis GitHub.
echo.

set /p message="Message du commit (Entree = 'Mise a jour production') : "
if "%message%"=="" set message=Mise a jour production

echo.
echo [1/3] Ajout des fichiers modifies...
git add .

echo [2/3] Creation du commit...
git commit -m "%message%"

echo [3/3] Synchronisation et envoi vers GitHub...
git pull origin main --rebase
if %errorlevel% neq 0 (
    echo ERREUR: Conflit lors du rebase. Resolvez les conflits puis relancez.
    pause
    exit /b 1
)
git push origin main
if %errorlevel% neq 0 (
    echo ERREUR: Le push GitHub a echoue.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo   PUSH GITHUB OK !
echo   Vercel va deployer automatiquement dans ~2min.
echo   Suivi: https://vercel.com/dashboard
echo ==================================================
pause

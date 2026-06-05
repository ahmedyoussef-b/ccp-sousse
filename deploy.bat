@echo off
echo ==================================================
echo   DEPLOIEMENT VERS PRODUCTION (GITHUB + VERCEL)
echo ==================================================
echo.

set /p message="Entrez le message du commit (ou appuyez sur Entree pour 'Mise a jour production') : "
if "%message%"=="" set message=Mise a jour production

echo.
echo [1/4] Ajout des fichiers modifies...
git add .

echo [2/4] Creation du commit...
git commit -m "%message%"

echo [3/4] Envoi vers GitHub...
git push -u origin main

echo [4/4] Deploiement sur Vercel...
echo (Note: Si votre projet Vercel est connecte a votre depot GitHub, cette etape est optionnelle)
call npx vercel --prod

echo.
echo ==================================================
echo   TERMINE !
echo ==================================================
pause

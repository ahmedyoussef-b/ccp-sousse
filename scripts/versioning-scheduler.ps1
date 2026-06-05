param([string]$Action = "status")
$TaskName = "CCP-AutoVersioning"
$ScriptPath = "C:\ahmed\ccp\scripts\auto-versioning.ps1"
function Install-Scheduler {
    Write-Host "Installation..." -ForegroundColor Cyan
    $trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -Trigger daily"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName "$TaskName-Daily" -Trigger $trigger -Action $action -Settings $settings -Force
    Write-Host "Tache installee" -ForegroundColor Green
}
function Uninstall-Scheduler {
    Unregister-ScheduledTask -TaskName "$TaskName-Daily" -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tache supprimee" -ForegroundColor Yellow
}
function Get-SchedulerStatus {
    $task = Get-ScheduledTask -TaskName "$TaskName-Daily" -ErrorAction SilentlyContinue
    if ($task) { Write-Host "Statut: $($task.State)" -ForegroundColor Green }
    else { Write-Host "Non installe" -ForegroundColor Red }
}
switch ($Action) {
    "install" { Install-Scheduler }
    "uninstall" { Uninstall-Scheduler }
    default { Get-SchedulerStatus }
}

# scripts/auto-versioning.ps1
param(
    [string]$Trigger = "manual",
    [string]$Comment = "",
    [switch]$Force,
    [switch]$DryRun
)

$ExamplesPath = "C:\ahmed\ccp\data\training\examples.json"
$VersionsDir = "C:\ahmed\ccp\data\training\versions"
$LogPath = "C:\ahmed\ccp\data\training\logs\versioning.log"

function Write-Log {
    param($Message, $Color = "Cyan")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Write-Host $logEntry -ForegroundColor $Color
    $logDir = Split-Path $LogPath -Parent
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -Path $LogPath -Value $logEntry -Encoding UTF8
}

function Get-ExampleCount {
    if (-not (Test-Path $ExamplesPath)) { return 0 }
    try { $examples = Get-Content $ExamplesPath -Raw -Encoding UTF8 | ConvertFrom-Json; return $examples.Count }
    catch { return 0 }
}

function New-Snapshot {
    param($TriggerType, $CommentText, $Count)
    if (-not (Test-Path $ExamplesPath)) { Write-Log "Aucun examples.json" "Yellow"; return $false }
    if (-not (Test-Path $VersionsDir)) { New-Item -ItemType Directory -Path $VersionsDir -Force | Out-Null }
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $date = Get-Date -Format "yyyy-MM-dd"
    $files = Get-ChildItem $VersionsDir -Filter "examples_v*.json"
    $maxVersion = 0
    foreach ($file in $files) {
        if ($file.Name -match 'examples_v(\d+)_') {
            $val = [int]$Matches[1]
            if ($val -gt $maxVersion) { $maxVersion = $val }
        }
    }
    $versionNum = $maxVersion + 1
    $versionFile = "examples_v${versionNum}_${date}_${timestamp}.json"
    $versionPath = Join-Path $VersionsDir $versionFile
    Copy-Item $ExamplesPath $versionPath -Force
    $fileSize = [math]::Round((Get-Item $ExamplesPath).Length / 1KB, 2)
    if (-not $CommentText) { $CommentText = "Snapshot - $TriggerType - $date" }
    Write-Log "SNAPSHOT: $versionFile ($Count exemples, ${fileSize}KB)" "Green"
    return $true
}

function Clear-OldSnapshots {
    $maxVersions = 1; $maxAgeDays = 90
    if (-not (Test-Path $VersionsDir)) { return 0 }
    $versions = Get-ChildItem $VersionsDir -Filter "examples_v*.json" | Sort-Object CreationTime -Descending
    $deleted = 0
    for ($i = 0; $i -lt $versions.Count; $i++) {
        $v = $versions[$i]
        $ageDays = (Get-Date) - $v.CreationTime | Select-Object -ExpandProperty Days
        if ($i -ge $maxVersions -or $ageDays -gt $maxAgeDays) {
            Remove-Item $v.FullName -Force
            $commentPath = $v.FullName + ".comment"
            if (Test-Path $commentPath) { Remove-Item $commentPath -Force }
            $metadataPath = $v.FullName -replace '\.json$', '.metadata.json'
            if (Test-Path $metadataPath) { Remove-Item $metadataPath -Force }
            $deleted++
        }
    }
    if ($deleted -gt 0) { Write-Log "Nettoyage: $deleted versions supprimees" "Green" }
    return $deleted
}

Write-Log "Versionnement - Trigger: $Trigger" "Cyan"
$count = Get-ExampleCount
Write-Log "Exemples: $count" "Cyan"
if (-not $DryRun) {
    if (New-Snapshot -TriggerType $Trigger -CommentText $Comment -Count $count) {
        Clear-OldSnapshots
        Write-Log "Termine avec succes" "Green"
    }
}

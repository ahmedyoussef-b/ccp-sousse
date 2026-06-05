# scripts/cleanup-versions.ps1
# Nettoyage automatique des versions expirees

param(
    [int]$MaxVersions = 1,
    [int]$MaxAgeDays = 90,
    [switch]$DryRun
)

$VersionsDir = "C:\ahmed\ccp\data\training\versions"
$LogPath = "C:\ahmed\ccp\data\training\logs\cleanup.log"

function Write-CleanupLog {
    param($Message)
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Add-Content -Path $LogPath -Value $logEntry -Encoding UTF8
    Write-Host $logEntry -ForegroundColor Cyan
}

Write-CleanupLog "Demarrage du nettoyage automatique"

$versions = Get-ChildItem $VersionsDir -Filter "examples_v*.json" | ForEach-Object {
    $metadataPath = $_.FullName -replace '\.json$', '.metadata.json'
    $metadata = if (Test-Path $metadataPath) {
        Get-Content $metadataPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } else { $null }
    
    @{
        file = $_
        path = $_.FullName
        created = $_.CreationTime
        size = $_.Length
        important = $metadata -and $metadata.important
    }
} | Sort-Object -Property { $_.created } -Descending

$deletedCount = 0
$keptImportant = 0

for ($i = 0; $i -lt $versions.Count; $i++) {
    $version = $versions[$i]
    $ageDays = (Get-Date) - $version.created | Select-Object -ExpandProperty Days
    $shouldDelete = $false
    
    if ($i -ge $MaxVersions -and -not $version.important) {
        $shouldDelete = $true
        $reason = "max versions ($MaxVersions)"
    }
    elseif ($ageDays -gt $MaxAgeDays -and -not $version.important) {
        $shouldDelete = $true
        $reason = "age > $MaxAgeDays jours ($([math]::Round($ageDays,1)) jours)"
    }
    
    if ($shouldDelete) {
        if (-not $DryRun) {
            Remove-Item $version.path -Force
            $metadataPath = $version.path -replace '\.json$', '.metadata.json'
            if (Test-Path $metadataPath) { Remove-Item $metadataPath -Force }
        }
        $deletedCount++
        Write-CleanupLog "  Supprime: $($version.file.Name) ($reason)"
    }
    elseif ($version.important) {
        $keptImportant++
    }
}

if ($DryRun) {
    Write-CleanupLog "[DRY RUN] $deletedCount versions seraient supprimees"
} else {
    Write-CleanupLog "Nettoyage termine: $deletedCount supprimees, $keptImportant importantes conservees"
}
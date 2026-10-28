# build.ps1 - Status-Driven Actions Plugin packer
# Usage:
#   .\build.ps1                 # ask for version interactively (Enter = keep current)
#   .\build.ps1 1.20.0          # set version to 1.20.0 and pack
#   .\build.ps1 patch|minor|major   # bump from current version
#   .\build.ps1 1.20.0 -Force   # overwrite an existing plugin-v1.20.0.zip
#   .\build.ps1 -Keep           # keep current version, no prompt

param(
    [string]$Version = '',
    [switch]$Force,
    [switch]$Keep
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Read-Utf8([string]$path) { [System.IO.File]::ReadAllText("$PSScriptRoot\$path", [System.Text.Encoding]::UTF8) }
function Write-Utf8([string]$path, [string]$text) { [System.IO.File]::WriteAllText("$PSScriptRoot\$path", $text, $utf8NoBom) }

function Get-ManifestVersion {
    if ((Read-Utf8 'contents\manifest.json') -match '"version":\s*"([^"]+)"') { return $Matches[1] }
    return '0.0.0'
}

function Step-Version([string]$cur, [string]$part) {
    $p = $cur.Split('.') | ForEach-Object { [int]$_ }
    switch ($part) {
        'major' { return "$($p[0] + 1).0.0" }
        'minor' { return "$($p[0]).$($p[1] + 1).0" }
        default { return "$($p[0]).$($p[1]).$($p[2] + 1)" }
    }
}

function Fail([string]$msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== Status-Driven Actions Plugin Build ===" -ForegroundColor Cyan

$current = Get-ManifestVersion
Write-Host "Current version: $current" -ForegroundColor Gray

if (-not $Version -and -not $Keep) {
    $suggest = Step-Version $current 'patch'
    Write-Host "  Enter = keep $current | patch -> $suggest | minor -> $(Step-Version $current 'minor') | or type x.y.z"
    $Version = (Read-Host "Version").Trim()
}
if ($Version -in @('patch', 'minor', 'major')) { $Version = Step-Version $current $Version }
if (-not $Version) { $Version = $current }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { Fail "Version format must be x.y.z (e.g. 1.20.0), got '$Version'" }
if ([version]$Version -lt [version]$current) {
    Write-Host "WARNING: $Version is lower than current $current (kintone may refuse the update)" -ForegroundColor Yellow
}

# 1. Version
if ($Version -ne $current) {
    $m = (Read-Utf8 'contents\manifest.json') -replace '"version":\s*"[^"]+"', ('"version": "' + $Version + '"')
    Write-Utf8 'contents\manifest.json' $m
    Write-Host "[1/5] Version $current -> $Version" -ForegroundColor Green
} else {
    Write-Host "[1/5] Version unchanged: $Version" -ForegroundColor Gray
}
$cfg = Read-Utf8 'contents\dist\config.js'
if ($cfg -notmatch "const UI_VERSION = '$([regex]::Escape($Version))'") {
    Write-Utf8 'contents\dist\config.js' ($cfg -replace "const UI_VERSION = '[^']+'", ("const UI_VERSION = '" + $Version + "'"))
    Write-Host "      config.js UI_VERSION -> $Version" -ForegroundColor Green
}

# 2. Sync mobile.js = desktop.js
Copy-Item contents\dist\desktop.js contents\dist\mobile.js -Force
$h1 = (Get-FileHash contents\dist\desktop.js).Hash
$h2 = (Get-FileHash contents\dist\mobile.js).Hash
if ($h1 -ne $h2) { Fail "mobile.js differs from desktop.js after sync" }
Write-Host "[2/5] mobile.js synced (identical)" -ForegroundColor Green

# 3. Pre-checks
$jsFiles = 'contents\dist\desktop.js', 'contents\dist\config.js', 'contents\dist\dialog.js', 'contents\dist\dbmap.js'
foreach ($f in $jsFiles) {
    if (-not (Test-Path $f)) { continue }
    $hit = Select-String -Path $f -Pattern 'console\.log\([^)]*(rawConfig|[Tt]oken)' -List
    if ($hit) { Fail "$f line $($hit.LineNumber): console.log may leak config/token" }
    & node --check $f
    if ($LASTEXITCODE -ne 0) { Fail "Syntax error in $f" }
}
Write-Host "[3/5] Pre-checks passed (syntax, no token logging)" -ForegroundColor Green

# 4. Find .ppk
$ppk = Get-ChildItem "$PSScriptRoot\*.ppk" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ppk) { Fail ".ppk key not found in $PSScriptRoot" }
Write-Host "[4/5] Using key: $($ppk.Name)" -ForegroundColor Green

# 5. Pack
$out = "plugin-v$Version.zip"
if ((Test-Path $out) -and -not $Force) { Fail "$out already exists. Use a new version or add -Force to overwrite." }
if (Test-Path $out) { Remove-Item $out -Force }

Write-Host "[5/5] Packing..." -ForegroundColor Cyan
npx --yes @kintone/plugin-packer contents --ppk $ppk.Name --out $out
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $out)) { Fail "Pack failed, $out not found" }

$size = (Get-Item $out).Length
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Output: $out ($size bytes)" -ForegroundColor Green
Write-Host "Next: kintone Admin > Plug-ins > Update > upload $out" -ForegroundColor Yellow

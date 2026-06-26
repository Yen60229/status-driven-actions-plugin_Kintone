# build.ps1 - Status-Driven Actions Plugin 一鍵建置
# 用法:
#   .\build.ps1              # 只同步 mobile.js + 打包（版本不變）
#   .\build.ps1 1.8.0        # 同步 + bump 版本到 1.8.0 + 打包

param([string]$Version = '')

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== Status-Driven Actions Plugin Build ===" -ForegroundColor Cyan

# 1. Sync mobile.js = desktop.js
Copy-Item contents\dist\desktop.js contents\dist\mobile.js -Force
$diffOut = git diff --stat contents/dist/desktop.js contents/dist/mobile.js 2>&1
if ($diffOut) {
    Write-Error "mobile.js 與 desktop.js 仍有差異，請檢查"; exit 1
}
Write-Host "[1/4] mobile.js 已同步" -ForegroundColor Green

# 2. Version bump (optional)
if ($Version) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        Write-Error "版本格式不正確，應為 x.y.z（例: 1.8.0）"; exit 1
    }

    # manifest.json - regex replace to preserve formatting
    $manifest = Get-Content contents\manifest.json -Raw -Encoding utf8
    $manifest = $manifest -replace '"version":\s*"[^"]+"', ('"version": "' + $Version + '"')
    [System.IO.File]::WriteAllText("$PSScriptRoot\contents\manifest.json", $manifest, [System.Text.Encoding]::UTF8)

    # config.js - UI_VERSION constant
    $cfg = Get-Content contents\dist\config.js -Raw -Encoding utf8
    $cfg = $cfg -replace "const UI_VERSION = '[^']+'", ("const UI_VERSION = '" + $Version + "'")
    [System.IO.File]::WriteAllText("$PSScriptRoot\contents\dist\config.js", $cfg, [System.Text.Encoding]::UTF8)

    # Re-sync mobile.js after config.js change (mobile != config, but good habit to re-confirm desktop=mobile)
    Copy-Item contents\dist\desktop.js contents\dist\mobile.js -Force

    Write-Host "[2/4] 版本已 bump 至 $Version (manifest.json + config.js UI_VERSION)" -ForegroundColor Green
} else {
    $currentVer = ((Get-Content contents\manifest.json -Raw) | ConvertFrom-Json).version
    Write-Host "[2/4] 版本維持 $currentVer（略過 bump）" -ForegroundColor Gray
}

# 3. Find .ppk
$ppk = Get-ChildItem "$PSScriptRoot\*.ppk" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ppk) {
    Write-Error ".ppk 私鑰找不到！請確認 *.ppk 放在 $PSScriptRoot"; exit 1
}
Write-Host "[3/4] 使用私鑰: $($ppk.Name)" -ForegroundColor Green

# 4. Pack
$ver = ((Get-Content contents\manifest.json -Raw) | ConvertFrom-Json).version
$out = "plugin_v$ver.zip"

Write-Host "[4/4] 打包中..." -ForegroundColor Cyan
npx @kintone/plugin-packer contents --ppk $ppk.Name --out $out

if (Test-Path $out) {
    $size = (Get-Item $out).Length
    Write-Host ""
    Write-Host "=== 完成 ===" -ForegroundColor Cyan
    Write-Host "產物: $out ($size bytes)" -ForegroundColor Green
    Write-Host "下一步: kintone 後台 > 外掛管理 > 更新 > 上傳 $out" -ForegroundColor Yellow
} else {
    Write-Error "打包失敗，找不到 $out"
}

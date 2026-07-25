# Builds the store-submission zip for TabSetGo (Chrome Web Store / Edge Add-ons).
# Runtime files only - no repo/dev tooling. Uses only PowerShell built-ins.
param(
    [string]$Repo = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'

$manifest = Get-Content (Join-Path $Repo 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$name = $manifest.name

$dist = Join-Path $Repo 'dist'
$staging = Join-Path $dist 'staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force $staging | Out-Null

# Everything the extension references at runtime. welcome.html needs
# changes.txt (linked) and images/screenshots (intro slide previews).
$include = @(
    'manifest.json',
    'main.html',
    'options.html',
    'welcome.html',
    'changes.txt',
    'LICENSE',
    'css',
    'fonts',
    'images',
    'js'
)

foreach ($item in $include) {
    $src = Join-Path $Repo $item
    if (-not (Test-Path $src)) { throw "Missing expected file/dir: $item" }
    Copy-Item $src -Destination $staging -Recurse
}

# Source-only artifact inside an otherwise-runtime dir
Remove-Item (Join-Path $staging 'images/README.md') -Force -ErrorAction SilentlyContinue

$zip = Join-Path $dist ("{0}-v{1}.zip" -f $name, $version)
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip
Remove-Item $staging -Recurse -Force

$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Output "Packaged $zip ($size MB)"

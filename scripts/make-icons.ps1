# Rebuilds the TabSetGo icon set from scratch at 1024px and downscales to the
# sizes the extension ships. Requires ImageMagick ("magick") on the machine --
# dev-time asset tooling only, never a runtime dependency of the extension.
#
# Design: diagonal blue gradient (#58ABFF -> #2334C0, 135deg) in a rounded
# square (22.5% radius) with a soft top sheen and a subtle edge stroke; white
# rounded NE arrow with a faint vertical gradient and a soft drop shadow.
param(
    [string]$Repo = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
    throw "ImageMagick ('magick') is required to rebuild icons."
}

$work = Join-Path $Repo 'dist/iconbuild'
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force $work | Out-Null

# Background: gradient + sheen, masked to a rounded square, edged with a stroke
magick -size 1024x1024 -define gradient:angle=135 gradient:"#58ABFF-#2334C0" "$work/grad.png"
magick -size 1024x580 gradient:"rgba(255,255,255,0.22)-rgba(255,255,255,0)" -background none -gravity north -extent 1024x1024 "$work/sheen.png"
magick "$work/grad.png" "$work/sheen.png" -composite "$work/gradsheen.png"
magick -size 1024x1024 xc:black -fill white -draw "roundrectangle 32,32 992,992 230,230" "$work/mask.png"
magick "$work/gradsheen.png" "$work/mask.png" -alpha off -compose CopyOpacity -composite "$work/bg0.png"
magick "$work/bg0.png" -stroke "rgba(8,15,50,0.22)" -strokewidth 5 -fill none -draw "roundrectangle 36,36 988,988 226,226" "$work/bg.png"

# Glyph: rounded NE arrow (shaft + two head strokes), gradient fill, drop shadow
magick -size 1024x1024 xc:none `
    -draw "stroke #FFFFFF stroke-width 124 stroke-linecap round fill none line 302,718 646,376" `
    -draw "stroke #FFFFFF stroke-width 124 stroke-linecap round fill none line 444,286 732,286" `
    -draw "stroke #FFFFFF stroke-width 124 stroke-linecap round fill none line 732,286 732,574" `
    "$work/arrowmask.png"
magick -size 1024x1024 gradient:"#FFFFFF-#D8E4FC" "$work/arrowgrad.png"
magick "$work/arrowgrad.png" "$work/arrowmask.png" -alpha off -compose CopyOpacity -composite "$work/arrow.png"
magick "$work/arrowmask.png" -fill black -colorize 100 -channel A -evaluate multiply 0.35 +channel -blur 0x22 "$work/shadow.png"

magick "$work/bg.png" "$work/shadow.png" -geometry +0+26 -composite "$work/t1.png"
magick "$work/t1.png" "$work/arrow.png" -composite "$work/icon1024.png"

# Shipped sizes (small ones get a light unsharp to stay crisp)
magick "$work/icon1024.png" -resize 200x200 (Join-Path $Repo 'images/icon200.png')
magick "$work/icon1024.png" -resize 128x128 (Join-Path $Repo 'images/icon128.png')
magick "$work/icon1024.png" -resize 36x36 -unsharp 0x0.75+0.75+0.008 (Join-Path $Repo 'images/icon36.png')
magick "$work/icon1024.png" -resize 19x19 -unsharp 0x0.75+0.75+0.008 (Join-Path $Repo 'images/icon19.png')

# High-res master for store/marketing assets (not shipped in the zip)
New-Item -ItemType Directory -Force (Join-Path $Repo 'docs/store-assets') | Out-Null
magick "$work/icon1024.png" -resize 512x512 (Join-Path $Repo 'docs/store-assets/icon512.png')

Remove-Item $work -Recurse -Force
Write-Output "Icons rebuilt: images/icon{19,36,128,200}.png + docs/store-assets/icon512.png"

param(
  [string]$PngPath,
  [string]$OutLeft,
  [string]$OutRight,
  [double]$TopPct = 0.06,
  [double]$BottomPct = 0.06,
  [double]$GutterPct = 0.04,
  [double]$OuterPct = 0.12,
  [switch]$Tight
)
if ($Tight) {
  $TopPct = 0.08
  $BottomPct = 0.08
  $GutterPct = 0.05
  $OuterPct = 0.18
}
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($PngPath)
$w = $img.Width
$h = $img.Height
$top = [int]($h * $TopPct)
$bodyH = [int]($h * (1 - $TopPct - $BottomPct))
$half = [int]($w / 2)
$gutter = [int]($w * $GutterPct)
$outer = [int]($half * $OuterPct)

$leftX = $outer
$leftW = [Math]::Max(1, $half - $gutter - $outer)
$rightX = $half + $gutter
$rightW = [Math]::Max(1, $half - $gutter - $outer)

$left = New-Object System.Drawing.Bitmap $leftW, $bodyH
$right = New-Object System.Drawing.Bitmap $rightW, $bodyH
$gL = [System.Drawing.Graphics]::FromImage($left)
$gR = [System.Drawing.Graphics]::FromImage($right)
$srcL = New-Object System.Drawing.Rectangle $leftX, $top, $leftW, $bodyH
$srcR = New-Object System.Drawing.Rectangle $rightX, $top, $rightW, $bodyH
$gL.DrawImage($img, 0, 0, $srcL, [System.Drawing.GraphicsUnit]::Pixel)
$gR.DrawImage($img, 0, 0, $srcR, [System.Drawing.GraphicsUnit]::Pixel)
$left.Save($OutLeft, [System.Drawing.Imaging.ImageFormat]::Png)
$right.Save($OutRight, [System.Drawing.Imaging.ImageFormat]::Png)
$gL.Dispose(); $gR.Dispose(); $left.Dispose(); $right.Dispose(); $img.Dispose()

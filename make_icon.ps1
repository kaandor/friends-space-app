Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("public\Logo.png")
$square = New-Object System.Drawing.Bitmap(1024, 1024)
$g = [System.Drawing.Graphics]::FromImage($square)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$x = [int]((1024 - 1536) / 2) * -1
$x = [int]((1024 - 1024) / 2)
$srcW = 1024
$srcH = 1024
$srcX = [int]((1536 - 1024) / 2)
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, 1024, 1024)), (New-Object System.Drawing.Rectangle($srcX, 0, 1024, 1024)), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
function Save-PngBytes($bmp, $w, $h) {
  $b = New-Object System.Drawing.Bitmap($bmp, $w, $h)
  $ms = New-Object System.IO.MemoryStream
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose(); $b.Dispose()
  return $bytes
}
$sizes = @(16, 32, 48, 64, 128, 256)
$pngs = @{}
foreach ($s in $sizes) { $pngs[$s] = Save-PngBytes $square $s $s }
$fs = [System.IO.File]::Create("build\icon.ico")
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + (16 * $sizes.Count)
foreach ($s in $sizes) {
  $dim = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([Byte]$dim); $bw.Write([Byte]$dim)
  $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$pngs[$s].Length); $bw.Write([UInt32]$offset)
  $offset += $pngs[$s].Length
}
foreach ($s in $sizes) { $bw.Write($pngs[$s]) }
$bw.Flush(); $bw.Close(); $fs.Close()
$src.Dispose(); $square.Dispose()
"ICON GERADO: " + (Get-Item build\icon.ico).Length + " bytes"

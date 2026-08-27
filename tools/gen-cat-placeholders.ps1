# tools/gen-cat-placeholders.ps1
# 生成 6 张统一角色的卡通橘白猫咪占位 PNG（透明背景，240x240）

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\assets\cat'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$outDir = (Resolve-Path $outDir).Path

$colOrange   = [System.Drawing.Color]::FromArgb(255, 255, 181, 77)
$colOrangeD  = [System.Drawing.Color]::FromArgb(255, 230, 140, 40)
$colCream    = [System.Drawing.Color]::FromArgb(255, 255, 246, 236)
$colOutline  = [System.Drawing.Color]::FromArgb(255, 91, 58, 41)
$colBlack    = [System.Drawing.Color]::FromArgb(255, 58, 42, 29)
$colPink     = [System.Drawing.Color]::FromArgb(255, 255, 179, 199)
$colNose     = [System.Drawing.Color]::FromArgb(255, 240, 138, 138)
$colWhite    = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$colBlue     = [System.Drawing.Color]::FromArgb(255, 77, 158, 255)
$colBlueD    = [System.Drawing.Color]::FromArgb(255, 47, 107, 192)
$colGreen    = [System.Drawing.Color]::FromArgb(255, 102, 205, 170)
$colYellow   = [System.Drawing.Color]::FromArgb(255, 255, 209, 102)

function New-Pen($color, $width) {
  $p = New-Object System.Drawing.Pen($color, $width)
  $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $p
}

function New-Brush($color) { return New-Object System.Drawing.SolidBrush($color) }

function New-Point($x, $y) { return New-Object System.Drawing.Point($x, $y) }

function New-PointArray($pairs) {
  $arr = New-Object 'System.Drawing.Point[]' $pairs.Count
  for ($i = 0; $i -lt $pairs.Count; $i++) {
    $arr[$i] = New-Object System.Drawing.Point($pairs[$i][0], $pairs[$i][1])
  }
  return $arr
}

function Draw-Star($g, $brush, $cx, $cy, $r) {
  $pairs = @()
  for ($i = 0; $i -lt 10; $i++) {
    $ang = [Math]::PI / 5.0 * $i - [Math]::PI / 2.0
    $rad = if ($i % 2 -eq 0) { $r } else { $r * 0.45 }
    $x = $cx + $rad * [Math]::Cos($ang)
    $y = $cy + $rad * [Math]::Sin($ang)
    $pairs += ,@($x, $y)
  }
  $pts = New-PointArray $pairs
  $g.FillPolygon($brush, $pts)
}

function Draw-CatBase($g) {
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $pOutline = New-Pen $colOutline 3.0
  $bodyBrush = New-Brush $colOrange
  $bellyBrush = New-Brush $colCream
  $headBrush = New-Brush $colCream
  $capBrush = New-Brush $colOrange
  $eyeBrush = New-Brush $colBlack
  $whiteBrush = New-Brush $colWhite
  $pinkBrush = New-Brush $colPink
  $noseBrush = New-Brush $colNose

  # 身体
  $g.FillEllipse($bodyBrush, 70, 140, 100, 80)
  $g.DrawEllipse($pOutline, 70, 140, 100, 80)
  $g.FillEllipse($bellyBrush, 92, 166, 56, 48)

  # 耳朵
  $earL = New-PointArray @(@(72,72), @(64,34), @(104,56))
  $earR = New-PointArray @(@(168,72), @(176,34), @(136,56))
  $g.FillPolygon($bodyBrush, $earL); $g.DrawPolygon($pOutline, $earL)
  $g.FillPolygon($bodyBrush, $earR); $g.DrawPolygon($pOutline, $earR)
  $earInL = New-PointArray @(@(80,66), @(78,44), @(98,58))
  $earInR = New-PointArray @(@(160,66), @(162,44), @(142,58))
  $g.FillPolygon($pinkBrush, $earInL)
  $g.FillPolygon($pinkBrush, $earInR)

  # 头
  $g.FillEllipse($headBrush, 58, 50, 124, 104)
  $g.DrawEllipse($pOutline, 58, 50, 124, 104)
  $g.FillEllipse($capBrush, 86, 52, 68, 44)

  # 眼睛
  $g.FillEllipse($eyeBrush, 92, 96, 18, 24)
  $g.FillEllipse($eyeBrush, 130, 96, 18, 24)
  $g.FillEllipse($whiteBrush, 100, 100, 7, 9)
  $g.FillEllipse($whiteBrush, 138, 100, 7, 9)

  # 腮红
  $g.FillEllipse($pinkBrush, 78, 118, 22, 13)
  $g.FillEllipse($pinkBrush, 140, 118, 22, 13)

  # 鼻子
  $g.FillEllipse($noseBrush, 112, 122, 16, 11)

  # 嘴
  $g.DrawArc($pOutline, 104, 124, 14, 14, 20, 140)
  $g.DrawArc($pOutline, 122, 124, 14, 14, 20, 140)

  $pOutline.Dispose(); $bodyBrush.Dispose(); $bellyBrush.Dispose()
  $headBrush.Dispose(); $capBrush.Dispose(); $eyeBrush.Dispose()
  $whiteBrush.Dispose(); $pinkBrush.Dispose(); $noseBrush.Dispose()
}

function Draw-Pose($g, $pose) {
  $p = New-Pen $colOutline 3.0
  $p2 = New-Pen $colOrangeD 2.5
  $pawBrush = New-Brush $colCream

  switch ($pose) {
    'home' {
      $g.FillEllipse($pawBrush, 150, 120, 28, 22)
      $g.DrawEllipse($p, 150, 120, 28, 22)
      $g.DrawArc($p2, 176, 100, 24, 40, 300, 110)
    }
    'workout' {
      $bandBrush = New-Brush $colBlue
      $dbBrush = New-Brush $colBlueD
      # 头带
      $g.FillRectangle($bandBrush, 60, 76, 120, 12)
      $pThin = New-Pen $colOutline 2.5
      $g.DrawRectangle($pThin, 60, 76, 120, 12)
      $g.FillEllipse($bandBrush, 176, 72, 14, 20)
      $g.DrawEllipse($pThin, 176, 72, 14, 20)
      # 左爪 + 哑铃
      $g.FillEllipse($pawBrush, 56, 168, 26, 20)
      $g.DrawEllipse($p, 56, 168, 26, 20)
      $g.FillRectangle($dbBrush, 24, 172, 30, 12)
      $g.DrawRectangle($p, 24, 172, 30, 12)
      $g.FillRectangle($dbBrush, 18, 166, 10, 24)
      $g.DrawRectangle($p, 18, 166, 10, 24)
      $g.FillRectangle($dbBrush, 50, 166, 10, 24)
      $g.DrawRectangle($p, 50, 166, 10, 24)
      # 右爪 + 哑铃
      $g.FillEllipse($pawBrush, 158, 168, 26, 20)
      $g.DrawEllipse($p, 158, 168, 26, 20)
      $g.FillRectangle($dbBrush, 186, 172, 30, 12)
      $g.DrawRectangle($p, 186, 172, 30, 12)
      $g.FillRectangle($dbBrush, 180, 166, 10, 24)
      $g.DrawRectangle($p, 180, 166, 10, 24)
      $g.FillRectangle($dbBrush, 212, 166, 10, 24)
      $g.DrawRectangle($p, 212, 166, 10, 24)
      $pThin.Dispose(); $bandBrush.Dispose(); $dbBrush.Dispose()
    }
    'water' {
      $cupBrush = New-Brush $colBlue
      $whiteBrush = New-Brush $colWhite
      $waterBrush = New-Brush $colGreen
      $g.FillRectangle($cupBrush, 100, 188, 40, 40)
      $g.DrawRectangle($p, 100, 188, 40, 40)
      $g.FillRectangle($whiteBrush, 96, 184, 48, 8)
      $g.DrawRectangle($p, 96, 184, 48, 8)
      $g.FillRectangle($waterBrush, 104, 210, 32, 16)
      $g.FillEllipse($pawBrush, 84, 196, 22, 18)
      $g.DrawEllipse($p, 84, 196, 22, 18)
      $g.FillEllipse($pawBrush, 134, 196, 22, 18)
      $g.DrawEllipse($p, 134, 196, 22, 18)
      $cupBrush.Dispose(); $whiteBrush.Dispose(); $waterBrush.Dispose()
    }
    'success' {
      $g.FillEllipse($pawBrush, 60, 120, 26, 22)
      $g.DrawEllipse($p, 60, 120, 26, 22)
      $g.FillEllipse($pawBrush, 154, 120, 26, 22)
      $g.DrawEllipse($p, 154, 120, 26, 22)
      $starBrush = New-Brush $colYellow
      Draw-Star $g $starBrush 40 60 12
      Draw-Star $g $starBrush 200 70 10
      Draw-Star $g $starBrush 120 36 14
      $starBrush.Dispose()
    }
    'ai' {
      $bandBrush = New-Brush $colBlue
      $bookBrush = New-Brush $colWhite
      $pThin = New-Pen $colOutline 2.5
      $linePen = New-Pen $colOutline 1.5
      $g.FillRectangle($bandBrush, 60, 76, 120, 12)
      $g.DrawRectangle($pThin, 60, 76, 120, 12)
      $g.FillEllipse($bandBrush, 176, 72, 14, 20)
      $g.DrawEllipse($pThin, 176, 72, 14, 20)
      $g.FillRectangle($bookBrush, 150, 176, 36, 30)
      $g.DrawRectangle($p, 150, 176, 36, 30)
      $g.DrawLine($linePen, 156, 186, 180, 186)
      $g.DrawLine($linePen, 156, 194, 174, 194)
      $g.FillEllipse($pawBrush, 64, 180, 24, 18)
      $g.DrawEllipse($p, 64, 180, 24, 18)
      $pThin.Dispose(); $linePen.Dispose(); $bandBrush.Dispose(); $bookBrush.Dispose()
    }
    'empty' {
      $g.DrawArc($p, 92, 100, 18, 14, 200, 140)
      $g.DrawArc($p, 130, 100, 18, 14, 200, 140)
      $font = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)
      $brush = New-Brush $colBlueD
      $g.DrawString('z', $font, $brush, 184, 56)
      $g.DrawString('Z', $font, $brush, 198, 40)
      $font.Dispose(); $brush.Dispose()
    }
  }

  $p.Dispose(); $p2.Dispose(); $pawBrush.Dispose()
}

$poses = @('home','workout','water','success','ai','empty')
foreach ($pose in $poses) {
  $bmp = New-Object System.Drawing.Bitmap 240, 240
  $bmp.SetResolution(96, 96)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  Draw-CatBase $g
  Draw-Pose $g $pose
  $path = Join-Path $outDir "cat-$pose.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "generated: $path"
}
Write-Output "DONE: $($poses.Count) cat placeholders in $outDir"

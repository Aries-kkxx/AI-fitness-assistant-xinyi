# tools/gen-cat-v2.ps1
# 重新生成统一卡通猫咪占位图 v2
# 严格匹配参考图：橘白猫、红头带、蓝色运动背心、站立拟人化(chibi比例)
# 同时生成 5 组 TabBar 卡通图标（灰色未选中 + 绿色选中）

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$catDir = Join-Path $root 'assets\cat'
$tabDir = Join-Path $root 'assets\tabbar'
foreach ($d in @($catDir, $tabDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# ============ 颜色 ============
$C = @{
  Orange     = [System.Drawing.Color]::FromArgb(255, 255, 181, 77)
  OrangeDk   = [System.Drawing.Color]::FromArgb(255, 230, 140, 40)
  Cream      = [System.Drawing.Color]::FromArgb(255, 255, 246, 236)
  Outline    = [System.Drawing.Color]::FromArgb(255, 74, 45, 30)
  Black      = [System.Drawing.Color]::FromArgb(255, 45, 32, 22)
  Pink       = [System.Drawing.Color]::FromArgb(255, 255, 170, 190)
  Nose       = [System.Drawing.Color]::FromArgb(255, 240, 130, 130)
  White      = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
  Blue       = [System.Drawing.Color]::FromArgb(255, 77, 158, 255)
  BlueDk     = [System.Drawing.Color]::FromArgb(255, 47, 107, 192)
  BlueLt     = [System.Drawing.Color]::FromArgb(255, 130, 190, 255)
  Red        = [System.Drawing.Color]::FromArgb(255, 255, 107, 107)
  RedDk      = [System.Drawing.Color]::FromArgb(255, 220, 70, 70)
  Green      = [System.Drawing.Color]::FromArgb(255, 102, 205, 170)
  GreenDk    = [System.Drawing.Color]::FromArgb(255, 63, 174, 133)
  Yellow     = [System.Drawing.Color]::FromArgb(255, 255, 209, 102)
  Gray       = [System.Drawing.Color]::FromArgb(255, 170, 170, 170)
}

# ============ 辅助函数 ============
function New-PenC($color, $width) {
  $p = New-Object System.Drawing.Pen($color, $width)
  $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $p
}
function New-BrushC($color) { return New-Object System.Drawing.SolidBrush($color) }

function Fill-Ellipse($g, $brush, $x, $y, $w, $h) { $g.FillEllipse($brush, $x, $y, $w, $h) }
function Draw-Ellipse($g, $pen, $x, $y, $w, $h) { $g.DrawEllipse($pen, $x, $y, $w, $h) }
function Fill-Rect($g, $brush, $x, $y, $w, $h) { $g.FillRectangle($brush, $x, $y, $w, $h) }
function Draw-Rect($g, $pen, $x, $y, $w, $h) { $g.DrawRectangle($pen, $x, $y, $w, $h) }
function Fill-RoundRect($g, $brush, $x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $g.FillPath($brush, $p)
  $p.Dispose()
}
function Draw-RoundRect($g, $pen, $x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $g.DrawPath($pen, $p)
  $p.Dispose()
}
function Fill-Poly($g, $brush, $pts) {
  $arr = New-Object 'System.Drawing.PointF[]' $pts.Count
  for ($i = 0; $i -lt $pts.Count; $i++) { $arr[$i] = $pts[$i] }
  $g.FillPolygon($brush, $arr)
}
function Draw-Poly($g, $pen, $pts) {
  $arr = New-Object 'System.Drawing.PointF[]' $pts.Count
  for ($i = 0; $i -lt $pts.Count; $i++) { $arr[$i] = $pts[$i] }
  $g.DrawPolygon($pen, $arr)
}
function Pt($x, $y) {
  $px = [single]($x -as [double])
  $py = [single]($y -as [double])
  return New-Object System.Drawing.PointF -ArgumentList $px, $py
}

function Draw-Star($g, $brush, $cx, $cy, $r) {
  $pairs = @()
  for ($i = 0; $i -lt 10; $i++) {
    $ang = [Math]::PI / 5.0 * $i - [Math]::PI / 2.0
    if ($i % 2 -eq 0) { $rad = $r } else { $rad = $r * 0.45 }
    $sx = $cx + $rad * [Math]::Cos($ang)
    $sy = $cy + $rad * [Math]::Sin($ang)
    $pairs += ,@($sx, $sy)
  }
  $pts = New-Object 'System.Drawing.PointF[]' 10
  for ($i = 0; $i -lt 10; $i++) {
    $pts[$i] = Pt $pairs[$i][0] $pairs[$i][1]
  }
  $g.FillPolygon($brush, $pts)
}

# ============ 画猫咪（统一角色） ============
# 画布 300x300
# 坐标：头中心(150,115) r=68；身体蓝衣 y=175~265
function Draw-Cat($g, $pose) {
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $pO = New-PenC $C.Outline 3.5
  $pO2 = New-PenC $C.Outline 2.5
  $bOrange = New-BrushC $C.Orange
  $bCream = New-BrushC $C.Cream
  $bBlue = New-BrushC $C.Blue
  $bBlueLt = New-BrushC $C.BlueLt
  $bBlueDk = New-BrushC $C.BlueDk
  $bRed = New-BrushC $C.Red
  $bBlack = New-BrushC $C.Black
  $bWhite = New-BrushC $C.White
  $bPink = New-BrushC $C.Pink
  $bNose = New-BrushC $C.Nose
  $bYellow = New-BrushC $C.Yellow
  $bGreen = New-BrushC $C.Green

  # ===== 腿和脚（先画，在身体后面）=====
  # 左脚
  Fill-Ellipse $g $bCream 108 258 32 32
  Draw-Ellipse $g $pO 108 258 32 32
  # 右脚
  Fill-Ellipse $g $bCream 160 258 32 32
  Draw-Ellipse $g $pO 160 258 32 32

  # ===== 身体/蓝色背心 =====
  # 背心主体（梯形圆角）
  $bodyPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bodyPath.AddArc(96, 172, 24, 24, 180, 90)
  $bodyPath.AddArc(180, 172, 24, 24, 270, 90)
  $bodyPath.AddLine(204, 196, 196, 268)
  $bodyPath.AddArc(168, 258, 32, 24, 0, 180)
  $bodyPath.AddArc(100, 258, 32, 24, 0, 180)
  $bodyPath.AddLine(96, 268, 96, 196)
  $bodyPath.CloseFigure()
  $g.FillPath($bBlue, $bodyPath)
  $g.DrawPath($pO, $bodyPath)
  $bodyPath.Dispose()

  # 背心领口（弧形露出胸口奶油色）
  $g.FillEllipse($bCream, 128, 172, 44, 30)
  $g.DrawArc($pO2, 128, 172, 44, 30, 20, 140)

  # 背心浅色高光
  $g.FillEllipse($bBlueLt, 106, 196, 12, 50)

  # ===== 手臂（根据姿态）=====
  switch ($pose) {
    'home' {
      # 左手自然下垂
      Fill-Ellipse $g $bCream 88 210 26 40
      Draw-Ellipse $g $pO 88 210 26 40
      # 右手举起挥动
      Fill-Ellipse $g $bCream 190 168 28 24
      Draw-Ellipse $g $pO 190 168 28 24
      # 挥动弧线
      $pWave = New-PenC $C.OrangeDk 2.5
      $g.DrawArc($pWave, 214, 150, 22, 40, 310, 100)
      $pWave.Dispose()
    }
    'workout' {
      # 左手握哑铃（弯曲）
      Fill-Ellipse $g $bCream 72 210 26 22
      Draw-Ellipse $g $pO 72 210 26 22
      # 右手握哑铃
      Fill-Ellipse $g $bCream 202 210 26 22
      Draw-Ellipse $g $pO 202 210 26 22
    }
    'water' {
      # 双手抱杯在身前
      Fill-Ellipse $g $bCream 104 220 24 20
      Draw-Ellipse $g $pO 104 220 24 20
      Fill-Ellipse $g $bCream 172 220 24 20
      Draw-Ellipse $g $pO 172 220 24 20
    }
    'success' {
      # 双手举起
      Fill-Ellipse $g $bCream 76 158 26 30
      Draw-Ellipse $g $pO 76 158 26 30
      Fill-Ellipse $g $bCream 198 158 26 30
      Draw-Ellipse $g $pO 198 158 26 30
    }
    'ai' {
      # 左手自然下垂
      Fill-Ellipse $g $bCream 84 210 26 40
      Draw-Ellipse $g $pO 84 210 26 40
      # 右手拿本子
      Fill-Ellipse $g $bCream 196 218 24 20
      Draw-Ellipse $g $pO 196 218 24 20
    }
    'empty' {
      # 双手放身前（睡觉）
      Fill-Ellipse $g $bCream 110 240 26 20
      Draw-Ellipse $g $pO 110 240 26 20
      Fill-Ellipse $g $bCream 164 240 26 20
      Draw-Ellipse $g $pO 164 240 26 20
    }
  }

  # ===== 头部 =====
  # 耳朵（在头后面）
  $earL = @((Pt 86 92), (Pt 76 40), (Pt 118 68))
  $earR = @((Pt 214 92), (Pt 224 40), (Pt 182 68))
  Fill-Poly $g $bOrange $earL
  Draw-Poly $g $pO $earL
  Fill-Poly $g $bOrange $earR
  Draw-Poly $g $pO $earR
  # 内耳粉
  $earInL = @((Pt 96 82), (Pt 92 54), (Pt 112 70))
  $earInR = @((Pt 204 82), (Pt 208 54), (Pt 188 70))
  Fill-Poly $g $bPink $earInL
  Fill-Poly $g $bPink $earInR

  # 头（奶油色圆脸）
  Fill-Ellipse $g $bCream 82 50 136 120
  Draw-Ellipse $g $pO 82 50 136 120

  # 头顶橘色帽斑
  $g.FillEllipse($bOrange, 104, 52, 92, 52)

  # ===== 红头带（在头顶斑上面）=====
  # 头带主体
  Fill-RoundRect $g $bRed 82 84 136 18 9
  # 头带结（右侧）
  Fill-Ellipse $g $bRed 212 80 18 26
  Draw-Ellipse $g $pO2 212 80 18 26
  # 头带描边
  $g.DrawLine($pO2, 84, 84, 216, 84)
  $g.DrawLine($pO2, 84, 102, 216, 102)

  # ===== 脸部特征 =====
  # 眼睛（黑色椭圆 + 白色高光）——直接用 .NET 调用，确保两只眼睛都渲染
  $g.FillEllipse($bBlack, 114, 116, 22, 28)
  $g.FillEllipse($bBlack, 164, 116, 22, 28)
  $g.FillEllipse($bWhite, 119, 121, 7, 9)
  $g.FillEllipse($bWhite, 169, 121, 7, 9)

  # 腮红
  Fill-Ellipse $g $bPink 96 142 24 14
  Fill-Ellipse $g $bPink 180 142 24 14

  # 鼻子
  Fill-Ellipse $g $bNose 142 142 16 11

  # 嘴巴（微笑）
  $g.DrawArc($pO2, 132, 146, 16, 14, 20, 140)
  $g.DrawArc($pO2, 152, 146, 16, 14, 20, 140)

  # ===== 姿态专属道具 =====
  switch ($pose) {
    'workout' {
      # 左哑铃
      $g.FillRectangle($bBlueLt, 30, 214, 44, 14)
      Draw-Rect $g $pO 30 214 44 14
      Fill-Rect $g $bBlueDk 22 206 12 30
      Draw-Rect $g $pO 22 206 12 30
      Fill-Rect $g $bBlueDk 70 206 12 30
      Draw-Rect $g $pO 70 206 12 30
      # 右哑铃
      $g.FillRectangle($bBlueLt, 226, 214, 44, 14)
      Draw-Rect $g $pO 226 214 44 14
      Fill-Rect $g $bBlueDk 218 206 12 30
      Draw-Rect $g $pO 218 206 12 30
      Fill-Rect $g $bBlueDk 266 206 12 30
      Draw-Rect $g $pO 266 206 12 30
    }
    'water' {
      # 蓝色水杯（居中身前）
      Fill-RoundRect $g $bBlue 124 210 52 56 6
      Draw-RoundRect $g $pO 124 210 52 56 6
      # 杯口（白色）
      Fill-Rect $g $bWhite 120 206 60 8
      Draw-Rect $g $pO2 120 206 60 8
      # 水（绿色）
      Fill-Rect $g $bGreen 130 244 40 20
    }
    'success' {
      # 三颗星星
      Draw-Star $g $bYellow 52 68 14
      Draw-Star $g $bYellow 250 78 12
      Draw-Star $g $bYellow 150 32 16
    }
    'ai' {
      # 小本子（白色）
      Fill-RoundRect $g $bWhite 204 200 38 44 4
      Draw-RoundRect $g $pO2 204 200 38 44 4
      # 本子上的线（复用 $pO2 细描边）
      $g.DrawLine($pO2, 212, 214, 236, 214)
      $g.DrawLine($pO2, 212, 224, 232, 224)
      $g.DrawLine($pO2, 212, 234, 236, 234)
    }
    'empty' {
      # 闭眼（弧线）
      $g.DrawArc($pO2, 114, 122, 18, 12, 200, 140)
      $g.DrawArc($pO2, 168, 122, 18, 12, 200, 140)
      # Zzz
      $font = New-Object System.Drawing.Font('Arial', 16, [System.Drawing.FontStyle]::Bold)
      $bBlue2 = New-BrushC $C.BlueDk
      $g.DrawString('z', $font, $bBlue2, 222, 56)
      $g.DrawString('Z', $font, $bBlue2, 240, 36)
      $font.Dispose(); $bBlue2.Dispose()
    }
  }

  # 释放画笔
  $pO.Dispose(); $pO2.Dispose()
  $bOrange.Dispose(); $bCream.Dispose(); $bBlue.Dispose(); $bBlueLt.Dispose()
  $bBlueDk.Dispose()
  $bRed.Dispose(); $bBlack.Dispose(); $bWhite.Dispose(); $bPink.Dispose()
  $bNose.Dispose(); $bYellow.Dispose(); $bGreen.Dispose()
}

# ============ 生成 6 只猫咪 ============
$poses = @('home','workout','water','success','ai','empty')
foreach ($pose in $poses) {
  $bmp = New-Object System.Drawing.Bitmap 300, 300
  $bmp.SetResolution(96, 96)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  Draw-Cat $g $pose
  $path = Join-Path $catDir "cat-$pose.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "cat: $path"
}

# ============ TabBar 图标（直接用 .NET，不用辅助函数）============
function Make-IconBitmap($kind, $color) {
  $bmp = New-Object System.Drawing.Bitmap 81, 81, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.SolidBrush($color)
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

  switch ($kind) {
    'home' {
      # 屋顶三角
      $roof = New-Object 'System.Drawing.PointF[]' 3
      $roof[0] = New-Object System.Drawing.PointF(16, 40)
      $roof[1] = New-Object System.Drawing.PointF(40, 16)
      $roof[2] = New-Object System.Drawing.PointF(64, 40)
      $g.FillPolygon($brush, $roof)
      # 房身
      $g.FillRectangle($brush, 22, 38, 36, 30)
      # 门（白）
      $g.FillRectangle($white, 35, 48, 10, 20)
    }
    'dumbbell' {
      $g.FillRectangle($brush, 8, 28, 8, 24)
      $g.FillRectangle($brush, 16, 32, 48, 16)
      $g.FillRectangle($brush, 64, 28, 8, 24)
    }
    'sneaker' {
      $g.FillRectangle($brush, 10, 52, 60, 10)
      $shoe = New-Object System.Drawing.Drawing2D.GraphicsPath
      $shoe.AddArc(10, 28, 22, 24, 180, 90)
      $shoe.AddLine(32, 28, 60, 36)
      $shoe.AddLine(72, 48, 72, 52)
      $shoe.AddLine(10, 52, 10, 40)
      $shoe.CloseFigure()
      $g.FillPath($brush, $shoe)
      $g.FillEllipse($white, 38, 38, 4, 4)
      $g.FillEllipse($white, 46, 38, 4, 4)
      $shoe.Dispose()
    }
    'drop' {
      $drop = New-Object System.Drawing.Drawing2D.GraphicsPath
      $drop.AddBezier(40, 12, 28, 34, 18, 48, 18, 54)
      $drop.AddArc(18, 44, 44, 24, 180, 180)
      $drop.AddBezier(62, 54, 62, 42, 52, 30, 40, 12)
      $drop.CloseFigure()
      $g.FillPath($brush, $drop)
      $hl = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
      $g.FillEllipse($hl, 30, 42, 8, 12)
      $hl.Dispose()
      $drop.Dispose()
    }
    'cat' {
      $earL = New-Object 'System.Drawing.PointF[]' 3
      $earL[0] = New-Object System.Drawing.PointF(16, 30)
      $earL[1] = New-Object System.Drawing.PointF(22, 12)
      $earL[2] = New-Object System.Drawing.PointF(36, 26)
      $earR = New-Object 'System.Drawing.PointF[]' 3
      $earR[0] = New-Object System.Drawing.PointF(64, 30)
      $earR[1] = New-Object System.Drawing.PointF(58, 12)
      $earR[2] = New-Object System.Drawing.PointF(44, 26)
      $g.FillPolygon($brush, $earL)
      $g.FillPolygon($brush, $earR)
      $g.FillEllipse($brush, 14, 20, 52, 44)
      $g.FillEllipse($white, 28, 38, 6, 8)
      $g.FillEllipse($white, 46, 38, 6, 8)
    }
  }
  $brush.Dispose()
  $white.Dispose()
  $g.Dispose()
  return $bmp
}

$tabIcons = @('home','dumbbell','sneaker','drop','cat')
foreach ($name in $tabIcons) {
  $bmpGray = Make-IconBitmap $name $C.Gray
  $bmpGray.Save((Join-Path $tabDir "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmpGray.Dispose()
  $bmpGreen = Make-IconBitmap $name $C.Green
  $bmpGreen.Save((Join-Path $tabDir "$name-active.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmpGreen.Dispose()
  Write-Output "tab: $name (gray+green)"
}

Write-Output "DONE v2"

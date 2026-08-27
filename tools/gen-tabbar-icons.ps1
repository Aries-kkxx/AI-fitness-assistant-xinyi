# tools/gen-tabbar-icons.ps1 - 生成底部 Tab 卡通线性图标（81x81 PNG）
# 用法: pwsh tools/gen-tabbar-icons.ps1
# 输出: assets/tabbar/*.png (10 张：5 图标 x 灰/绿两态)
Add-Type -AssemblyName System.Drawing

$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets\tabbar'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function New-Canvas {
  $bmp = New-Object System.Drawing.Bitmap 81, 81
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  return @($bmp, $g)
}

function New-Pen([string]$color, [int]$width) {
  $p = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($color)), $width
  $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $p
}

function New-RoundedRect([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Save-Icon($bmp, [string]$name) {
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function P3([int]$x1, [int]$y1, [int]$x2, [int]$y2, [int]$x3, [int]$y3) {
  $a = @()
  $a += New-Object System.Drawing.Point $x1, $y1
  $a += New-Object System.Drawing.Point $x2, $y2
  $a += New-Object System.Drawing.Point $x3, $y3
  return [System.Drawing.Point[]]$a
}

$colors = @(@('#999999', ''), @('#66CDAA', '-active'))

foreach ($c in $colors) {
  $hex = $c[0]; $suf = $c[1]

  # ---------- 首页: 房子 ----------
  $cv = New-Canvas; $bmp = $cv[0]; $g = $cv[1]
  $pen = New-Pen $hex 7
  $g.DrawLines($pen, (P3 16 42 40 16 64 42))                                  # 屋顶
  $g.DrawPath($pen, (New-RoundedRect 20 40 40 26 6))                          # 主体
  $g.DrawPath($pen, (New-RoundedRect 34 50 12 16 4))                          # 门
  Save-Icon $bmp ("home$suf.png")

  # ---------- 训练: 哑铃 ----------
  $cv = New-Canvas; $bmp = $cv[0]; $g = $cv[1]
  $pen = New-Pen $hex 7
  $g.DrawLine($pen, 16, 40, 65, 40)                                           # 杆
  $g.DrawPath($pen, (New-RoundedRect 11 27 13 26 4))                          # 左片
  $g.DrawPath($pen, (New-RoundedRect 26 31 6 18 3))                           # 左小片
  $g.DrawPath($pen, (New-RoundedRect 57 27 13 26 4))                          # 右片
  $g.DrawPath($pen, (New-RoundedRect 49 31 6 18 3))                           # 右小片
  Save-Icon $bmp ("dumbbell$suf.png")

  # ---------- 动作: 跑鞋 ----------
  $cv = New-Canvas; $bmp = $cv[0]; $g = $cv[1]
  $pen = New-Pen $hex 8
  $g.DrawLine($pen, 14, 58, 62, 58)                                           # 鞋底
  $g.DrawArc($pen, 48, 40, 20, 18, 270, 90)                                   # 鞋头
  $g.DrawLine($pen, 68, 49, 34, 44)                                           # 鞋面
  $g.DrawLine($pen, 34, 44, 26, 58)                                           # 鞋帮
  Save-Icon $bmp ("sneaker$suf.png")

  # ---------- 饮水: 水滴 ----------
  $cv = New-Canvas; $bmp = $cv[0]; $g = $cv[1]
  $pen = New-Pen $hex 7
  $drop = New-Object System.Drawing.Drawing2D.GraphicsPath
  $drop.StartFigure()
  $drop.AddBezier(40, 10, 56, 26, 66, 40, 66, 46)                             # 右侧
  $drop.AddArc(26, 32, 40, 28, 0, 180)                                        # 底部半圆
  $drop.AddBezier(26, 46, 26, 40, 24, 26, 40, 10)                             # 左侧
  $drop.CloseFigure()
  $g.DrawPath($pen, $drop)
  Save-Icon $bmp ("drop$suf.png")

  # ---------- 我的: 猫咪脸 ----------
  $cv = New-Canvas; $bmp = $cv[0]; $g = $cv[1]
  $pen = New-Pen $hex 6
  $g.DrawEllipse($pen, 22, 26, 38, 34)                                        # 圆脸
  $g.DrawPolygon($pen, (P3 26 34 30 12 40 25))                                # 左耳
  $g.DrawPolygon($pen, (P3 56 34 52 12 42 25))                                # 右耳
  $g.DrawEllipse($pen, 30, 39, 6, 6)                                          # 左眼
  $g.DrawEllipse($pen, 45, 39, 6, 6)                                          # 右眼
  $pen2 = New-Pen $hex 4
  $g.DrawLines($pen2, (P3 38 49 41 52 44 49))                                 # 小嘴
  Save-Icon $bmp ("cat$suf.png")
}

Get-ChildItem $out -Filter *.png | Select-Object Name, Length
Write-Host "DONE: $((Get-ChildItem $out -Filter *.png).Count) icons"

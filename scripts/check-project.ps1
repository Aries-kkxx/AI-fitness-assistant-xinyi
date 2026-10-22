# scripts/check-project.ps1 - 小程序静态校验（JSON/WXML/WXSS/资源路径）
# 用法: pwsh scripts/check-project.ps1
$root = Split-Path $PSScriptRoot -Parent
$miniRoot = Join-Path $root 'miniprogram'
$errors = @()
$warnings = @()

Write-Host "=== 1. JSON 校验 ==="
Get-ChildItem $root -Recurse -Filter *.json -File | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | ForEach-Object {
  $file = $_
  try {
    $null = Get-Content $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json -AsHashtable
    Write-Host "  OK  $($file.FullName.Substring($root.Length + 1))"
  } catch {
    $errors += "JSON 解析失败: $($file.FullName) -> $($_.Exception.Message)"
    Write-Host "  ERR $($file.FullName.Substring($root.Length + 1)) : $($_.Exception.Message)"
  }
}

Write-Host "=== 2. WXSS 花括号配对 ==="
Get-ChildItem $root -Recurse -Filter *.wxss | ForEach-Object {
  $c = Get-Content $_.FullName -Raw -Encoding UTF8
  $open = ([regex]::Matches($c, '\{')).Count
  $close = ([regex]::Matches($c, '\}')).Count
  if ($open -ne $close) {
    $errors += "WXSS 花括号不配对: $($_.Name) open=$open close=$close"
    Write-Host "  ERR $($_.Name) : {=$open }=$close"
  } else {
    Write-Host "  OK  $($_.Name) ({$open})"
  }
}

Write-Host "=== 3. WXML 标签配对 ==="
$voidTags = @('input', 'image', 'icon', 'progress', 'slider')
Get-ChildItem $root -Recurse -Filter *.wxml | ForEach-Object {
  $c = Get-Content $_.FullName -Raw -Encoding UTF8
  $matches = [regex]::Matches($c, '<\s*(/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|''[^'']*''|[^>""''])*?)(/?)>')
  $stack = New-Object System.Collections.Generic.Stack[string]
  $problems = @()
  foreach ($m in $matches) {
    $close = $m.Groups[1].Value
    $name = $m.Groups[2].Value.ToLower()
    $selfClose = $m.Groups[4].Value -eq '/'
    $isVoid = $voidTags -contains $name
    if ($close -eq '/') {
      if ($stack.Count -eq 0 -or $stack.Peek() -ne $name) {
        $problems += "多余闭合标签 </$name> (栈顶: $(if($stack.Count){$stack.Peek()}else{'空'}))"
      } else {
        [void]$stack.Pop()
      }
    } elseif ($selfClose -or $isVoid) {
      # 自闭合或 void 标签
      if (-not $selfClose -and $isVoid) {
        # void 标签显式闭合 </input> 也会作为闭合处理；这里 void 非自闭合不压栈
      }
    } else {
      $stack.Push($name)
    }
  }
  if ($stack.Count -gt 0) {
    $problems += "未闭合标签: $($stack -join ', ')"
  }
  if ($problems.Count -gt 0) {
    $errors += "WXML 问题: $($_.Name) -> $($problems -join '; ')"
    Write-Host "  ERR $($_.Name) : $($problems -join '; ')"
  } else {
    Write-Host "  OK  $($_.Name)"
  }
}

Write-Host "=== 4. app.json 资源引用校验 ==="
try {
  $app = Get-Content "$miniRoot\app.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  # tabBar 图标
  foreach ($t in $app.tabBar.list) {
    foreach ($key in @('iconPath', 'selectedIconPath')) {
      $p = Join-Path $miniRoot $t.$key
      if (-not (Test-Path $p)) { $errors += "tabBar 图标缺失: $($t.$key)" }
    }
  }
  # 页面文件存在
  foreach ($page in $app.pages) {
    foreach ($ext in @('js', 'json', 'wxml', 'wxss')) {
      $p = Join-Path $miniRoot "$page.$ext"
      if (-not (Test-Path $p)) { $errors += "页面文件缺失: $page.$ext" }
    }
  }
  # usingComponents（微信规则：路径末段为组件名，前段为目录）
  foreach ($name in $app.usingComponents.PSObject.Properties.Name) {
    $path = $app.usingComponents.$name
    $rel = $path.TrimStart('/')
    $dir = Split-Path $rel -Parent
    $comp = Split-Path $rel -Leaf
    foreach ($ext in @('js', 'json', 'wxml', 'wxss')) {
      $p = Join-Path $miniRoot "$dir\$comp.$ext"
      if (-not (Test-Path $p)) { $errors += "全局组件文件缺失: $path.$ext" }
    }
  }
  Write-Host "  tabBar 图标 / 页面文件 / 全局组件 校验完成"
} catch {
  $errors += "app.json 校验异常: $($_.Exception.Message)"
}

Write-Host ""
if ($errors.Count -eq 0) {
  Write-Host "RESULT: PASS (0 errors, $($warnings.Count) warnings)"
} else {
  Write-Host "RESULT: FAIL ($($errors.Count) errors)"
  $errors | ForEach-Object { Write-Host "  - $_" }
}

# 健身小程序视觉设计语言（Cat Athlete Design System）

本文是全项目卡通素材与 UI 视觉的统一基准。所有新页面、图标、插画、弹窗、空态、装饰元素都必须先对照本文，再考虑逐页差异。

## 1. 风格定位

- 关键词：Cartoon / Comic / Cute / Sporty / Fresh / Energetic / Friendly。
- 画面使用 Q 版卡通漫画插画，圆润、明亮、年轻、健康。
- 保留手绘漫画感，但不追求写实笔触、照片质感或复杂纹理。
- UI 适合移动端小尺寸展示：主体突出、轮廓清楚、卡片干净、留白充足。
- 不使用写实照片风格、3D Pixar 风格、日系动漫风格、欧美超级英雄风格。

## 2. 角色基准

主角色是一只橘白色 Q 版卡通猫咪运动员，视觉基因如下：

- 毛发：橘色 + 白色，橘色常出现在头顶、耳朵、背部或尾巴。
- 头身比：大头小身，面部圆润可爱。
- 眼睛：大而有神，黑色或深棕色，带白色高光；可有闭眼微笑、眨眼、专注等漫画表情。
- 细节：小巧鼻子和嘴，粉色腮红，耳朵内有粉色。
- 服装：蓝色运动背心/白色运动服，可搭配深蓝短裤、运动鞋、橙色或红色头带。
- 气质：活泼、友善、充满运动感；表情不要凶狠、高冷或成人化。

角色姿态优先复用 `miniprogram/assets/cat/` 中的素材：

| 姿态 | 文件 |
| --- | --- |
| 首页/运动跳跃 | `cat-home.png` |
| 举哑铃 | `cat-workout.png` |
| 喝水 | `cat-water.png` |
| 达成/奖杯 | `cat-success.png` |
| 教练/记录 | `cat-calendar.png` |
| 空态/睡觉 | `cat-empty.png` |
| 头像 | `cat-avatar.png` |

如需新增姿态，应以现有 PNG 为风格参照，保持同一只猫、同一头身比、同一描边和同一服装逻辑。

## 3. 色彩体系

主色板必须优先使用以下 token：

| Token | HEX | 用途 |
| --- | --- | --- |
| `--cat-orange` | `#FFB54D` | 训练主操作、活力强调、品牌主色 |
| `--cat-red` | `#FF6B6B` | 删除、警示、未完成提醒 |
| `--cat-green` | `#66CCAA` | 健康进度、完成态、饮水正向操作 |
| `--cat-blue` | `#4D9EFF` | 信息操作、添加记录、次级强调 |
| `--cat-yellow` | `#FFD166` | 星星、奖杯、成就、轻装饰 |
| `--cat-sky` | `#9AD8FF` | 水体、浅蓝装饰 |
| `--cat-pink` | `#FFE6F2` | 激励提示、柔和粉底 |
| `--cat-blue-soft-bg` | `#E8F7FF` | 饮水/清爽信息背景 |

全局已使用 `miniprogram/app.wxss` 中的 `--cat-*` 变量作为单一颜色来源。新增样式禁止散落硬编码色值；确需扩展时，应基于上述色板派生浅底或深字色，并补充到 `miniprogram/app.wxss`。当前工程里如出现历史近似值，新素材与新样式一律以本表为准。

色彩要求：

- 明亮、柔和、清爽，高饱和但不刺眼。
- 一个页面或插画中主色不要过多，通常一个主强调色即可。
- 背景优先使用透明、纯白、极浅蓝 `#E8F7FF` 或极浅黄 `#FFF6D6`。

## 4. 线条与质感

- 使用清晰、圆润、柔和的漫画线稿；轮廓完整，不碎、不糊。
- 描边以黑色或深灰柔和描边为主，角色局部可用深棕或彩色描边。
- 线宽均匀，端点圆滑；避免过细、过硬、过于写实。
- 填充以平涂/轻拟物为主，阴影少、高光少。
- 不使用复杂渐变、金属质感、噪点纹理、照片质感、电影级光效。

## 5. 光影

- 使用柔和轻拟物阴影，形状跟随主体。
- 高光少量、小巧，不抢主体。
- 卡片阴影保持轻盈：`0 8rpx 24rpx rgba(31, 74, 58, 0.06)`。
- 插画背景透明时，只在角色或道具下方保留极淡阴影。

## 6. 构图与背景

- 主体占画面核心区域，不要被装饰物压住。
- 构图简洁，视觉中心明确，角色与道具关系清楚。
- 避免复杂场景；如无明确需求，不生成健身房全景、街道、室内环境等背景。
- 装饰只用少量星星、云朵、水滴、速度线、小爱心等元素。
- UI 卡片内插画要有安全边距，避免贴边裁切。

## 7. 图标与 UI 原语

- 图标风格：卡通、圆润、粗描边 + 局部填充，与猫咪插画同族。
- 常用主题：哑铃、水杯、运动鞋、日历、奖杯、火焰、爱心、闪电。
- 卡片：白底、大圆角、细描边、柔和阴影。
- 按钮：胶囊形，主操作用橙或绿，信息操作用蓝，破坏性操作用红。
- 进度条：两端半圆，绿色表示健康/完成，橙色表示训练进度。
- 文字层级：标题粗、正文清晰、辅助信息弱化；避免长段文字。

## 8. AI 生成素材固定模板

生成新的猫咪插画时，使用以下正向提示：

```text
Q-version cartoon comic illustration of a cute orange and white cat athlete,
big round head, small body, large expressive eyes, pink blush, small nose and mouth,
wearing a blue sport tank top, blue shorts and an orange headband,
[POSE / PROP], clean rounded hand-drawn comic lineart, soft dark outline,
flat pastel colors with subtle highlights, bright fresh sporty mood,
transparent background, centered composition, mobile app illustration,
consistent with an orange-white cartoon cat mascot design system
```

生成图标时，把角色部分替换为：

```text
cute cartoon sport icon, rounded comic outline, bold friendly shape,
flat fill with one accent color, minimal details, transparent background
```

负向提示：

```text
realistic, photorealistic, 3D render, Pixar style, anime style, superhero style,
detailed texture, complex gradient, cinematic lighting, dark background,
busy background, cluttered composition, multiple cats, inconsistent character design
```

## 9. 验收清单

每次新增或替换视觉素材前逐项检查：

1. 是否仍是同一只橘白卡通猫，头身比、眼睛、腮红、服装逻辑是否一致。
2. 是否使用统一色板，没有引入新的杂色。
3. 线条是否圆润、描边是否稳定、有没有写实或 3D 感。
4. 背景是否透明或足够干净，主体是否清晰。
5. 在 80rpx-320rpx 小尺寸下是否仍能识别。
6. 图标与猫咪插画是否像同一个设计系统。
7. UI 是否遵守 `miniprogram/app.wxss` 的颜色、圆角、间距、字号和阴影 token。

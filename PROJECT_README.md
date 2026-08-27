# AI 健身助手（健身小助手欣一）· 项目说明书

> 微信小程序「健身小助手欣一」—— 一款集个性化训练计划、动作库、训练记录、饮水管理、体重追踪、数据统计与 AI 健身教练于一体的个人健身管理小程序。
>
> 本文档随项目迭代更新，与代码保持同步。

---

## 目录

1. [项目简介](#一项目简介)
2. [技术架构](#二技术架构)
3. [项目目录结构](#三项目目录结构)
4. [页面一览（23 个页面）](#四页面一览16-个页面)
5. [五大板块介绍](#五五大板块介绍)
6. [公共组件与全局能力](#六公共组件与全局能力)
7. [数据库设计](#七数据库设计)
8. [AI 健身教练（云函数 aiCoach）](#八ai-健身教练云函数-aicoach)
9. [核心机制设计](#九核心机制设计)
10. [UI 设计系统](#十ui-设计系统)
11. [开发工具与静态校验](#十一开发工具与静态校验)
12. [运行与部署](#十二运行与部署)
13. [测试要点](#十三测试要点)
14. [项目历史与演进](#十四项目历史与演进)

---

## 一、项目简介

**项目名称**：健身小助手欣一（AI 健身助手 / AI Fitness Assistant）
**AppID**：`wxb234666c120487ef`（正式版，个人主体）
**基础库版本**：`3.17.1`，工程架构：`multiPlatform`（微信小程序 + miniapp 跨端，含 Android / iOS / HarmonyOS 配置）

**定位**：面向普通健身用户的个人健身管理小程序，覆盖「资料 → 训练 → 动作 → 饮水 → 体重 → 统计 → AI 指导」完整闭环。当前采用**欢迎页模式**：无需登录，用户勾选协议后即可进入使用（个人主体账号无法获取手机号能力，已取消全部登录/后端逻辑，数据层完全依赖微信云开发）。

**核心功能一览**：

| 功能 | 说明 |
|---|---|
| 个性化训练计划 | 规则引擎按用户资料（目标/经验/频率/时长/器械）生成，支持自定义周计划编辑覆盖 |
| 动作库 | 44 个动作（9 大分类），全部来自云数据库 `exercises`，含推荐组数/次数/休息时间/教学步骤 |
| 训练完成记录 | 动作级「已完成/未完成」双向切换 + 力量训练明细（每组重量/次数/RPE/力竭/休息、计时器、自动保存草稿），按 `openid + 日期 + 动作` 幂等持久化，完成率统计 |
| 饮水管理 | 每日目标设置（杯数×容量）、喝一杯、手动添加、历史按日汇总、目标快照还原 |
| 体重记录 | 每日记录（同一天自动更新）、30 天变化曲线（Canvas 2D 自绘）、累计变化 |
| 健身数据中心 | 训练（周/月/累计）、饮水（本月日均）、体重（首末对比）汇总 |
| AI 健身教练 | 云函数 Agent：23 个工具 + Function Calling（含训练表现分析、主动调整、长期记忆、训练周期与档案分析），动作全部来自动作库，带本地规则兜底 |

**开发方式**：原生微信小程序（WXML / WXSS / JavaScript）+ 微信云开发（云数据库、云函数）。无第三方 UI 框架、无 AI SDK 依赖（云函数用 Node 原生 HTTPS 调用大模型）。

---

## 二、技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                     微信小程序前端（23 个页面）                   │
│  pages/ + components/（猫咪插画/悬浮球）                        │
│  services/ 数据层 → utils/cache 本地缓存 → 云数据库直连          │
└──────────────────────────┬───────────────────────────────────┘
                           │ wx.cloud（集合权限：仅创建者可读写）
┌──────────────────────────▼───────────────────────────────────┐
│                      微信云开发 CloudBase                       │
│  云数据库：users / exercises / water_settings /                │
│            water_records / weight_records /                   │
│            workout_records / week_plan                        │
│  云函数：aiCoach（AI 教练 Agent：23 工具 + Function Calling）     │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS（OpenAI 兼容 Chat Completions）
┌──────────────────────────▼───────────────────────────────────┐
│                   大模型 API（DeepSeek deepseek-chat 等）        │
└──────────────────────────────────────────────────────────────┘
```

**分层设计**：

- **页面层（pages/）**：只负责 UI 与交互，不直接操作数据库（全部经 services 封装）
- **数据层（services/）**：封装所有云数据库操作（openid 隔离、错误处理、TTL 缓存、幂等）
- **工具层（utils/）**：日期、BMI、Canvas 折线图、翻页全量查询、本地缓存等通用能力
- **组件层（components/）**：全局 AI 悬浮球、统一猫咪插画等可复用组件
- **云函数（cloudfunctions/）**：AI 教练 Agent（API Key 只存云端）
- **设计资源（design/ + tools/）**：UI 参考图、设计预览 HTML、素材生成与静态校验脚本

---

## 三、项目目录结构

```
E:\Sport
├── app.js                          # 入口：云开发初始化、动作库幂等导入
├── app.json                        # 全局配置：16 页面注册、5 TabBar、全局组件
├── app.wxss                        # 全局主题层：Design Tokens + 通用原语（808 行）
├── app.miniapp.json                # 跨端（miniapp）适配配置（userName）
├── project.config.json             # 微信开发者工具项目配置（AppID、云函数目录、打包忽略）
├── project.miniapp.json            # miniapp 跨端工程配置（Android/iOS/OHOS SDK）
├── project.private.config.json     # 个人本地工具配置（不入库）
├── config.js                       # 全局统一配置（无任何密钥；CLOUD_ENV/STORAGE_KEYS/AGREEMENT）
├── sitemap.json                    # 索引配置（全部允许）
├── i18n/base.json                  # 跨端应用名「健身小助手欣一」
├── data/
│   └── exercises.js                # 动作库种子数据（44 个动作，仅首次初始化导入用）
├── utils/                          # 工具层
│   ├── date.js                     # 日期工具（YYYY-MM-DD / HH:mm / 周一 / 月初）
│   ├── bmi.js                      # BMI 计算与中国成人参考区间（仅参考，非医疗）
│   ├── chart.js                    # Canvas 2D 折线图（体重曲线，可配颜色）
│   ├── db.js                       # 翻页全量查询（突破单次 20 条限制，默认上限 500）
│   └── cache.js                    # 本地缓存（TTL 过期 + 静默降级）
├── services/                       # 数据层（所有云数据库操作封装）
│   ├── user.js                     # 用户资料（users）
│   ├── exercise.js                 # 动作库（exercises，含初始化导入/推荐过滤）
│   ├── recommend.js                # 规则推荐引擎（核心，前端版）
│   ├── workout.js                  # 训练统计 + 完成记录（workout_records，幂等）
│   ├── water.js                    # 饮水（settings/records/今日/月/历史汇总/快照）
│   ├── weight.js                   # 体重（weight_records，同日 upsert）
│   └── plan.js                     # 自定义周计划（week_plan，集合缺失静默降级）
├── components/                     # 公共组件

│   ├── cat-illustration/           # 统一卡通猫咪插画组件（PNG，11 种姿态）\n
│   ├── cat-mascot/                 # 纯 CSS 橘白猫（历史组件，保留未用）
│   └── section-title/              # 区块标题组件（保留未用）
├── cloudfunctions/
│   └── aiCoach/                    # AI 健身教练云函数
│       ├── index.js                # Agent 入口与工具调度循环（最多 4 轮）
│       ├── prompt.js               # System Prompt + 23 个工具定义（Function Calling）
│       ├── tools.js                # 23 个工具实现（openid 隔离 + 动作存在性校验）
│       ├── recommend.js            # 云端规则引擎（与前端 services/recommend.js 保持一致）
│       ├── llm.js                  # 大模型 HTTPS 调用（OpenAI 兼容，原生 https）
│       ├── config.js               # API Key 配置（环境变量 AI_API_KEY 优先，仅存云端）
│       └── package.json            # 依赖仅 wx-server-sdk
├── pages/                          # 23 个页面（见下章）
├── assets/
│   ├── tabbar/                     # 5 组 TabBar 图标（10 张 PNG，选中绿 #4CD964）
│   ├── cat/                        # 卡通猫咪插画 PNG（9 张：avatar/home/workout/water/success/…）
│   └── icons/                      # 功能图标 PNG（7 张：星/奖杯/垃圾桶/水杯/云等）
├── design/                         # 设计资源（不打包）
│   ├── ui-reference.png            # UI 重构视觉参考图
│   ├── UI_REFACTOR_PLAN.md         # UI 重构实施方案（设计系统规范）
│   └── *-preview.html / cat-gallery.html  # 设计预览页
├── tools/                          # 开发工具（不打包）
│   ├── check-project.ps1           # 静态校验：JSON/WXML/WXSS/资源引用
│   ├── gen-tabbar-icons.ps1        # TabBar 图标生成脚本
│   ├── gen-cat-placeholders.ps1    # 猫咪占位图生成脚本
│   ├── gen-cat-v2.ps1              # 猫咪素材 v2 生成脚本
│   ├── process_cats.py             # 猫咪素材批处理脚本
│   └── theme-preview.html / home-preview.html  # 主题/首页预览
├── docs/agreement/                 # 协议 H5 页面（terms.html / privacy.html，部署用，不打包）
├── PROJECT_README.md               # 本文档
├── PROJECT_REQUIREMENTS.md         # 原始需求文档（开发起点）
└── UI_REFACTOR_PLAN.md             # UI 重构实施方案（根目录副本）
```

> `design/`、`tools/`、`docs/`、`.workbuddy/`、`.git/` 及各 Markdown 文档已在 `project.config.json` 中配置为打包忽略。

---

## 四、页面一览（23 个页面）

| # | 页面 | 路径 | 说明 |
|---|---|---|---|
| 1 | 欢迎页 | pages/login | 协议勾选 + 「进入小程序」，无需登录；回显上次同意状态 |
| 2 | 首页 | pages/index | 今日训练 Hero / 今日饮水 / 本周概览 / 身体数据(BMI) / 体重趋势 |
| 3 | 训练 | pages/workout | 本周计划圆点、今日训练、完成进度、未完成/已完成筛选 |
| 4 | 训练详情 | pages/workout-detail | 今日训练完成进度卡 + 动作列表（自定义导航栏） |
| 5 | 动作库 | pages/exercise | 「推荐 / 全部 / 9 大分类」11 个 Tab |
| 6 | 饮水 | pages/water | 今日统计、喝一杯、记录列表与删除、历史入口 |
| 7 | 我的 | pages/profile | 用户摘要 + 功能菜单（资料/数据中心/体重/饮水设置） |
| 8 | 饮水设置 | pages/water-setting | 每天杯数(1-30) + 每杯容量(50-1000ml) 步进器 |
| 9 | 添加饮水记录 | pages/water-add | 手动录入时间/水量/类型/备注 |
| 10 | 我的资料 | pages/user-info | 资料表单 + BMI 实时预览，保存自动同步当天体重 |
| 11 | AI 健身教练 | pages/ai | 聊天页：云函数 Agent + 工具轨迹 + 本地规则兜底 |
| 12 | 体重记录 | pages/weight | 体重录入 + 30 天 Canvas 曲线 + 历史管理 |
| 13 | 健身数据中心 | pages/stats | 训练/饮水/体重三大统计卡 |
| 14 | 饮水历史 | pages/water-history | 按日倒序汇总 + 分页加载（自定义导航栏） |
| 15 | 饮水历史详情 | pages/water-history-detail | 单日明细 + 删除实时重算 |
| 16 | 自定义周计划 | pages/week-plan-edit | 7 天 × 动作库勾选编辑，智能推荐预填 |
| 17 | 动作历史 | pages/exercise-history | 动作表现分析：个人 PR（重量/次数/容量）、最近 vs 上次、渐进超负荷建议、重量/次数/容量趋势图、最近训练列表 |
| 18 | 每日状态 | pages/recovery | 每日身体状态极简记录（睡眠/疲劳/酸痛/意愿/身体状态，约 10 秒），历史可修改/删除 |
| 19 | 欣一记住的事情 | pages/fitness-memory | 长期健身记忆（fitness_memory）：查看 / 修改 / 删除 AI 记住的训练偏好、习惯、身体反馈、目标与备注 |
| 20 | 训练周期 | pages/cycle | 4~8 周长期训练周期：进度（第 X/共 Y 周）、本周计划（渐进调整/减量周）、每周 AI 总结、周期总结、历史周期、创建/放弃 |
| 21 | 创建周期 | pages/cycle-create | 选择目标 / 周数（4/6/8）/ 名称创建周期，模板基于自定义周计划或智能推荐 |
| 22 | 身体围度 | pages/body-measure | 记录体脂率与腰/胸/臀/手臂/大腿围（每天一条），历史可修改/删除 |
| 23 | 数据管理 | pages/data-manage | 数据导出（JSON/CSV，分享文件）与导入（粘贴 JSON：校验/防重/保留现有/回滚/openid 隔离） |
| 24 | 协议查看 | pages/agreement | 小程序内原生展示《用户协议》《隐私政策》全文（无需外部域名）；config.js 已配置 H5 地址时底部显示可复制的浏览器链接 |

底部 TabBar 共 5 项：**首页 / 训练 / 动作 / 饮水 / 我的**（图标为卡通线条 + 绿色选中态）。

---

## 五、五大板块介绍

### 1. 首页（pages/index）

个人健身「今日总览」入口，自上而下多张卡片：

| 卡片 | 内容 |
|---|---|
| 顶部问候区 | "Hi, 昵称" + 挥手猫咪插画 |
| **欣一今日建议** | **今日身体状态（未记录引导 10 秒记录）、今日训练建议（NORMAL/REDUCE/RECOVERY/REST 状态）、恢复建议、饮水建议、一句话总结（本地规则生成，数据依据）** |
| 今日训练（Hero 卡） | 今日训练部位（如「胸 + 三头」）、动作数、预计时长；一键进入训练页；休息日显示恢复提示 |
| 今日饮水 | 已喝/目标 ml、杯数、完成率进度条；【喝一杯】（绿）+【添加记录】（蓝）双按钮 |
| 本周概览 | 本周训练次数 + 饮水达标天数（纯展示，失败静默隐藏） |
| 我的身体数据 | 身高、体重、BMI（含参考区间）、健身目标；未填资料时引导填写 |
| 体重趋势 | 当前体重、近 30 天变化（↓/↑）、迷你 Canvas 折线图、记录入口 |

数据全部走本地缓存，切换 Tab 秒开；喝一杯/完成动作等操作后自动失效刷新。

### 2. 训练（pages/workout + pages/workout-detail）

个性化训练核心板块：

- **本周计划**：周一~周日横向圆点（今天高亮、已完成打勾、休息置灰），页面底部提供 ✏️ 编辑计划 / 🍀 智能推荐 按钮
- **今日训练卡**：今天 · 周几 / 部位组合 / 动作数 / 预计时长，右侧举哑铃猫咪
- **快速完成状态**：每个动作「未完成 / 已完成」胶囊按钮可双向切换，按 `openid + 日期 + 动作` 幂等持久化，重启不丢
- **力量训练记录（v2）**：点「开始训练」进入训练记录页 —— 训练计时器（开始/暂停/继续/结束，自动记录总时长）、逐动作录入每组重量/次数/RPE/力竭/组间休息、添加/删除训练组、组间休息倒计时（可跳过）、完成动作（含备注）、从动作库选择动作补充
- **自动保存**：每次变更写本地草稿 + 防抖写库；退出页面/杀进程后回训练页有「继续上次训练」入口，恢复草稿不丢数据
- **训练摘要**：已完成动作展示「3组 · 总容量720kg」负荷摘要，支撑长期力量追踪
- **完成进度**：`3/4` 大数字 + 完成率 % + 渐变进度条，全部完成有 🎉 提示与胜利卡
- **筛选**：顶部「未完成 / 已完成」Tab 切换查看
- **智能推荐**：按「我的资料」用规则引擎重新生成 7 天计划并覆盖（存 week_plan）
- **编辑计划**：自定义周计划编辑页（7 天 × 动作库勾选，可设休息、可清空所有；保存空计划即恢复智能推荐）
- **训练表现分析（v3）**：
  - **个人 PR**：每个动作自动追踪最大重量 / 最大次数 / 最大训练容量 PR；完成动作或完成训练时创造新纪录有 toast / 弹窗反馈（明显不过度）
  - **动作历史页**（pages/exercise-history）：从动作库卡片或训练记录页「📊」进入，展示 PR、最近 vs 上次对比、渐进超负荷建议、重量/次数/容量三张趋势图（Canvas）、最近训练列表
  - **渐进超负荷建议**：基于历史数据（容量趋势、目标完成度、PR 接近度）生成「增加重量 / 保持重量加次数 / 保持 / 降低训练量」建议与具体重量/次数，全部有数据依据，不凭空生成
  - **计算位置**：全部在 services/utils 层完成（utils/workout-analysis.js 纯函数），页面与 AI 只消费结果；分析结果缓存 5 分钟，训练数据写入/修改后立即失效
- **每日身体状态（v4）**：
  - **每日状态页**（pages/recovery）：极简滑杆记录睡眠质量 / 疲劳程度 / 肌肉酸痛 / 训练意愿 / 今日身体状态（1-5）+ 备注，约 10 秒完成；存 `recovery_records`（openid + 日期唯一，upsert），历史可查看 / 点击修改 / 删除
  - **训练状态判断**：`utils/training-state.js` 纯函数综合恢复数据 + 训练负荷（连续训练天数、近 7 天训练天数、容量趋势）+ 疼痛关键词，输出 **NORMAL / REDUCE / RECOVERY / REST** 及依据与建议（如「睡眠差 + 疲劳高 + 连续训练多天 → 降低训练量」）
  - **欣一今日建议**（首页卡片）：今日身体状态（未记录引导）、今日训练建议、恢复建议、饮水建议、一句话总结 —— 本地规则生成，不依赖 AI
  - **医疗边界**：备注/历史中检测到疼痛不适 → 仅给停止相关动作、降低负荷等安全建议并建议咨询专业人士，AI 不做任何医疗诊断
- **长期健身记忆（v5）**：
  - **fitness_memory**：结构化长期记忆（每用户 1 条）——训练偏好 / 训练习惯 / 身体反馈 / 目标（含历史与变化时间）/ AI 长期备注；旧用户无记忆时返回空结构，系统正常运行
  - **保存条件**：仅在未来训练确有价值、用户明确长期偏好、多次行为确认稳定习惯、用户主动要求记住时才保存；一次性临时信息不进入长期记忆（prompt 规则约束）
  - **敏感信息保护**：手机号/身份证/银行卡/邮箱/密码/住址等一律不保存（前后端双重过滤：`utils/sensitive.js` 与云函数 `memory.js`）
  - **欣一记住的事情**（pages/fitness-memory）：用户可查看 / 修改 / 删除所有记忆（我的 → 菜单入口）
  - **AI 综合使用**：安排训练时 AI 综合 用户资料 + 今日计划 + 训练历史 + 恢复状态 + 长期偏好 + 训练表现 后给出建议
- **长期训练周期（v6）**：
  - **训练周期**（pages/cycle + pages/cycle-create）：4~8 周周期，含名称/目标/起止日期/当前周/周频率/每周计划/状态；**优先级：周期计划 > 自定义周计划 > 规则推荐**；无周期时沿用原计划系统（week_plan 不破坏）
  - **渐进式训练**：每 2 周自动递增（组数 +1 封顶 +2；非减脂重量 +5% 封顶 15%），建议重量基于动作最近表现（数据依据）；≥6 周周期中段自动插入**减量周**（-1 组、-20% 重量）
  - **每周 AI 总结**（程序计算 + 本地规则文案）：训练次数/完成率/容量/PR 数/体重变化/饮水达标/恢复均值 + 本周表现/主要进步/主要问题/下周建议（查看周期页时惰性生成，周结束后重算）
  - **周期总结**：完成率/总训练天数/总容量/PR 数/体重变化/表现变化（首末周容量）+ AI 总结/下周期建议；周期到期惰性标记完成
  - **减量判断**：复用训练状态（NORMAL/REDUCE/RECOVERY/REST）——容量下降、连续训练、恢复差时建议降低训练量
- **个人健身成长档案（v7）**：
  - **健身档案页**（pages/stats 重写）：训练（周/月/累计/近7天完成率/总容量/平均时长/PR 数）、体重（当前/30 天/90 天变化）、身体（BMI/体脂率/腰胸臀臂腿围）、饮水（本月总量/日均/达标天数/最长连续达标）、恢复（平均疲劳/睡眠/酸痛/不适天数）
  - **6 类趋势图**（tabs 切换）：体重 / 训练容量 / 训练次数 / 新 PR / 饮水 / 腰围（近 30 天，Canvas）
  - **身体围度**（pages/body-measure）：体脂率 + 5 项围度，每天一条，可改/删
  - **AI 数据分析**：档案页一键调用 aiCoach（getFitnessReport 程序计算统计），AI 只解释不伪造
  - **个人成就**（11 项）：第 1/10/50/100 次训练、连续训练 7 天、连续饮水达标 7 天、首个/10 个 PR、连续记录体重 30 天、容量 10000kg、完成训练周期；程序检测自动解锁
  - **数据导出/导入**（pages/data-manage）：训练/饮水/体重/围度/恢复/AI 记忆/全部 → JSON（单类型可 CSV）分享文件；导入粘贴 JSON（格式校验、按唯一键防重复、保留现有数据、失败回滚、剥离 openid 不覆盖他人）

### 3. 动作（pages/exercise）

动作库浏览板块，Tab 栏共 11 项：

| Tab | 内容 |
|---|---|
| 🎯 推荐 | 按用户资料（器械兼容 + 经验难度等级）过滤出的推荐动作 |
| 全部 | 动作数据库中全部 44 个动作（翻页取全量） |
| 胸部 / 背部 / 肩部 / 手臂 / 腿部 / 臀部 / 核心 / 有氧 / 拉伸 | 按分类筛选 |

每个动作卡片展示：名称、推荐组数×次数、目标肌肉、难度、所需器械、组间休息。数据全部来自 `exercises` 集合（公共数据，所有用户可读）。未填写资料时「推荐」栏引导填写。**点击任意动作卡片可进入「动作历史」页查看该动作的训练记录与个人最佳。**

### 4. 饮水（pages/water + 子页面）

饮水管理核心板块：

- **今日统计卡**：已喝 ml / 目标 ml、杯数 / 目标杯数、完成率、剩余量、渐变进度条
- **操作**：【喝一杯】（按每杯容量自动记录，类型默认白水）、【添加记录】（手动输入时间/水量/类型/备注）
- **今日记录列表**：时间、水量、类型、备注，支持删除（删除需确认）
- **历史记录入口**：进入独立历史页
- **饮水设置**：每天杯数（1-30）+ 每杯容量（50-1000ml）步进器，自动计算每日目标

**历史记录页（pages/water-history）**：按日期倒序汇总每日饮水（总量/目标/杯数/完成率/状态标签），分页加载（每页 20 天）+ 加载更多；空状态引导。
**历史详情页（pages/water-history-detail）**：某天全部明细 + 统计，删除记录后**实时重算**当天统计。
**状态规则**：≥100% 已完成（绿）；当天未达标 进行中（橙）；已过日期未达标 未完成（灰）。

### 5. 我的（pages/profile）

个人中心板块：

- **用户信息卡**：头像（昵称首字）、昵称、性别 · 年龄 · 目标 · 器械；「编辑」进入资料页
- **功能菜单**：
  - 👤 我的资料（pages/user-info）：昵称/性别/年龄/身高/体重 + 目标/经验/每周次数/每次时长/器械，实时计算 BMI，保存时自动同步当天体重记录
  - 📊 健身数据中心（pages/stats）：训练（本周/本月/累计次数，按日期去重）、饮水（本月日均/总量/天数）、体重（首次 → 当前 + 变化）
  - 🧠 欣一记住的事情（pages/fitness-memory）：长期健身记忆（fitness_memory）查看/修改/删除 —— AI 记住的训练偏好、习惯、身体反馈、目标与备注
  - 🗓️ 训练周期（pages/cycle）：4~8 周长期训练周期，进度/每周总结/周期总结/创建
  - ⚖️ 体重记录（pages/weight）：记录体重（同一天自动更新）、30 天曲线、历史列表可删除
  - 💧 饮水设置

---

## 六、公共组件与全局能力

### 1. 全局 AI 悬浮球（components/float-ball）

「欣一」小猫悬浮球：全页面显示（app.json 全局注册），可拖拽（位置记忆到 storage，换机越界自动修正）、拖拽时判定位移不触发点击、点击进入 AI 教练页（已在 AI 页不重复跳转）。**在 AI 页不显示**（组件内自判路由）。

### 2. 统一猫咪插画（components/cat-illustration）

全站猫咪插画的唯一来源，基于 `assets/cat/cat-<pose>.png`：

- 支持姿态：`home / workout / back / leg / water / remind / success / ai / empty / avatar / calendar`（非法姿态回退 home）
- 属性：`pose`、`size`（rpx）、`shape`（none/circle/square）、`bg`、`animate`（none/float/bounce）
- 已用于首页、训练页、饮水页、饮水历史页、训练详情页等

### 3. 其他组件

- `cat-mascot`：纯 CSS 橘白猫（stand/wave/drink/sleep），历史组件，当前页面未引用（保留降级用）
- `section-title`：区块标题（图标 + 标题 + 可选链接），当前页面未引用

### 4. 全局能力

- **欢迎页模式**：启动 → login 协议页 → 勾选协议 → reLaunch 首页，无任何登录态校验与网络请求
- **动作库自动初始化**：`app.js onLaunch` 幂等导入 44 个动作（已有数据跳过，本地标记避免重复查询）
- **缓存体系**：`utils/cache.js` 提供带 TTL 的本地缓存，所有服务层统一使用（详见第九章）

---

## 七、数据库设计

云开发数据库共 **14 个集合**（需在云开发控制台手动创建）：

| 集合 | 用途 | 权限 | 关键字段 |
|---|---|---|---|
| `users` | 用户资料 | 仅创建者可读写 | `_openid`、nickname、gender、age、height、weight、goal、experience、training_days、training_duration、equipment |
| `exercises` | 动作库（公共数据） | **所有用户可读**，仅创建者可读写 | `_openid`、name、category、target_muscle、difficulty、equipment、description、steps、common_mistakes、tips、recommended_sets、recommended_reps、reps_unit、rest_seconds、sort、image_url、video_url |
| `water_settings` | 饮水设置（每用户 1 条） | 仅创建者可读写 | `_openid`、daily_cups、cup_ml、daily_target_ml |
| `water_records` | 饮水记录 | 仅创建者可读写 | `_openid`、drink_time、amount_ml、drink_type、remark、date、**daily_target_ml（目标快照）**、daily_cups（快照） |
| `weight_records` | 体重记录 | 仅创建者可读写 | `_openid`、weight_kg、date（同一天更新不新增） |
| `workout_records` | 训练完成记录 + 力量训练明细（v2） | 仅创建者可读写 | `_openid`、exercise_id、exercise_name、workout_date、plan_id、completed、completed_at（旧字段 sets/reps 保留并继续同步写入）；v2 新增：**planned_sets / planned_reps（计划）**、**actual_sets（实际组数）**、**set_records（每组明细数组：weight/reps/rpe/is_failure/rest_seconds）**、**note（动作备注）**、**started_at / ended_at（动作起止）**、**duration_minutes（动作耗时）**、**session_id（关联会话）**、data_version |
| `workout_sessions` | 训练会话（v2 新增，每会话 1 条） | 仅创建者可读写 | `_openid`、workout_date、plan_id、parts_text、started_at、ended_at、**duration_minutes（训练总时长）**、status（active/paused/completed） |
| `recovery_records` | 每日身体状态（v3 新增，每天 1 条） | 仅创建者可读写 | `_openid`、**date（YYYY-MM-DD，每天唯一）**、**sleep_quality / fatigue / soreness / motivation / body_status（1-5）**、note（备注）、created_at、updated_at |
| `fitness_memory` | 长期健身记忆（v5 新增，每用户 1 条） | 仅创建者可读写 | `_openid`、**training_preferences**（preferred_training_styles/favorite_exercises/disliked_exercises/preferred_time/preferred_duration）、**training_habits**（weekly_frequency/common_time/often_missed_days/common_patterns）、**body_response**（slow_recovery_parts/easily_tired_exercises/feedback[]）、**goals**（current/history[]/updated_at）、**ai_notes[]**、updated_at |
| `training_cycles` | 训练周期（v6 新增，每用户多条，同时最多 1 个 active） | 仅创建者可读写 | `_openid`、name、goal、start_date、end_date、total_weeks、weekly_frequency、status（active/completed/abandoned）、**weeks[]**（week_no/deload/adjust{sets_delta,reps_delta,weight_delta_pct}/days[{day,isRest,exercise_ids}]/note）、final_summary |
| `training_cycle_weeks` | 周期每周总结（v6 新增，每周期每周 1 条） | 仅创建者可读写 | `_openid`、cycle_id、week_no、start_date、end_date、**summary**（training_days/completion_rate/total_volume/pr_count/weight_change_kg/water_days/recovery/pain_detected）、**ai_summary**（performance/improvements/problems/next_week_advice）、status |
| `body_measurements` | 身体围度（v7 新增，每天 1 条） | 仅创建者可读写 | `_openid`、**date**、body_fat_pct（体脂率）、waist_cm/chest_cm/hip_cm/arm_cm/thigh_cm（围度 cm） |
| `achievements` | 个人成就（v7 新增，每用户 1 条） | 仅创建者可读写 | `_openid`、unlocked[{key, unlocked_at}]、updated_at |
| `week_plan` | 自定义周计划（每用户 1 条） | 仅创建者可读写 | `_openid`、days[7]（day/isRest/exercise_ids） |

**设计要点**：

- **openid 隔离**：所有用户数据查询显式 `where({ _openid: '{openid}' })` + 集合权限双保险（云函数内则用 `cloud.getWXContext().OPENID` 自行过滤）
- **历史目标快照**：`water_records` 保存记录时的 `daily_target_ml/daily_cups`，历史统计还原当日目标（改目标不影响历史）
- **幂等完成记录**：`openid + workout_date + exercise_id` 唯一，重复点击不重复插入，取消完成仅置 `completed: false`
- **删除训练记录**：训练记录页每个动作提供「删除该动作今日记录」（数据纠错），删除后统计/趋势/PR 缓存立即失效；不影响历史其他日期
- **查询上限**：小程序端单次翻页查询默认上限 500 条（`utils/db.js`）。对个人用户（每日 1~2 次训练）约 1~2 年数据量足够；超过后历史统计/趋势/导出会截断，届时可将统计改为云函数聚合（云端计算，不依赖客户端翻页）
- **力量训练明细（v2）**：每个动作 1 条文档，`set_records` 数组存每组重量/次数/RPE/力竭/休息，避免为每组创建大量无意义文档；训练会话总时长与计时器状态存 `workout_sessions`（每会话 1 条）
- **每日恢复记录（v3）**：`recovery_records` 以 `openid + date` 唯一，同一天重复保存为更新（upsert），可查询历史/修改/删除；首页「欣一今日建议」与 AI 综合分析均基于它判断训练状态
- **旧数据兼容**：旧记录（v1）没有 `set_records/planned_sets` 等新字段时，读取端自动回退（`planned_sets || sets`），页面/统计/AI 均不报错；旧字段 `sets/reps` 继续同步写入
- **训练自动保存**：训练中每次变更先写本地草稿（storage），再防抖写数据库；页面退出/杀进程后回来自动恢复草稿，不丢数据
- **体重同日 upsert**：同一天重复记录更新当天文档，避免曲线同点重复
- **集合缺失降级**：`week_plan` 未创建（错误码 -502005）时静默降级为规则引擎，不影响使用；`recovery_records` 未创建时恢复查询静默降级，首页建议仍可用（按训练负荷判断）

---

## 八、AI 健身教练（云函数 aiCoach）

### Agent 架构

```
用户问题 → LLM（带 23 个工具定义，tool_choice=auto）
   → 返回 tool_calls → 执行工具（数据库查询，openid 隔离）
   → 结果回填 LLM → 直到 LLM 给出最终回答（最多 4 轮，超时 30s）
前端失败 → 本地规则引擎兜底（标注「AI 暂时不可用」）
```

### 23 个工具

| 工具 | 作用 |
|---|---|
| getUserProfile | 获取用户身体资料 |
| getTodayWorkout | 今日训练（可传 duration/equipment/goal/exclude_parts 模拟条件，支持排除部位重新组合） |
| getWorkoutHistory | 历史训练（含动作部位分类/目标肌肉/总容量与最大重量次数汇总/最近 3 组明细，用于判断「昨天练了什么」避免连续同部位、分析负荷变化；完整明细用 getExerciseHistory） |
| getWaterRecords | 饮水记录与总量 |
| getExercises | 动作库查询（分类/难度/器械过滤） |
| createWorkoutPlan | 按条件生成训练方案（不入库，仅建议） |
| saveWorkoutRecord | 保存训练记录（**校验动作 _id 必须真实存在于动作库**，防 AI 幻觉；支持 details 逐动作保存每组明细） |
| saveWaterRecord | 保存饮水记录 |
| getExerciseHistory | 动作训练历史（倒序，含每组明细与总容量） |
| getExercisePR | 动作个人最佳（最大重量/最大次数/最大容量 + 日期） |
| getTrainingVolume | 训练容量统计（按动作或全部、最近 N 天、趋势方向） |
| getProgressTrend | 动作进度趋势（数据点 + 首尾对比摘要） |
| getLastPerformance | 最近一次/上一次表现 + 渐进超负荷建议（含建议重量/次数，**数据推算，不凭空**） |
| getRecoveryStatus | 今日恢复状态（睡眠/疲劳/酸痛/意愿 + 疼痛检测 pain_detected） |
| getRecoveryHistory | 每日身体反馈历史（含 pain_detected） |
| analyzeTrainingLoad | 综合训练负荷分析：连续训练天数、近7天训练天数、容量趋势、最近训练部位、最近体重变化 + **训练状态判断（NORMAL/REDUCE/RECOVERY/REST）与原因/建议**（生成建议前必须调用） |
| getRecentBodyStatus | 最近 N 天身体状态与平均值 |
| getFitnessMemory | 获取长期健身记忆（偏好/习惯/身体反馈/目标/AI 备注） |
| saveFitnessMemory | 保存长期记忆（**仅限长期价值/明确偏好/稳定习惯/用户要求**；敏感信息自动拒绝） |
| updateFitnessMemory | 局部更新/追加长期记忆（区块白名单 + 目标历史自动记录） |
| deleteFitnessMemory | 删除长期记忆（整条或指定区块） |
| getTrainingCycle | 获取训练周期程序计算数据（当前周/每周总结/周期总结），AI 只解释不伪造 |
| getFitnessReport | 获取近期健身数据报告（训练天数/容量趋势/PR/体重变化/饮水达标/恢复均值），AI 只解释不伪造 |

> 分析工具接受 `exercise_id` 或 `exercise_name`（需与动作库完全一致）；计算全部在云函数端 `analysis.js`（与前端 `utils/workout-analysis.js` 逻辑一致）完成，AI 只消费结果。
> **主动调整**：AI 生成建议前必须先调用 analyzeTrainingLoad / getRecoveryStatus 综合分析；状态为 REDUCE/RECOVERY/REST 时调整今日训练（减少动作/组数、改为恢复或休息）并**主动解释原因**（如「今天将腿部训练减少 1 个动作，因为你最近连续训练 3 天，并且昨天疲劳度较高」）。
> **医疗边界**：用户描述疼痛/伤病时，AI 不做疾病诊断、不强行安排训练，仅给停止相关动作、降低负荷等安全建议，必要时建议咨询专业医疗/运动专业人士。

### Prompt 关键约束

- 所有动作必须来自工具（getExercises / getTodayWorkout / createWorkoutPlan）返回的数据，严禁编造动作名/组数/次数
- 生成方案前先查用户资料；训练建议前先查今日计划与历史训练
- 用户提到时间/器械限制时，必须用参数重新生成方案；口述身体数据（如「我今天 80kg」）仅作本次计算参考，**不写入数据库**
- 同一轮可并行调用多个工具以减少轮数；只回复简体中文，不做医疗诊断

### 安全设计

- API Key 只存在于云函数环境变量 `AI_API_KEY`（**严禁硬编码在 config.js 或任何提交文件**；历史版本曾硬编码导致密钥入库泄露，已移除，若仍使用旧 Key 请立即在 DeepSeek 控制台轮换），前端 `config.js` 明确禁止放任何密钥
- 云函数拥有数据库管理权限，所有用户数据操作在 tools.js 内按 openid 自行过滤（不依赖集合权限）
- 动作必须来自数据库：AI 无法编造动作；保存记录时批量校验动作存在性
- 输入截断（500 字）、历史截断（10 条）、工具结果截断（4000 字）、最大轮数（4）、单次超时（30s），云函数调用超时前端放宽至 60s

### 本地兜底

AI 云函数不可用（无 Key / 断网 / 报错）时，`pages/ai` 使用本地规则引擎按关键词回答：训练类问题展示今日训练计划，饮水类展示今日饮水统计，并提示 AI 暂不可用。

---

## 九、核心机制设计

### 1. 规则推荐引擎（services/recommend.js + cloudfunctions/aiCoach/recommend.js）

```
用户资料 → 目标匹配部位模板（减脂/增肌/塑形/提升体能/保持健康）
→ 每周次数均匀分布到一周训练日（训练日自动避开休息）
→ 今天星期几 → 时长定动作数量（30min≈4个 … 90min≈7个）
→ 从 exercises 数据库查动作 → 器械过滤（EQUIPMENT_COMPAT）→ 难度过滤（经验等级）
→ 组数调整（新手-1组/高级+1组）→ Fisher-Yates 随机挑选 → 今日训练
```

- 支持 `exclude_parts` 排除部位（「昨天练了胸」场景，云端版会自动寻找下一个不冲突的训练日）
- 今日训练按「日期 + 资料特征」缓存 24 小时：当天固定、切页秒开；资料变化自动生成新缓存
- 云端版与前端版规则保持一致（两份独立部署，修改需同步）

### 2. 自定义周计划（week_plan）

- 优先级：自定义计划 > 规则引擎
- 编辑页首次进入自动用智能推荐预填（不空白）；已有自定义计划则原样回显
- 空计划（清空所有后保存）→ 自动回退智能推荐
- 训练页 🍀 智能推荐按钮一键按资料重新生成 7 天并覆盖

### 3. 性能优化（utils/cache.js）

| 数据 | 缓存 | 失效时机 |
|---|---|---|
| 用户资料 | 10 分钟 | 保存资料后 |
| 动作库 | 24 小时 | 手动清除（clearExerciseCache） |
| 今日训练 | 当天（键含日期+资料特征） | 跨天/资料变化 |
| 今日饮水 | 当天（键含日期） | 喝一杯/添加/删除 |
| 今日完成状态 | 当天 | 完成/取消后 |
| 训练/体重/饮水统计 | 1 小时 | 数据变更后 |

启动时动作库初始化有本地标记（`exercises_init_done`），不再重复查询；所有缓存读写失败静默降级，不影响主功能。

### 4. 数据一致性

- 训练统计按 `workout_date` 去重（同一天多次训练算 1 次）
- 饮水历史目标还原：优先取当天记录快照，无快照回退当前设置
- 体重变化 = 窗口内最早 vs 最新记录（仅一条记录时无变化量）

---

## 十、UI 设计系统

基于 `design/ui-reference.png` 视觉参考重构的**卡通猫咪健身风格**（详见 `UI_REFACTOR_PLAN.md`）：

### Design Tokens（app.wxss 全局变量）

| Token | 值 | 用途 |
|---|---|---|
| `--cat-primary` | `#FFB54D` 活力橙 | 主色：训练主按钮、品牌强调 |
| `--cat-primary-deep` | `#FF9F1C` 深橙 | 渐变末端、按压态 |
| `--cat-success` | `#4CD964` / `#66CDAA` 健康绿 | 喝一杯、已完成、TabBar 选中、进度条 |
| `--cat-blue` | `#4D9EFF` 清新蓝 | 添加记录、次按钮 |
| `--cat-bg` | `#F7F8FA` 浅灰白 | 页面底色 |
| `--cat-warning` | `#FF6B6B` 警示红 | 删除、未完成警示 |
| 圆角 | `--cat-radius-lg: 32rpx`（卡片）/ 胶囊按钮 / `12rpx`（标签） | 圆润卡通感 |
| 阴影 | 柔和绿色系 `rgba(31,74,58,…)` | 卡片/按钮轻阴影 |

### 视觉规范

- 白色大圆角卡片 + 漫画细描边；胶囊按钮；渐变进度条；统一字阶（44/32/28/24/22 rpx）
- **猫咪角色**：圆脸橘白猫（米白脸、橘顶、粉色腮红、蓝色背心、红色头带），素材在 `assets/cat/*.png`，由 `cat-illustration` 组件统一调用
- **TabBar 图标**：卡通线条 + 局部填充，未选中灰、选中绿 `#4CD964`（`assets/tabbar/` 10 张）
- 语义色分工：橙色=训练/主操作，绿色=饮水/完成态，蓝色=次要操作，红色=删除

---

## 十一、开发工具与静态校验

| 脚本 | 作用 |
|---|---|
| `tools/check-project.ps1` | 一键静态校验：所有 JSON 可解析、WXSS 花括号配对、WXML 标签配对、app.json 资源引用（TabBar 图标/页面四件套/全局组件）存在性；输出 PASS/FAIL 与错误清单 |
| `tools/gen-tabbar-icons.ps1` | 生成/重绘 10 张 TabBar 图标 |
| `tools/gen-cat-placeholders.ps1` / `gen-cat-v2.ps1` | 生成猫咪占位/素材图 |
| `tools/process_cats.py` | 猫咪素材批处理 |

用法示例：`pwsh tools/check-project.ps1`

---

## 十二、运行与部署

### 1. 环境准备

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 项目已配置正式 AppID `wxb234666c120487ef`，直接导入 `E:\Sport` 即可
3. 开通云开发环境（工具顶部「云开发」按钮），如有多环境可在 `config.js` 的 `CLOUD_ENV` 指定（留空 = 默认环境）

### 2. 数据库准备

云开发控制台创建 **14 个集合**并设置权限：

| 集合 | 权限 |
|---|---|
| users / water_settings / water_records / weight_records / workout_records / workout_sessions / recovery_records / fitness_memory / training_cycles / training_cycle_weeks / body_measurements / achievements / week_plan | 仅创建者可读写 |
| exercises | 所有用户可读，仅创建者可读写 |

首次启动小程序会自动导入 44 个动作到 `exercises`（幂等）。若手动清空了 `exercises`，需清除本地缓存（`cache_exercises_all` 与 `exercises_init_done`）才会重新导入。`workout_sessions` 为 v2 新增集合（训练会话），未创建时训练计时器写库会失败但本地草稿兜底可用，建议按上表创建。

### 3. AI 教练云函数部署

1. 开发者工具中右键 `cloudfunctions/aiCoach` → **创建并部署：云端安装依赖**
2. 云开发控制台 → 云函数 → aiCoach → 配置：
   - **超时时间改为 60 秒**
   - **环境变量 `AI_API_KEY`**（唯一密钥来源；`config.js` 已移除硬编码，严禁在提交文件中写密钥；如曾使用过泄露的 Key 请在 DeepSeek 控制台轮换）
3. 默认对接 DeepSeek（`deepseek-chat`），可在 `config.js` 修改 BASE_URL/MODEL 对接其他 OpenAI 兼容厂商

> **数据库索引建议**：数据量增长后，在云开发控制台为以下排序/筛选字段创建索引以保持查询性能：
> `workout_records`：`_openid + workout_date`（倒序）、`_openid + exercise_id + workout_date`；
> `weight_records` / `water_records` / `recovery_records` / `body_measurements`：`_openid + date`（倒序）；
> `training_cycle_weeks`：`_openid + cycle_id + week_no`；`training_cycles`：`_openid + status + start_date`。

### 4. 协议与隐私（审核整改后现状）

- **小程序内查看（无需域名）**：欢迎页点击《用户协议》《隐私政策》会打开小程序内原生协议页（pages/agreement）展示完整内容，不依赖外部域名，无需 web-view。
- **H5 版本（可选）**：`docs/agreement/terms.html` 与 `docs/agreement/privacy.html` 为可部署的移动端 H5 页面（自包含、无外部依赖）。部署到 HTTPS 静态托管后，将真实地址填入 `config.js` 的 `AGREEMENT.TERMS_URL / PRIVACY_URL`，原生协议页底部即显示可复制的浏览器链接；未配置时功能不受影响。
- **不要填写虚假地址**（如 fake.com / example.com）；如在小程序内用 web-view 展示 H5，还需在微信公众平台后台配置「业务域名」白名单（可选项，非必需）。

### 5. 微信公众平台后台（需手动完成，代码无法替代）

- **用户隐私保护指引**：登录 [mp.weixin.qq.com](https://mp.weixin.qq.com) → 设置 → 基本设置 → 服务内容声明 → 用户隐私保护指引，填写并发布。建议内容（与本小程序实际行为保持一致）：
  - 本小程序未调用任何微信隐私接口：不获取手机号、微信头像、微信昵称、位置、通讯录、相册、麦克风、摄像头、人脸信息等敏感个人信息；
  - 本小程序无需注册、无需登录，用户同意协议后即可直接使用全部功能；
  - 收集的信息：用户主动填写的健身数据（昵称可选、性别、年龄、身高、体重、体脂率、身体围度、训练记录、饮水记录、恢复记录、健身记忆等），存储于微信云开发数据库，按用户 openid 隔离、仅本人可见；本地缓存使用 wx.setStorageSync；
  - AI 健身助手对话内容经云函数发送至第三方大模型服务生成回答，系统对手机号/身份证/银行卡/邮箱等敏感信息自动过滤，不写入长期记忆。
- **业务域名（可选）**：如需在小程序内用 web-view 展示 H5 协议页，在「开发管理 → 开发设置 → 服务器域名 → 业务域名」添加你的 HTTPS 域名并上传校验文件。

### 6. 运行

导入项目 → 编译 → 模拟器运行。真机预览需在开发者工具中打开「真机调试」或上传体验版。

---

## 十三、测试要点

### 训练

- 未填资料 → 引导填写；填资料后生成今日训练
- 点【已完成】→ 进度 +1、状态持久化；切页/重启后仍显示已完成
- 重复点击不产生重复记录（幂等）；点【未完成】可取消
- 未完成/已完成筛选各自正确；全部完成显示 100% 🎉
- 🍀 智能推荐：修改资料后点击，计划按新资料重新生成
- 编辑计划：勾选/休息/清空所有/保存空计划回退智能推荐
- **开始训练**：进入训练记录页，计时器开始/暂停/继续/结束正常，结束时记录总时长
- **每组记录**：输入重量/次数/RPE/力竭/休息秒 → 添加训练组；组列表按序展示；可删除任意一组
- **组间休息**：添加组后自动倒计时（动作默认休息秒数），显示剩余时间；「跳过休息」或倒计时结束可继续添加下一组
- **完成动作**：标记已完成并写入备注；进度实时更新；动作卡片显示「✓ 已完成」
- **添加动作**：从动作库（exercises 集合）按分类选择补充动作，不重复添加已存在动作
- **自动保存**：训练中退出页面/杀进程 → 训练页出现「继续上次训练」卡片，进入后草稿完整恢复（组数/备注/计时器状态）
- **兼容旧数据**：旧版快速勾选的完成记录（无每组明细）可正常展示并继续补充明细；旧记录不影响统计/AI
- 训练详情页进度与训练页一致，切换状态双向同步

### 饮水

- 设置 8 杯×250ml → 目标 2000ml；喝一杯 +1 杯
- 历史按日期倒序汇总；修改目标不影响历史日期统计（快照生效）
- 删除记录 → 当天统计实时重算；状态三档（已完成/进行中/未完成）正确

### 体重

- 同一天重复记录自动更新；30 天曲线正确；删除后曲线/统计更新

### 数据中心

- 同一天多次训练算 1 次；周/月/累计正确；饮水月均 = 总量÷已过天数

### AI 教练

- 今日训练/无器械/20 分钟/帮我记录等场景回答正确，动作全部来自动作库
- 工具轨迹显示调用过程；断网/无 Key 时回退本地规则推荐
- 保存记录后 `workout_records` 出现真实动作记录（动作 _id 必须真实存在，编造动作被拒）
- 「我上次卧推多少 / 卧推有没有进步 / 今天卧推做多重 / 我的最佳是多少」等分析类问题：调用分析工具返回真实数据；建议重量/次数来自 `getLastPerformance.suggestion`（数据推算），AI 不编造数字

### 训练表现分析

- PR 计算：最大重量 / 最大次数 / 最大容量正确（容量 = Σ 重量×次数，同组时 = 重量×次数×组数）
- 日期边界：最近 7/30 天统计含今天、排除更早记录；同一天多次训练不重复（唯一键）
- 数据变更：写入/修改训练记录后，分析缓存立即失效（5 分钟 TTL 兜底）
- 旧数据兼容：v1 无 `set_records` 的记录 maxWeight/volume 为 0，不影响 PR 与建议判断（建议基于可量化记录）
- 新 PR 反馈：完成动作/完成训练时创造新纪录有 toast / 弹窗
- 动作历史页：PR、最近 vs 上次、建议、三张趋势图、最近列表渲染正确；无数据时显示引导

### 每日状态与训练状态判断

- 每日状态记录：滑杆 1-5 保存成功；同一天重复保存为更新（upsert 不重复）；历史可点击修改、可删除；openid 隔离
- 首页「欣一今日建议」：未记录时显示引导入口；记录后显示评分与建议；训练/恢复/饮水建议随数据变化刷新
- 状态判断规则：睡眠差+疲劳高+连续训练 3 天 → REDUCE；明显疲劳+连续高强度 → RECOVERY；状态正常 → NORMAL；连续 7 天+容量下降 → REST（mock 验证通过）
- 疼痛检测：备注含「痛/疼/伤/扭/不适」等关键词 → 状态转 RECOVERY 并给出停止相关动作、咨询专业人士的安全建议，不做医疗诊断
- 缓存：恢复记录保存/删除后今日/历史/近期缓存立即失效，首页建议同步刷新

### 长期健身记忆

- 无记忆的旧用户：getFitnessMemory 返回空结构，页面显示空态，AI 正常回答，不报错
- 保存/更新/删除：整条 upsert、区块局部更新与追加（goals 更新时自动记录历史目标）、整条/区块删除均正常
- 保存条件：AI 只在长期价值/明确偏好/稳定习惯/用户要求时保存（prompt 约束）；一次性信息不保存
- 敏感信息：手机号/身份证/银行卡/邮箱/密码/住址等被拦截或剔除（前后端双重过滤，mock 验证通过）
- 「欣一记住的事情」页：查看/修改（chips 增删、文本编辑、频率/时长选择）/删除（单项 + 清空）正常
- openid 隔离：不同用户记忆互不可见

### 训练周期

- 创建：目标/周数（4/6/8）/名称创建成功；模板基于自定义周计划（无则智能推荐）；同一时间只有 1 个活跃周期
- 优先级：有活跃周期时今日训练来自周期（训练页显示「周期计划 · 第 X/Y 周」横幅）；无周期时回退自定义/规则（week_plan 不破坏）
- 边界（mock 验证通过）：周窗口跨月（第 4 周 [1-26, 2-01]）、跨年（[12-29 起第 2 周 = 1-05]）；当前周（开始次日=第1周、7天后=第2周、15天后=第3周）；周期到期（结束日=昨天 → over）与惰性完成
- 渐进：第 1-2 周基准、3-4 周 +1 组 +5%、5-6 周 +2 组 +10%、7-8 周封顶 +15%；减脂不加重量；减量周 -1 组 -20%（6 周 → 第 3 周、8 周 → 第 4 周、4 周不插）
- 周总结：查看周期页时补生成已结束周；统计（训练天数/完成率/容量/PR/体重/饮水/恢复）程序计算；完成率<70% 提示缺席、疼痛/疲劳提示恢复、容量对比上周
- 周期总结：周期结束后生成完成率/总容量/纪录数/体重变化/表现变化 + 下周期建议
- AI：getTrainingCycle 返回程序统计数据，AI 只解释；无周期如实引导创建

### 健身档案 / 成就 / 数据管理

- 档案统计：周/月/累计次数（mock 验证）、近7天完成率、总容量、平均时长、PR 数（按动作 weight/reps/volume 三项）正确
- 体重 30/90 天变化：按窗口首末条计算；饮水连续达标按日序列最长段；恢复均值正确
- 趋势序列：近 30 天每日补零；每日新 PR 按"当天 vs 此前"严格大于统计
- 成就：程序检测自动解锁（首次训练/10 次/连续 7 天/首个 PR 等），未解锁显示进度；新解锁 toast 提示
- 身体围度：每天一条 upsert，可修改/删除；档案页展示最新围度与腰围趋势
- 导出：JSON 全类型 / 单类型 CSV（BOM + 转义）；分享文件，低版本回退提示路径
- 导入：格式校验（format 标识）；按唯一键（日期/动作/时间水量）跳过重复；剥离 openid 强制当前用户；写入失败自动回滚本次新增；已有数据不被覆盖
- AI 数据分析：getFitnessReport 返回程序统计（容量趋势 up/flat/down、体重变化、恢复均值），AI 只解释

### 安全与性能

- 换账号登录互不可见对方数据（openid 隔离）
- 切换 Tab 秒开（缓存生效）；数据变更后立即刷新（缓存失效）
- 悬浮球拖拽/点击/位置记忆正常；AI 页不显示悬浮球
- 欢迎页：未勾选协议不可进入；勾选后下次进入回显

### 静态校验

- 改动后运行 `pwsh tools/check-project.ps1`，确认 PASS（JSON/WXML/WXSS/资源引用）

---

## 十四、项目历史与演进

- **需求阶段**：`PROJECT_REQUIREMENTS.md` 定义完整需求（MVP → 规则推荐 → AI Agent），按 Phase 1-15 分阶段开发
- **登录体系演进**：曾实现微信快捷登录 + 手机号授权登录（含本地 mock 服务、后端 server/）。因个人主体账号无「获取手机号」权限（`getPhoneNumber:fail no permission`），且用户无意申请企业主体，**已整体移除登录与后端**，改为欢迎页模式：勾选协议直接进入，数据层全部走微信云开发
- **UI 重构**：按 `design/ui-reference.png` 完成卡通猫咪风格重构（design tokens、猫咪插画体系、TabBar 图标、周圆点、卡片化），详见 `UI_REFACTOR_PLAN.md`
- **跨端扩展**：工程为 multiPlatform 架构，含 `project.miniapp.json`（Android/iOS/HarmonyOS SDK 配置）与 `i18n/base.json`（跨端应用名「健身小助手欣一」），`miniapp/` 目录为跨端原生资源预留位

---

*本文档随项目迭代更新，与代码保持同步。*












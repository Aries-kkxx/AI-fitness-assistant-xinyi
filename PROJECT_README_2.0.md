# 健身小助手欣一——项目说明书

> 本说明书以 `E:\Sport` 项目**实际代码**为最高依据编写，覆盖全部 24 个页面、4 个公共组件、14 个服务模块、10 个工具模块、云函数 aiCoach 与全部静态资源。文中标记含义：
>
> - 【已完成】功能已实现且可用；【部分实现】只实现了部分能力；【计划功能 / 未实现】规划中但代码不存在；【待确认】无法从代码确定。
>
> 生成日期：2026-08-27（与代码库最新提交同步）。

---

## 1. 项目概述

| 项 | 内容 |
|---|---|
| 项目名称 | 健身小助手欣一（代码工程名：AI-fitness-assistant / Sport） |
| 应用类型 | 微信小程序（原生 WXML / WXSS / JavaScript） |
| AppID | `wxb234666c120487ef`（正式版，**个人主体**） |
| 基础库版本 | `3.17.1`（project.config.json `libVersion`） |
| 工程架构 | `multiPlatform`（微信小程序 + miniapp 跨端配置：Android / iOS / HarmonyOS） |
| 后端 | 微信云开发 CloudBase（云数据库 + 云函数，无自建服务器） |
| 页面数量 | **24 个页面**（app.json `pages` 注册），其中 5 个为底部 TabBar 页 |
| 数据集合 | 云数据库 14 个集合 |
| AI 能力 | 云函数 aiCoach（LLM Agent，23 个工具 + Function Calling，默认 DeepSeek deepseek-chat） |
| 用户体系 | **无登录 / 无注册**：欢迎页模式，勾选协议后直接进入（个人主体账号无获取手机号权限） |

**一句话定位**：面向个人健身用户的「训练 + 动作 + 饮水 + 体重 + 数据统计 + AI 指导」一体化健身管理小程序，全部数据按用户 openid 隔离存储于微信云开发，主打可爱、轻松的卡通猫咪风格。

---

## 2. 项目背景

- **需求来源**：`PROJECT_REQUIREMENTS.md`（原始需求文档，已被 git 删除但仍存在于早期提交中）按 Phase 1–15 分阶段定义了从 MVP → 规则推荐 → AI Agent 的完整演进路径。
- **登录体系演进**：项目早期实现过微信快捷登录 + 手机号授权登录（含本地 mock 服务与 server/ 后端）。因**个人主体账号无「获取手机号」权限**（`getPhoneNumber:fail no permission`）且不申请企业主体，**登录与后端已整体移除**，改为「欢迎页模式」：勾选协议直接进入，数据层全部走微信云开发。`app.js`、`config.js`、`pages/login` 的注释均明确记录了这一点。
- **UI 演进**：按 `design/ui-reference.png` 视觉参考完成「卡通猫咪健身风格」重构（设计令牌、猫咪插画体系、TabBar 图标、卡片化），详见 `design/UI_REFACTOR_PLAN.md` 与根目录 `app.wxss`。
- **历史教训**（`.workbuddy/memory/`）：悬浮球曾改用 movable-view 后又改为手动 touch 事件实现（当前代码为 touch 事件方案）；猫咪图片曾因 `{{}}` 模板拼路径 + 打包过滤导致体验版空白，通过 `project.config.json` 的 `packOptions.include` 强制打入 `assets/cat` 修复。
- **AI 密钥安全**：历史上曾将 DeepSeek API Key 硬编码进代码并入库泄露，已移除；当前密钥只允许存在于云函数环境变量 `AI_API_KEY`。

---

## 3. 产品定位

### 3.1 目标用户
个人健身用户（本人家用场景）。**不是面向大众的商业化产品**：当前版本不需要手机号登录及复杂用户认证体系，以个人用户本地使用为主要场景。

### 3.2 核心价值
1. **个性化训练推荐**：无需教练，按「目标 / 经验 / 频率 / 时长 / 器械」规则引擎生成每日训练与一周计划。
2. **训练全流程记录**：动作级完成状态 + 力量训练逐组明细（重量/次数/RPE/力竭/休息）+ 训练计时器 + 自动保存草稿。
3. **长期进步追踪**：个人 PR、渐进超负荷建议、趋势图、训练周期、健身档案、成就系统。
4. **生活习惯管理**：饮水目标与记录、体重曲线、每日身体状态（恢复度）记录。
5. **AI 健身教练**：基于真实数据（openid 隔离）的对话式指导，动作全部来自动作库，禁止编造。

### 3.3 设计基调
可爱、轻松、年轻化、卡通运动风格。橘白卡通猫「欣一」是全站核心视觉资产（插画、TabBar、悬浮球、AI 头像）。

---

## 4. 产品功能架构

> 以下结构根据实际代码整理（页面路径为真实路径）：

```text
健身小助手欣一（健身小助手欣一）
│
├── 欢迎页（pages/login）                协议勾选 → 进入
│   └── 协议查看（pages/agreement）       用户协议 / 隐私政策原生展示
│
├── 首页（pages/index）〔Tab 1〕
│   ├── 欣一今日建议（身体状态/训练建议/恢复建议/饮水建议/总结，本地规则）
│   ├── 今日训练 Hero 卡（部位/动作数/时长/休息日）
│   ├── 今日饮水（已喝/目标/进度条 + 喝一杯/添加记录）
│   ├── 本周概览（训练次数/饮水达标天数）
│   ├── 我的身体数据（身高/体重/BMI/目标）
│   └── 体重趋势（30 天迷你曲线）
│
├── 训练（pages/workout）〔Tab 2〕
│   ├── 本周计划（周一~周日圆点，今天高亮/完成打勾/休息置灰）
│   ├── 今日训练（周期计划 > 自定义周计划 > 规则推荐）
│   ├── 动作完成状态（已完成/未完成 幂等持久化）
│   ├── 训练记录编辑（pages/workout-detail）：计时器 + 逐组明细 + 草稿自动保存
│   ├── 自定义周计划编辑（pages/week-plan-edit）
│   ├── 动作库跳转（Tab 3）与训练周期入口
│   └── 动作历史与表现分析（pages/exercise-history）：PR/最近vs上次/建议/趋势图
│
├── 动作（pages/exercise）〔Tab 3〕
│   ├── 推荐（按资料过滤）/ 全部 / 9 大分类 共 11 个 Tab
│   └── 动作卡片 → 动作历史页（PR 与表现分析）
│
├── 饮水（pages/water）〔Tab 4〕
│   ├── 今日统计（已喝/目标/杯数/完成率/进度条）
│   ├── 喝一杯 / 添加记录（pages/water-add）
│   ├── 饮水设置（pages/water-setting：杯数×容量=每日目标）
│   ├── 历史记录（pages/water-history，按日汇总 + 分页）
│   └── 历史详情（pages/water-history-detail，删除实时重算）
│
├── 我的（pages/profile）〔Tab 5〕
│   ├── 我的资料（pages/user-info：资料表单 + BMI + 同步当天体重）
│   ├── 健身档案（pages/stats）：训练/体重/身体/饮水/恢复五维统计 + 6 类趋势图 + AI 分析 + 成就 + 数据管理入口
│   │   ├── 身体围度（pages/body-measure）
│   │   └── 数据管理（pages/data-manage：导出 JSON/CSV、导入校验/防重/回滚）
│   ├── 欣一记住的事情（pages/fitness-memory：长期健身记忆 CRUD）
│   ├── 训练周期（pages/cycle + pages/cycle-create：4~8 周渐进周期）
│   ├── 体重记录（pages/weight：同日 upsert + 30 天曲线）
│   └── 饮水设置（pages/water-setting）
│
├── 每日状态（pages/recovery，首页今日建议入口）：睡眠/疲劳/酸痛/意愿/身体状态 1-5 滑杆
├── AI 健身教练（pages/ai，悬浮球入口）：云函数 Agent + 本地规则兜底
└── 全局 AI 悬浮球（components/float-ball，仅 5 个 Tab 页显示）
```

**功能完成情况总览**：见第 23 节《功能完成度》。

---

## 5. 页面结构

### 5.1 页面清单表（24 个页面）

| 页面名称 | 页面路径 | 页面用途 | 页面状态 | 入口 | 主要功能 | 数据来源 |
|---|---|---|---|---|---|---|
| 欢迎页 | pages/login | 启动落地页：协议勾选后进入 | 已完成 | 冷启动首屏（app.json pages[0]） | 协议勾选回显、打开协议页、reLaunch 进首页 | 本地 storage `agreed_terms` |
| 协议查看 | pages/agreement | 小程序内原生展示《用户协议》《隐私政策》 | 已完成 | login 页链接（?type=terms/privacy） | 按 type 渲染全文、动态导航标题 | JS 常量（无外部数据） |
| 首页 | pages/index | 今日总览门户 | 已完成 | login reLaunch / TabBar | 今日建议、今日训练、饮水、周概览、身体数据、体重趋势 | users/exercises/water_records/workout_records/weight_records/recovery_records（services 封装） |
| 训练 | pages/workout | 训练板块主页 | 已完成 | TabBar / index / cycle / stats / exercise-history | 周计划圆点、今日训练、完成状态切换、筛选、草稿恢复、智能推荐、编辑计划 | week_plan/training_cycles/exercises/workout_records（plan/recommend/workout service） |
| 训练记录编辑 | pages/workout-detail | 力量训练逐组记录 + 计时器 | 已完成 | workout（开始训练/继续草稿/点动作卡） | 计时器、逐组录入、组间休息倒计时、自动保存、PR 检测、追加动作 | workout_records/workout_sessions/exercises + 本地草稿 |
| 动作库 | pages/exercise | 动作浏览 | 已完成 | TabBar / workout | 推荐/分类 11 Tab、动作卡片、进历史页 | exercises（+users 资料过滤） |
| 动作历史 | pages/exercise-history | 单动作表现分析 | 已完成 | exercise / workout-detail（?id&name） | PR、最近vs上次、渐进超负荷建议、三趋势图、最近列表 | workout_records（utils/workout-analysis.js 计算） |
| 自定义周计划 | pages/week-plan-edit | 7 天 × 动作库勾选编辑 | 已完成 | workout「编辑计划」 | 按天勾选、设休息、清空、智能推荐预填、保存 | week_plan/exercises/users/recommend |
| 饮水 | pages/water | 饮水板块主页 | 已完成 | TabBar / index / stats / water-history 空态 | 今日统计、喝一杯、添加记录、删除 | water_settings/water_records |
| 添加饮水记录 | pages/water-add | 手动录入饮水 | 已完成 | water / index | 时间/水量/类型/备注 → 保存 | water_settings/water_records |
| 饮水设置 | pages/water-setting | 每日目标配置 | 已完成 | profile（注：water 页入口未绑定，见问题清单） | 杯数(1-30)×容量(50-1000)步进、目标计算、保存 | water_settings |
| 饮水历史 | pages/water-history | 按日汇总历史 | 已完成（**入口不可达**，见问题清单） | water.onGoHistory（WXML 未绑定） | 日期倒序汇总、分页、进详情 | water_records/water_settings |
| 饮水历史详情 | pages/water-history-detail | 单日明细 | 已完成 | water-history（?date） | 明细列表、删除实时重算、状态标签 | water_records/water_settings |
| 我的 | pages/profile | 个人中心 | 已完成 | TabBar | 用户摘要、6 项功能菜单 | users |
| 我的资料 | pages/user-info | 资料表单 | 已完成 | profile/index/ai/exercise/workout/workout-detail | 昵称/性别/年龄/身高/体重/目标/经验/频率/时长/器械、BMI 实时计算、保存同步当天体重 | users/weight_records |
| 体重记录 | pages/weight | 体重管理 | 已完成 | profile/index/stats | 录入（同日 upsert）、30 天曲线、历史删除 | weight_records |
| 身体围度 | pages/body-measure | 体脂率+5 围度 | 已完成 | stats | 每天一条 upsert、历史回填编辑、删除 | body_measurements |
| 健身档案 | pages/stats | 数据中心 | 已完成 | profile | 五维统计、6 趋势图、AI 分析、成就、数据管理入口 | 全集合聚合（services/archive.js） |
| 数据管理 | pages/data-manage | 导出/导入 | 已完成 | stats | JSON/CSV 导出分享、粘贴 JSON 导入（校验/防重/回滚/openid 剥离） | 全集合 |
| AI 健身教练 | pages/ai | AI 聊天 | 已完成 | 全局悬浮球 | 云函数 Agent 对话、工具轨迹、本地规则兜底、快捷问题 | users/exercises/water/workout（+云函数 aiCoach） |
| 每日状态 | pages/recovery | 身体状态记录 | 已完成 | index | 5 项滑杆、备注、历史修改/删除 | recovery_records |
| 欣一记住的事情 | pages/fitness-memory | 长期记忆 CRUD | 已完成 | profile | 五区块记忆编辑、敏感信息过滤、清空 | fitness_memory |
| 训练周期 | pages/cycle | 周期总览 | 已完成 | profile/stats/workout/cycle-create | 进度、本周计划、周总结、周期总结、创建/放弃 | training_cycles/training_cycle_weeks |
| 创建周期 | pages/cycle-create | 创建 4-8 周周期 | 已完成 | cycle | 目标/周数/名称、模板生成 | training_cycles/users/plan/recommend |

### 5.2 TabBar（5 项，原生）

| 文字 | 页面 | 图标（inactive / active） |
|---|---|---|
| 首页 | pages/index/index | assets/tabbar/home-inactive.png / home-active.png |
| 训练 | pages/workout/workout | workout-inactive.png / workout-active.png |
| 动作 | pages/exercise/exercise | exercise-inactive.png / exercise-active.png |
| 饮水 | pages/water/water | water-inactive.png / water-active.png |
| 我的 | pages/profile/profile | profile-inactive.png / profile-active.png |

未选中灰 `#888888`，选中绿 `#4CD964`，背景白，边框白。

---

## 6. 页面详细说明

> 每个页面按「定位 / 入口 / 布局 / 功能 / 组件 / 数据来源 / 用户操作 / 页面跳转 / 核心业务逻辑 / 页面状态 / 相关代码文件」描述。数据来源中的缓存键均已带实际存储前缀 `cache_`。

### 6.1 欢迎页（pages/login）

- **页面定位**：启动落地页（app.json 第一个页面）。无需登录，勾选协议后进入。
- **页面入口**：小程序冷启动首屏；全库无任何代码跳回本页（grep 确认）。
- **页面布局**：猫咪 Logo（`assets/cat/cat-avatar.png` 280rpx）→ 应用名「健身小助手欣一」+ 标语 → 进入提示 → 「进入小程序」按钮（未勾选 disabled）→ 底部协议勾选区 + 链接。
- **页面功能**：协议勾选/回显（storage）、打开原生协议页、校验后 reLaunch 首页。
- **页面组件**：无自定义组件（usingComponents 空）。
- **数据来源**：`config.STORAGE_KEYS.AGREED` = `agreed_terms`（wx.getStorageSync/setStorageSync）；无 services / 云调用。
- **用户操作**：`onToggleAgree`（勾选）、`onOpenTerms` / `onOpenPrivacy`（打开协议页）、`onEnter`（进入）。
- **页面跳转**：`wx.navigateTo('/pages/agreement/agreement?type=terms|privacy')`；`wx.reLaunch('/pages/index/index')`。
- **核心业务逻辑**：onLoad 回显上次同意状态；onEnter 未勾选 toast 拦截，已勾选写 `agreed_terms=true` 后 reLaunch（清空页面栈）。
- **页面状态**：默认未勾选（按钮灰化）；勾选后按钮恢复主色；未勾选点进入 → toast「请先阅读并同意用户协议和隐私政策」。
- **相关代码文件**：`pages/login/login.{js,wxml,wxss,json}`、`config.js`、`assets/cat/cat-avatar.png`。

### 6.2 协议查看页（pages/agreement）

- **页面定位**：小程序内原生协议页（不依赖外部域名 / web-view），正文硬编码于 JS 常量。
- **页面入口**：仅 login 页两处链接（?type=terms / ?type=privacy）。
- **页面布局**：页头（猫咪头像 + 动态标题 + 副标题）→ 章节循环（小标题 + 段落）→ 页脚「健身小助手欣一 · 更新日期：2026 年 8 月」。
- **页面功能**：《用户协议》8 章节 /《隐私政策》9 章节全文展示；`wx.setNavigationBarTitle` 动态标题。
- **数据来源**：无（JS 常量 `CONTENT`）。
- **核心业务逻辑**：onLoad 读 `options.type`，非 `'privacy'` 一律按 terms 处理。
- **页面状态**：静态阅读页，无加载/空/错误态。
- **相关代码文件**：`pages/agreement/agreement.{js,wxml,wxss,json}`。
- **注意**：`docs/agreement/terms.html`、`privacy.html` 为 H5 版本（部署用，不进小程序包）；若在 `config.js` 配置 `AGREEMENT.TERMS_URL/PRIVACY_URL`，本页底部会显示可复制链接（当前配置为空字符串，不生效）。

### 6.3 首页（pages/index）

- **页面定位**：今日总览门户，聚合展示建议、训练、饮水、概览、身体数据、体重趋势。
- **页面入口**：login reLaunch；TabBar 第 1 项；onShow 每次全量刷新。
- **页面布局**（自上而下）：问候区（Hi, 昵称 + home 猫）→「欣一今日建议」卡（状态徽章 + 身体状态 4 项 / 引导记录 + 训练建议 + 恢复建议 + 饮水建议 + 总结）→ 今日训练 Hero 卡（部位/动作数/分钟 + workout 猫 + 开始训练）→ 今日饮水卡（总量/目标 + 进度条 + water 猫 + 喝一杯/添加记录）→ 本周概览卡（训练次数/饮水达标天数 + calendar 猫）→ 我的身体数据卡（身高/体重/BMI/目标）→ 体重趋势卡（当前体重 + 30 天变化 + Canvas 迷你曲线）→ `<float-ball />`。
- **页面功能**：见 4 节架构图；快捷「喝一杯」；多入口导航。
- **页面组件**：`cat-illustration`（home/workout/water/calendar 姿态）；全局 `float-ball`；内置 canvas（type="2d"）。
- **数据来源**：`userService.getUser()`（cache_user，10min）、`recommendService.getTodayWorkout(user)`（cache_workout_today_<日期>_<资料签名>，24h）、`weightService.getWeightStats(30)`（cache_weight_stats，1h）、`waterService.getTodayStats()`（cache_water_today_<日期>，24h）、`workoutService.getWorkoutSummary()`（cache_workout_summary，1h）、`waterService.getHistorySummary()`（cache_water_history，1h）、`adviceService.getTodayAdvice()`（cache_home_advice，60s）。
- **用户操作**：`onDrinkOne`（喝一杯）、`onGoWater`/`onGoWaterAdd`/`onGoWorkout`/`onGoUserInfo`/`onGoRecovery`/`onGoWeight`。
- **页面跳转**：switchTab → water / workout；navigateTo → water-add / user-info / recovery / weight；悬浮球 → ai。
- **核心业务逻辑**：load() 四路独立加载（建议/饮水/周概览独立 try；用户+训练+体重共享 try）；BMI 预计算（calcBMI + getBMICategory 中国标准：<18.5 偏瘦 / <24 正常 / <28 偏胖 / 肥胖）；体重迷你曲线 `wx.nextTick` 后绘制；今日建议本地规则（见 9.5 节）。
- **页面状态**：各卡数据为 null 时隐藏或显示空态；四个加载失败路径均 console.error 后静默隐藏卡片；喝一杯成功 toast「已记录一杯」。
- **相关代码文件**：`pages/index/index.{js,wxml,wxss,json}`、`pages/index/index.skeleton.{wxml,wxss}`（未接入）、`services/{user,recommend,weight,water,workout,advice}.js`、`utils/{bmi,chart,date,training-state,cache}.js`。

### 6.4 训练页（pages/workout）

- **页面定位**：训练板块主页：今日训练 + 周计划 + 完成状态 + 训练记录入口。
- **页面入口**：TabBar 第 2 项；index.onGoWorkout、cycle.onGoWorkout、stats.onGoWorkout、exercise-history.onGoWorkout（均 switchTab）。
- **页面布局**：加载中 → 未填资料引导卡 → 标题区（success 猫）→ 本周计划圆点行（7 个，today/done/rest）→ 今日训练卡（休息日/训练日两态 + workout 猫）→ 周期横幅（有活跃周期时）→ 草稿恢复卡（有未结束草稿时）→ 未完成/已完成筛选 Tab → 开始训练按钮 → 动作列表（状态胶囊「未完成/已完成」可双向切换；已记录动作显示「3组 · 总容量720kg」摘要）→ 全部完成提示卡 → 编辑计划/智能推荐按钮 → `<float-ball />`。
- **页面功能**：今日训练解析（周期 > 自定义 > 规则）；动作完成/取消（幂等）；筛选；完成进度；草稿恢复入口；智能推荐覆盖 7 天计划；自定义计划编辑入口；周期信息横幅；资料引导。
- **页面组件**：`cat-illustration`（success/workout/empty/home）；全局 `float-ball`；内置 image。
- **数据来源**：`userService.getUser()`；`planService.resolveTodayWorkout(user)`（内部读 week_plan / training_cycles / exercises / recommend 规则引擎）；`workoutService.getTodayCompletedMap()`（cache_workout_completed_<日期>）；`workoutService.getTodayDraft()`（cache_workout_draft，7 天 TTL）；`workoutService.getWorkoutSummary()`（cache_workout_summary）。
- **用户操作**：`onGoUserInfo`、`onFilterChange`、`onToggleStatus`→`onMarkDone/onMarkUndone`、`onSmartRecommend`（modal 确认）、`onEditPlan`、`onGoExercises`、`onGoDetail`、`onStartTraining`、`onResumeTraining`、`onGoCycle`。
- **页面跳转**：navigateTo → workout-detail（?id= 点动作卡 / 无参开始训练 / 无参继续草稿）、week-plan-edit、user-info、cycle；switchTab → exercise。
- **核心业务逻辑**：onShow→load()；`updateProgress()` 计算完成数/百分比（按 workout.exercises 过滤 completedMap）；完成幂等（openid+workout_date+exercise_id 唯一键，已存在仅补字段）；取消完成置 completed:false 保留记录；「全部完成」判定用完成表条数与计划动作数比较（存在口径不一致，见问题清单）；智能推荐循环调用 `recommend.getDayWorkout(user, i)` 生成 7 天并保存 week_plan。
- **页面状态**：加载中文字；未填资料引导卡；筛选空态（empty 猫）；休息日隐藏动作区；完成 toast、全部完成「今日训练已完成 🎉」。
- **相关代码文件**：`pages/workout/workout.{js,wxml,wxss,json}`、`services/{plan,recommend,workout,user,cycle,exercise}.js`、`utils/{date,cache}.js`。

### 6.5 训练记录编辑页（pages/workout-detail）

- **页面定位**：力量训练明细记录页：训练计时器 + 逐动作逐组录入 + 自动保存草稿 + PR 反馈。自定义导航栏（navigationStyle: custom）。
- **页面入口**：仅 workout 页（onGoDetail 带 ?id / onStartTraining / onResumeTraining 无参）。
- **页面布局**：自定义导航（返回‹ / 标题「训练记录」/ 「自动保存中」）→ 计时器卡（状态徽标 idle/running/paused/ended + 大号时间 + 开始/暂停/继续/结束）→ 草稿恢复提示条 → 完成进度条 → 动作卡片列表（头部：序号/名称/计划组×次·休息/📊 历史按钮/状态徽标；组列表 set-row：第N组、重量×次数、RPE、力竭、休息秒、删除✕；展开编辑区：重量/次数/RPE/休息输入 + 力竭 switch + 添加训练组 + 完成动作 + 备注 textarea + 删除该动作今日记录）→ 添加动作面板（分类横向 scroll-view + 勾选列表）→ 组间休息倒计时固定横幅（跳过休息）→ 固定底部「完成训练」。
- **页面功能**：计时器（开始/暂停/继续/结束，自动统计总时长，前后台切换不虚增）；逐组记录（MAX_SETS=30 组上限，RPE 1-10，次数>0 校验）；添加/删除组；组间休息倒计时（到点震动 + toast，可跳过）；完成动作（补起止时间与耗时）；备注；删除该动作今日记录；从动作库追加动作（9 分类）；双通道自动保存（本地草稿 + 数据库 800ms 防抖）；草稿恢复；PR 检测（完成动作轻量 toast / 完成训练弹 modal）；旧 v1 数据兼容合并。
- **页面组件**：json 注册 `cat-illustration` 但 WXML 未使用（冗余）；内置 input/switch/textarea/scroll-view。
- **数据来源**：`userService.getUser()`；`workoutService.{getTodayDraft,saveDraft,clearDraft,getTodayRecords,upsertExerciseRecord,createWorkoutSession,updateWorkoutSession,deleteExerciseRecord,checkNewPR}`（workout_records / workout_sessions 集合；cache_workout_draft）；`planService.resolveTodayWorkout(user)`；`exerciseService.getAll()`（cache_exercises_all，24h）；`utils/workout-analysis.js` 纯函数计算。
- **用户操作**：`onBack`、`onStartSession`/`onPauseSession`/`onResumeSession`/`onFinishWorkout`、`onToggleEdit`、`onGoHistory`、`onDeleteExerciseRecord`、各输入 `onWeightInput/onRepsInput/onRpeInput/onRestInput/onNoteInput`、`onFailureChange`、`onAddSet`、`onDeleteSet`、`onCompleteExercise`、`onSkipRest`、`onToggleAddPanel`、`onCatChange`、`onAddExercisePick`、`onGoUserInfo`。
- **页面跳转**：navigateBack（返回训练页）；navigateTo → exercise-history（?id&name，📊 按钮）、user-info（引导）。
- **核心业务逻辑**：onLoad 读 id 存 `_highlightId`；load() 草稿优先（`status==='ended'` 视为异常重置会话但保留数据；active/paused 恢复并重锚 startedAt）；无草稿则 resolveTodayWorkout + getTodayRecords 合并旧记录；autoSave = 本地草稿同步 + 800ms 防抖 flushDbSave（_saving 防重入）；计时器 accumulatedMs 累计；onHide/onUnload 停表并 flushNow；完成训练 finishWorkout：停表→逐动作补起止/耗时→写会话（update completed 或 create）→逐动作 upsert→逐动作 checkNewPR（排除今日历史，严格大于）→清草稿→PR modal 或 toast→navigateBack。
- **页面状态**：加载中；未填资料引导；无动作空态；草稿恢复绿色提示条；休息倒计时横幅；各操作 toast/modal。
- **相关代码文件**：`pages/workout-detail/workout-detail.{js,wxml,wxss,json}`、`services/{workout,plan,user,exercise}.js`、`utils/{workout-analysis,date,cache}.js`。

### 6.6 动作库页（pages/exercise）

- **页面定位**：动作浏览：推荐 + 全部 + 9 分类共 11 个 Tab。
- **页面入口**：TabBar 第 3 项；workout.onGoExercises（switchTab）。
- **页面布局**：分类 Tab 横向 scroll-view（sticky）→ 推荐栏说明 banner / 未填资料引导卡 → 动作卡片列表（名称 + 推荐组×次 + 目标肌肉 + 难度/器械/休息标签 + 「查看训练记录与个人最佳 ›」）→ 空态 → `<float-ball />`。
- **页面功能**：推荐过滤（器械兼容 + 经验难度）；分类查询；点卡片进动作历史。
- **页面组件**：全局 float-ball；内置 scroll-view。
- **数据来源**：`exerciseService.initExercisesIfEmpty()`（幂等导入种子数据，标记 `exercises_init_done`）；`getRecommended()`（users + exercises 全量过滤，24h 缓存）；`getByCategory(category)`（exercises 集合按 sort 升序）。
- **用户操作**：`onTabChange`、`onGoUserInfo`、`onGoHistory`。
- **页面跳转**：navigateTo → exercise-history（?id&name）、user-info。
- **核心业务逻辑**：onLoad（async）先兜底 initExercisesIfEmpty 再 loadList；无 onShow 刷新（Tab 切换不重载）；推荐未填资料显示引导。
- **页面状态**：加载中；推荐引导 banner；分类空态「该分类暂无动作」；失败 toast。
- **相关代码文件**：`pages/exercise/exercise.{js,wxml,wxss,json}`、`services/{exercise,user,recommend}.js`、`data/exercises.js`。

### 6.7 动作历史页（pages/exercise-history）

- **页面定位**：单动作历史表现分析（自定义导航栏）。
- **页面入口**：exercise 动作卡 / workout-detail 📊 按钮（均带 ?id&name，encodeURIComponent）。
- **页面布局**：自定义导航（返回‹ + 动作名）→ 空态（empty 猫 + 去训练）或有数据：PR 卡（最大重量/最大次数/最大容量 3 列 + 达成日期）→ 最近一次 vs 上一次卡（3 行对比 + 趋势符号）→ 渐进超负荷建议卡（动作 + 依据 + 建议重量/次数/组数 + 接近 PR 警告）→ 三张趋势图卡（canvas 2d：重量/次数/容量）→ 最近训练列表卡（最多 10 条）。
- **页面功能**：PR 汇总；最近 vs 上次；数据依据建议；三趋势图；最近列表；空态引导。
- **页面组件**：`cat-illustration`（empty）；内置 canvas ×3。
- **数据来源**：`workoutService.getExerciseAnalysis(id, name)`（workout_records 全量升序最多 200 条；分析缓存 `workout_ana_analysis_<id>` 5min TTL + 注册表即时失效）；`utils/chart.js drawTrendChart`。
- **用户操作**：`onBack`、`onGoWorkout`。
- **页面跳转**：navigateBack；switchTab → workout（空态）。
- **核心业务逻辑**：onLoad 读 id/name → load()；prepareDisplay() 预计算展示字段；wx.nextTick 后 drawCharts()（三张 canvas 分别取 node 绘制）；趋势数据按「weight 仅 >0 点、reps/volume 全取」拆分。
- **页面状态**：加载中；无数据空态；失败 toast。
- **相关代码文件**：`pages/exercise-history/exercise-history.{js,wxml,wxss,json}`、`services/workout.js`、`utils/{workout-analysis,chart,cache}.js`、`cloudfunctions/aiCoach/analysis.js`（注释约定逻辑同步）。

### 6.8 自定义周计划页（pages/week-plan-edit）

- **页面定位**：周一~周日 × 动作库勾选的自定义计划编辑器。
- **页面入口**：仅 workout「编辑计划」。
- **页面布局**：周几选择 Tab（7 个，当前天高亮/休息置灰/已选数角标）→ 编辑卡（标题 + 清空所有 + 设为休息 switch）→ 休息日提示 / 训练日：已选摘要 + 分类横向 scroll-view + 动作勾选列表（圆形勾选框）→ 来源提示条（custom/recommend）→ 固定底部保存栏。
- **页面功能**：按天勾选/取消；设休息日；清空当天/全部；保存 upsert；智能推荐预填。
- **页面组件**：内置 switch、scroll-view。
- **数据来源**：`planService.getWeekPlanCustom()`（week_plan，cache_week_plan 1h；集合缺失 -502005 静默降级）；`exerciseService.getByCategory('')`（全量 24h 缓存）；`userService.getUser()`；`recommendService.getDayWorkout(user, i)`（不缓存）。
- **用户操作**：`onDayTap`、`onRestChange`、`onCatChange`、`onToggleExercise`、`onClearAll`（modal 确认）、`onSave`。
- **页面跳转**：保存成功 800ms 后 navigateBack。
- **核心业务逻辑**：onLoad 并行取自定义计划 + 全部动作；有计划且 days.length===7 回显（source=custom）；无计划且有资料用规则引擎逐天预填（source=recommend）；清空所有仅清 exercise_ids 保留 isRest；空计划保存后训练页回退智能推荐；集合缺失时保存抛 COLLECTION_NOT_EXIST 由页面提示建集合。
- **页面状态**：加载中；来源提示条；分类空态；保存成功 toast / 建集合提示。
- **相关代码文件**：`pages/week-plan-edit/week-plan-edit.{js,wxml,wxss,json}`、`services/{plan,exercise,user,recommend}.js`。

### 6.9 饮水页（pages/water）

- **页面定位**：饮水板块主页（天空蓝渐变背景）。
- **页面入口**：TabBar 第 4 项；index.onGoWater、water-history 空态「去记录」、water-history-detail「去记录」、stats.onGoWater（均 switchTab）。
- **页面布局**：页头（云朵装饰 + 「饮水」标题 + water 猫）→ 今日统计卡（大字 total/target ml + cups/dailyCups 杯 + 进度条 + 百分比 + 绿色「喝一杯」+ 橙色「添加记录」）→ 今日记录列表卡（时间/水量/类型/垃圾桶图标删除；空态 empty 猫 + 引导文案）→ `<float-ball />`。
- **页面功能**：今日统计；喝一杯（按 cup_ml 记录白水）；添加记录；删除（确认弹窗）；onShow 刷新。
- **页面组件**：`cat-illustration`（water/empty）；全局 float-ball；内置 image。
- **数据来源**：`waterService.{getTodayStats,getTodayRecords,getSettings,addRecord,deleteRecord}`（water_settings / water_records；cache_water_today_<日期> 24h；cache_water_settings 1h）。
- **用户操作**：`onDrinkOne`、`onAddRecord`、`onDelete`（catchtap + showModal 确认）。
- **页面跳转**：navigateTo → water-add（已绑定）；water-setting / water-history 的 `onGoSetting`/`onGoHistory` 已定义但 **WXML 未绑定**（见问题清单）。
- **核心业务逻辑**：仅 onShow→refresh()；Promise.all 并行取统计与列表；喝一杯 drink_type 硬编码「白水」；删除后 refresh（service 已失效缓存，统计实时重算）。
- **页面状态**：stats null 时统计卡隐藏；无记录空态；加载失败/记录失败 toast。
- **相关代码文件**：`pages/water/water.{js,wxml,wxss,json}`、`services/water.js`、`utils/{date,cache}.js`。

### 6.10 添加饮水记录页（pages/water-add）

- **页面定位**：手动录入一条饮水记录。
- **页面入口**：water「添加记录」/ index「添加记录」。
- **页面布局**：表单卡（时间 picker mode=time / 水量 input type=number / 类型 picker 4 选 1 / 备注 input）+ 固定底部保存栏。
- **页面功能**：时间选择（HH:mm）、水量输入、类型选择（白水/温水/茶/其他，`DRINK_TYPES`）、备注、校验保存。
- **页面组件**：内置 picker、input。
- **数据来源**：`waterService.getSettings()`（预填 cup_ml 为默认水量）、`waterService.addRecord()`。
- **用户操作**：`onTimeChange`、`onAmountInput`、`onTypeChange`、`onRemarkInput`、`onSave`。
- **页面跳转**：保存成功 800ms 后 navigateBack。
- **核心业务逻辑**：onLoad 预填时间=now、水量=设置杯容量；保存校验水量 > 0；`date` 恒为今天（`addRecord` 内部 formatDate(now)），无法补录历史日期。
- **页面状态**：水量非法 toast；保存中 showLoading；成功「添加成功」后返回。
- **相关代码文件**：`pages/water-add/water-add.{js,wxml,wxss,json}`、`services/water.js`。

### 6.11 饮水设置页（pages/water-setting）

- **页面定位**：每日饮水目标配置（杯数 × 容量）。
- **页面入口**：profile「饮水设置」菜单（water 页入口未绑定）。
- **页面布局**：设置卡（羊图标 + 标题 + 杯数步进器 −/N/＋ + 容量步进器 −/Nml/＋）→ 目标计算卡（「N 杯 × Mml = X ml/天」）→ 固定底部保存栏。
- **页面功能**：杯数 1-30、容量 50-1000（步长 50）钳制；实时重算每日目标；保存。
- **页面组件**：内置 view/text/image。
- **数据来源**：`waterService.getSettings()`（首次自动创建默认 8 杯×250ml=2000ml）、`saveSettings({daily_cups, cup_ml})`（service 二次校验范围 1-30 / 50-1000，目标=cups×ml）。
- **用户操作**：`onCupsMinus/Plus`、`onMlMinus/Plus`、`onSave`。
- **页面跳转**：保存成功 800ms 后 navigateBack。
- **核心业务逻辑**：目标快照联动——saveSettings 写 daily_target_ml；此后每条饮水记录快照当日目标，历史统计按快照还原（改目标不影响历史）。
- **页面状态**：默认 8/250/2000；保存成功/失败 toast；读设置失败保留默认值（存在误覆盖风险，见问题清单）。
- **相关代码文件**：`pages/water-setting/water-setting.{js,wxml,wxss,json}`、`services/water.js`。

### 6.12 饮水历史页（pages/water-history）

- **页面定位**：按日期倒序的每日饮水汇总（自定义导航栏，`navigationStyle: custom`）。
- **页面入口**：**仅 water.onGoHistory（WXML 未绑定 → 当前 UI 不可达，见问题清单）**。
- **页面布局**：自定义导航（返回‹ + 标题）→ 加载中 → 空态（empty 猫 + 去记录）→ 历史卡片列表（日期 + total/target ml + cups/dailyCups 杯 + rate% + 进度条 + 右下水杯图 + 状态徽章）→ 加载更多。
- **页面功能**：按日汇总展示；点击加载更多（每页 20 条）；点卡片进详情；空态引导。
- **页面组件**：`cat-illustration`（empty）；内置 image。
- **数据来源**：`waterService.getHistorySummary()`（water_records 翻页 max 2000 + water_settings 兜底目标；cache_water_history 1h）。
- **用户操作**：`onBack`、`onGoDetail`（data-date）、`onLoadMore`、`onGoWater`。
- **页面跳转**：navigateTo → water-history-detail（?date=）；switchTab → water；navigateBack。
- **核心业务逻辑**：getHistorySummary 按日期分组（target 取当天首条快照，无则当前设置；rate 不封顶；status=calcStatus），日期倒序；前端 slice 分页。
- **页面状态**：加载中文字；空态；失败 toast。
- **已知 Bug**：完成率徽章引用 `assets/icons/heart.png` 与 `flame.png`，**这两个文件不存在**（rate<100% 时图片必然加载失败）。
- **相关代码文件**：`pages/water-history/water-history.{js,wxml,wxss,json}`、`services/water.js`、`utils/db.js`。

### 6.13 饮水历史详情页（pages/water-history-detail）

- **页面定位**：某天全部饮水明细 + 统计（删除实时重算）。
- **页面入口**：仅 water-history（?date=YYYY-MM-DD）。
- **页面布局**：加载中 → 统计卡（date 标题 + 实际/目标 ml + 杯数/目标 + rate% + 进度条（>100 封顶 100）+ 状态标签：已完成绿/进行中橙/未完成灰）→ 明细卡（时间/水量/类型/备注 + 删除）+ 「去记录今天的饮水」按钮。
- **页面功能**：单日统计（目标快照还原）；明细删除实时重算。
- **页面组件**：无自定义组件。
- **数据来源**：`waterService.getDateStats(date)`（实时不缓存）、`deleteRecord(id)`。
- **用户操作**：`onDelete`（catchtap + showModal）、`onGoWater`。
- **页面跳转**：switchTab → water。
- **核心业务逻辑**：onLoad 校验 date 参数；删除成功调 load() 重算当天统计（service 已失效今日/月/历史缓存）。
- **页面状态**：加载中；参数缺失/加载失败 toast 后页面空白（无兜底 UI，见问题清单）。
- **相关代码文件**：`pages/water-history-detail/water-history-detail.{js,wxml,wxss,json}`、`services/water.js`。

### 6.14 我的页（pages/profile）

- **页面定位**：个人中心，6 项功能菜单入口。
- **页面入口**：TabBar 第 5 项。
- **页面布局**：用户信息卡（头像=昵称首字符或「客」+ 昵称/未填写 + 描述行「性别 · 年龄岁 · 目标 · 器械」+ 编辑›）→ 功能菜单卡（我的资料/健身数据中心/欣一记住的事情/训练周期/体重记录/饮水设置，每行宠物图标 + 名称 + ›）→ `<float-ball />`。
- **页面功能**：用户摘要；6 个入口导航。
- **页面组件**：全局 float-ball；内置 image。
- **数据来源**：`userService.getUser()`（cache_user 10min）。
- **用户操作**：`onGoUserInfo`、`onGoStats`、`onGoFitnessMemory`、`onGoCycle`、`onGoWeight`、`onGoWaterSetting`。
- **页面跳转**：navigateTo → user-info / stats / fitness-memory / cycle / weight / water-setting。
- **核心业务逻辑**：onShow→loadUser()（每次显示刷新）；getUser 失败回退过期缓存。
- **页面状态**：user null 时显示「客 / 未填写资料」；加载失败仅 console.error（静默）。
- **相关代码文件**：`pages/profile/profile.{js,wxml,wxss,json}`、`services/user.js`、`utils/cache.js`。

### 6.15 我的资料页（pages/user-info）

- **页面定位**：个人资料表单（训练推荐引擎输入源）。
- **页面入口**：profile（编辑›/我的资料）、index（填写资料）、ai（引导）、exercise（引导）、workout（引导）、workout-detail（引导）。
- **页面布局**：「基本信息」卡（哈士奇图标：昵称 input / 性别 picker / 年龄 input / 身高 input / 体重 input / BMI 实时预览 + 参考分类 + 「BMI 仅作参考」提示）→「训练偏好」卡（金毛图标：目标/经验/每周训练/每次时长/器械 5 个 picker）→ 固定底部保存栏。
- **页面功能**：资料回显；选项选择；BMI 实时计算；校验；保存并同步当天体重。
- **页面组件**：内置 input、picker。
- **数据来源**：`userService.{getUser,saveUser}`（users 集合；cache_user 保存后失效）；`weightService.addWeightRecord(weight)`（weight_records）；`utils/bmi.js`。
- **用户操作**：各 input `on*Input`、各 picker `on*Change`、`onSave`。
- **页面跳转**：保存成功 800ms 后 navigateBack。
- **核心业务逻辑**：onLoad 回显（选项用 indexOf 匹配，不匹配回落默认）；BMI=体重(kg)/身高(m)²（保留 1 位小数，非法 null）；保存校验：昵称非空、年龄 10-100、身高 100-250cm、体重 20-300kg；saveUser（已存在 update 否则 add，写 updated_at）→ 随后 addWeightRecord 记录当天体重（同一天覆盖当天记录，失败仅 console.error 不阻塞）。
- **页面状态**：各校验失败 toast；保存中 showLoading；成功「保存成功」。
- **相关代码文件**：`pages/user-info/user-info.{js,wxml,wxss,json}`、`services/{user,weight}.js`、`utils/bmi.js`。

### 6.16 体重记录页（pages/weight）

- **页面定位**：体重管理：录入 + 30 天曲线 + 历史管理。
- **页面入口**：profile / index / stats（均 navigateTo）。
- **页面布局**：「当前体重」卡（三花猫图标：大字当前体重 + ↓/↑x kg 标签或「首次记录」+ 输入框）→ 固定底部「记录」栏 →「体重变化（近30天）」卡（可达鸭图标：canvas 2d）→「历史记录」卡（藏獒图标：日期/体重 + 删除）。
- **页面功能**：记录（同日 upsert）；当前体重与 30 天变化；Canvas 曲线；历史删除。
- **页面组件**：内置 canvas、input。
- **数据来源**：`weightService.{getWeightStats(30),addWeightRecord,deleteWeightRecord}`（weight_records；cache_weight_stats / cache_weight_range 1h，写删后失效）。
- **用户操作**：`onInput`、`onSave`（saving 防连点）、`onDelete`（catchtap + showModal）。
- **页面跳转**：无对外跳转。
- **核心业务逻辑**：同日 upsert（先查 {_openid,date} 存在 update 否则 add）；体重 20-300kg 校验、保留 1 位小数；delta=窗口内最早 vs 最新（仅一条为 null）；canvas 用 `drawWeightChart`（pixelRatio 缩放、4 网格线、每点标注 x.xkg）。
- **页面状态**：三处空态文案；保存/删除 toast；saving 按钮禁用。
- **相关代码文件**：`pages/weight/weight.{js,wxml,wxss,json}`、`services/weight.js`、`utils/{chart,date,db,cache}.js`。

### 6.17 身体围度页（pages/body-measure）

- **页面定位**：体脂率 + 腰/胸/臀/手臂/大腿围记录（每天一条，自定义导航栏）。
- **页面入口**：仅 stats「记录围度 ›」。
- **页面布局**：自定义导航（返回‹ + 标题「身体围度」）→ 表单卡（标题：今天的身体数据/编辑 YYYY-MM-DD + 「回到今天」按钮 + 体脂率 input（选填）+ 5 个围度 input + 保存 + 删除当天（有记录时））→ 历史记录卡（日期 + 摘要串，点击回填编辑）。
- **页面功能**：按日查看/编辑；保存 upsert（至少一项）；删除当天；历史回填；回到今天。
- **页面组件**：内置 input。
- **数据来源**：`services/body-measurement.js`：`getByDate` / `getHistory(30)` / `save` / `remove`（body_measurements 集合；cache_body_measurements_latest / cache_body_measurements_history_30 5min；写入失效 archive_stats）。
- **用户操作**：`onInput`（data-key）、`onSave`、`onDelete`、`onEditHistory`、`onBackToToday`、`onBack`。
- **页面跳转**：navigateBack。
- **核心业务逻辑**：save 前校验至少一项；服务层 clampNum（非负、体脂≤60、围度≤200、保留 1 位小数，非法转 null）；按 {_openid, date} upsert。
- **页面状态**：加载中；空态；保存/删除 toast；历史加载失败仅 console.error。
- **相关代码文件**：`pages/body-measure/body-measure.{js,wxml,wxss,json}`、`services/body-measurement.js`、`utils/{date,cache}.js`。

### 6.18 健身档案页（pages/stats）

- **页面定位**：个人健身成长档案：五维统计 + 6 类趋势图 + 成就 + AI 数据分析 + 数据管理入口（自定义导航栏，标题「健身档案」）。
- **页面入口**：仅 profile「健身数据中心」。
- **页面布局**：自定义导航 → 训练卡（柴犬图标 + 去训练›：本周/本月/累计次 + 近7天完成率 + 总容量 + 平均时长 + 个人纪录数）→ 体重卡（田园犬图标 + 记录›：当前体重 + 30/90 天变化 + 共记录 N 次）→ 身体卡（白猫图标 + 记录围度›：BMI/体脂率/腰围 + 胸臀臂腿围）→ 饮水卡（蓝猫图标 + 去喝水›：本月总量/日均/达标天数/最长连续达标）→ 恢复卡（黑猫图标 + 训练周期›：平均疲劳/睡眠/酸痛 + 不适天数）→ 趋势图卡（金毛图标：6 个胶囊 Tab + canvas 2d）→ 智能数据分析卡（无毛猫图标：开始分析 + 结果区）→ 个人成就卡（法斗图标：11 项网格 + N/M 已解锁）→ 数据管理卡（腊肠犬图标：导出/导入）。
- **页面功能**：五维统计（全部 `services/archive.js` + `utils/archive-math.js` 程序计算）；6 类趋势（体重/训练容量/训练次数/新PR/饮水/腰围，近 30 天）；AI 数据分析（云函数 aiCoach getFitnessReport）；成就解锁；入口导航。
- **页面组件**：内置 canvas；无自定义组件。
- **数据来源**：`archiveService.getArchiveStats()`（cache_archive_stats 5min）、`getAchievements()`（cache_archive_achievements 1h）；聚合 workout_records/weight_records/water_records/recovery_records/body_measurements/training_cycles/achievements/users。
- **用户操作**：`onBack`、`onTrendTap`、`onAiAnalyze`、`onGoWorkout`/`onGoWater`/`onGoWeight`/`onGoBodyMeasure`/`onGoDataManage`/`onGoCycle`。
- **页面跳转**：switchTab → workout / water；navigateTo → weight / body-measure / data-manage / cycle；navigateBack。
- **核心业务逻辑**：onShow→load()：Promise.all([getArchiveStats, getAchievements])；新解锁成就弹「🏆 解锁成就」toast + nextTick 画图；统计口径见 9.6 节；onAiAnalyze 调 `wx.cloud.callFunction({name:'aiCoach', data:{userText:固定文案}, timeout:60000})`。
- **页面状态**：整体 loading；各卡空态；trendEmpty 提示；AI 加载中禁用；成就 toast。
- **相关代码文件**：`pages/stats/stats.{js,wxml,wxss,json}`、`services/{archive,body-measurement,user}.js`、`utils/{archive-math,chart,workout-analysis,training-state,db,date,cache}.js`。

### 6.19 数据管理页（pages/data-manage）

- **页面定位**：数据导出（JSON/CSV 分享文件）与导入（粘贴 JSON，校验/防重/回滚/openid 剥离）（自定义导航栏）。
- **页面入口**：仅 stats「导出/导入数据」。
- **页面布局**：自定义导航 →「导出数据」卡（7 个类型 chips 多选：全部/训练/饮水/体重/围度/恢复/AI 记忆 + 格式 picker（JSON 推荐/CSV 仅单类型）+ 导出按钮）→「导入数据」卡（说明 + textarea maxlength 500000 + 校验并导入按钮 + 导入预览）。
- **页面功能**：多类型 JSON 导出；单类型 CSV（BOM + 转义 + volume 补算）；`wx.shareFileMessage` 分享（失败降级显示路径）；导入校验预览 + 确认（防重/回滚/剥离 openid）。
- **页面组件**：内置 picker、textarea。
- **数据来源**：`services/data-transfer.js`：`buildExport` / `parseExport` / `importData`；读取 6 类集合；写入 db.collection().add（自动注入当前 openid）；AI 记忆导入走 `fitness-memory.saveFitnessMemory` 合并 upsert。
- **用户操作**：`onTypeTap`、`onFormatChange`、`onExport`、`onImportText`、`onPreviewImport`、`onBack`。
- **页面跳转**：navigateBack。
- **核心业务逻辑**：导出 JSON 结构 `{app:'健身小助手欣一', format:'fitness-xinyi-export', version:1, exported_at, types, data}`；cleanRecord 剥离 _id/_openid/openid/created_at/updated_at；导入按类型逐条：唯一键防重（workout: workout_date|exercise_id；water: date|drink_time|amount_ml；weight/body/recovery: date）→ 必填校验 → sanitizeForWrite（布尔化/NaN 丢弃/深拷贝/补 data_version:2）→ add；外层 catch 逆序删除本次已写文档（回滚）。
- **页面状态**：导出/导入中 showLoading；成功 toast / fallback modal；格式校验失败 modal；导入完成 modal「新增 X 条，跳过重复 Y 条」。
- **相关代码文件**：`pages/data-manage/data-manage.{js,wxml,wxss,json}`、`services/{data-transfer,fitness-memory}.js`、`utils/db.js`。

### 6.20 AI 健身教练页（pages/ai）

- **页面定位**：AI 聊天页（导航栏标题「欣一」）。
- **页面入口**：唯一入口为全局悬浮球 float-ball 点击（HIDDEN_PAGES 不含 ai 的页面可见）。
- **页面布局**：未填资料横幅（去填写）→ 消息列表 scroll-view（用户气泡右 / AI 气泡左 + 工具轨迹 `⚙ 工具名` 小字 + 兜底标记「（AI 暂不可用，以下为本地规则推荐）」+ 发送中「正在思考...」+ 空消息时快捷问题区 5 个胶囊）→ 输入区（input confirm-type=send + 发送按钮）。
- **页面功能**：对话；云函数 Agent；工具轨迹展示；本地规则兜底；快捷问题；资料引导。
- **页面组件**：内置 scroll-view、input。
- **数据来源**：`wx.cloud.callFunction({name:'aiCoach', data:{userText, history}, timeout:60000})`；`userService.getUser()`、`recommendService.getTodayWorkout(user)`、`waterService.getTodayStats()`（兜底用）。
- **用户操作**：`onInput`、`onQuickTap`、`onSend`、`onGoUserInfo`。
- **页面跳转**：navigateTo → user-info（横幅）。
- **核心业务逻辑**：send()：trim/发送中拦截 → 追加用户消息 → 组装历史（user/ai 角色 slice(-10)）→ callFunction → 成功取 result.reply + result.toolLog，result.error 仅 console.warn；catch → buildFallbackReply 本地规则（关键词「练/训练/分钟/时间/器械/动作」→ 今日训练文案；「水」→ 今日饮水文案；无资料 → 引导填资料）。
- **页面状态**：快捷问题区；sending 禁用 + 思考气泡；失败兜底标记。
- **相关代码文件**：`pages/ai/ai.{js,wxml,wxss,json}`、`cloudfunctions/aiCoach/*`、`services/{user,recommend,water}.js`。

### 6.21 每日状态页（pages/recovery）

- **页面定位**：身体状态极简记录（约 10 秒）：睡眠/疲劳/酸痛/意愿/身体状态 5 项 1-5 滑杆 + 备注（自定义导航栏）。
- **页面入口**：仅首页「今日建议」卡两处（已记录显示恢复建议 / 未记录显示引导）。
- **页面布局**：自定义导航 → 表单卡（标题：今天的状态/编辑 YYYY-MM-DD + 回到今天按钮 + 5 个 slider（档位文案实时刷新）+ 备注 textarea + 保存 + 删除当天（有记录时））→ 历史记录卡（日期 + 摘要 + 删除）。
- **页面功能**：5 项评分滑杆；当日/历史日期保存（upsert）；历史查看/回填编辑/删除；回到今天。
- **页面组件**：内置 slider ×5、textarea。
- **数据来源**：`services/recovery.js`：`getRecoveryByDate` / `saveRecovery`（openid+date upsert，clampScore 1-5，note slice 200）/ `deleteRecovery` / `getRecoveryHistory(30)`（cache_recovery_history_30 5min）；保存/删除后 invalidateRecoveryCache 连带失效 `home_advice`。
- **用户操作**：`onSliderChange`（data-key）、`onNoteInput`、`onSave`、`onDelete`/`onDeleteHistory`、`onEditHistory`、`onBackToToday`、`onBack`。
- **页面跳转**：navigateBack。
- **核心业务逻辑**：onLoad 并行 loadForm(今天) + loadHistory()；保存到「正在编辑的日期」；删除当前编辑日期后重置表单；档位文案来自 `utils/training-state.js scoreText`（SCORE_LABELS）。
- **页面状态**：加载中；历史空态；保存/删除 toast；删除确认弹窗。
- **相关代码文件**：`pages/recovery/recovery.{js,wxml,wxss,json}`、`services/recovery.js`、`utils/{training-state,date,cache}.js`。

### 6.22 欣一记住的事情页（pages/fitness-memory）

- **页面定位**：长期健身记忆 `fitness_memory`（每用户 1 条）的查看/修改/删除（自定义导航栏）。
- **页面入口**：仅 profile「欣一记住的事情」。
- **页面布局**：自定义导航（返回‹ + 标题 + 清空）→ 说明卡（橘猫图标）→「训练偏好」卡（喜欢的训练方式/喜欢的动作/不喜欢的动作 chips + 训练时间 input + 训练时长 picker 30/45/60/90）→「训练习惯」卡（每周频率 picker 0-7 + 常见时间 input + 经常缺席日 chips + 常见模式 chips）→「身体反馈」卡（恢复慢部位/易疲劳动作 chips + 历史反馈列表）→「目标」卡（当前目标 input + 历史目标列表）→「AI 备注」卡 → 固定底部保存栏。
- **页面功能**：五区块记忆 CRUD；chips 增删；敏感信息过滤；全量保存；一键清空；空记忆降级。
- **页面组件**：内置 picker ×2、input ×6。
- **数据来源**：`services/fitness-memory.js`：`getFitnessMemory`（cache_fitness_memory 5min；无文档返回 EMPTY_MEMORY；查询失败降级空结构）/ `saveFitnessMemory`（合并 + normalize + upsert）/ `deleteFitnessMemory`；`utils/sensitive.js detectSensitive`（手机号 `\b1[3-9]\d{9}\b`、身份证 17 位数字+X、银行卡、邮箱、密码/账号）。
- **用户操作**：`onInputChange`、`onAddChip`、`onRemoveChip`、`onFieldInput`、`onDurationChange`、`onFrequencyChange`、`onRemoveNote`、`onSave`、`onClearAll`（modal 确认）、`onBack`。
- **页面跳转**：navigateBack。
- **核心业务逻辑**：前端预检（单条添加 + 全量保存双重 detectSensitive，命中 toast 拦截）；服务端 normalizeMemory 再次过滤（列表去重去空去敏感限 50 条、note 限 30 条、preferred_time 限 20 字、goals.current 限 50 字）；保存后回显服务端清洗结果。
- **页面状态**：加载中；chips 空态占位「如：...」；保存/清空/敏感拦截/去重 toast。
- **相关代码文件**：`pages/fitness-memory/fitness-memory.{js,wxml,wxss,json}`、`services/fitness-memory.js`、`utils/sensitive.js`、`cloudfunctions/aiCoach/memory.js`（同逻辑）。

### 6.23 训练周期页（pages/cycle）

- **页面定位**：4~8 周训练周期总览：进度、本周计划、周总结、周期总结、历史周期（自定义导航栏）。
- **页面入口**：profile「训练周期」/ stats「训练周期›」/ workout 周期横幅 / cycle-create 创建成功 redirectTo。
- **页面布局**：自定义导航（返回‹ + 标题 + ＋创建）→ 无活跃周期：空态卡（empty 猫 + 创建周期按钮）+ 历史周期卡；有活跃周期：周期卡（名称 + 状态徽章 + 目标·起止·每周 N 次 + 第 X/Y 周进度条 + 减量周提示条（羊图标）+ 放弃周期）→ 本周计划卡（副标题渐进调整文案 + 周一~周日摘要（今天橙色高亮/休息灰/训练日 N 个）+ 今日动作区（名称 + sets×reps + 建议重量 + 去训练›））→ 每周总结卡（可展开：训练 N 天/容量/PR/不适 + ai_summary 四行）→ 周期总结卡（完成率/天数/总容量/新纪录 + ai_summary）→ 历史周期卡。
- **页面功能**：周期进度；本周 7 天计划摘要；今日动作 + 建议重量；周/周期总结（程序计算 + 本地规则文案）；创建/放弃；历史列表。
- **页面组件**：`cat-illustration`（empty）；内置 image。
- **数据来源**：`services/cycle.js`：`getCycleWithSummaries()`（training_cycles + training_cycle_weeks；cache_cycle_active/cycle_list/cycle_detail/cycle_summaries 5min）、`getCycles()`、`getCurrentWeekPlan()`、`getTodayCyclePlan(cycle)`（exercises 集合 + workout.getLastPerformance 建议重量）。
- **用户操作**：`onBack`、`onGoCreate`、`onAbandon`（modal 确认）、`onGoWorkout`、`onToggleSummary`。
- **页面跳转**：navigateTo → cycle-create；switchTab → workout；navigateBack。
- **核心业务逻辑**：onShow→load()（Promise.all）；weekPercent=currentWeek/totalWeeks；isToday 判定 `((getDay()+6)%7)+1`；今日动作单独 try（失败不阻塞）。
- **页面状态**：加载中；空态 + 历史；放弃/操作 toast。
- **相关代码文件**：`pages/cycle/cycle.{js,wxml,wxss,json}`、`services/{cycle,plan,user,recommend,exercise,workout}.js`、`utils/{cycle-math,training-state,date,cache,db,workout-analysis}.js`。

### 6.24 创建周期页（pages/cycle-create）

- **页面定位**：创建 4-8 周训练周期（自定义导航栏）。
- **页面入口**：仅 cycle（导航栏 ＋创建 / 空态创建按钮）。
- **页面布局**：自定义导航 → 表单卡（提示：模板基于自定义周计划/智能推荐 + 周期目标 chips 单选（增肌/减脂/塑形/提升体能/保持健康）+ 周期长度 chips（4/6/8 周）+ 周期名称 input maxlength 20 + 四项功能说明）→ 固定底部创建栏。
- **页面功能**：目标/周数/名称选择；创建周期；能力说明。
- **页面组件**：内置 input。
- **数据来源**：`userService.getUser()`；`services/cycle.js createCycle({user, goal, totalWeeks, name, weeklyFrequency})`（模板：week_plan 自定义优先，否则 recommend.getDayWorkout 逐天生成；写 training_cycles + training_cycle_weeks 当前周占位）。
- **用户操作**：`onBack`、`onGoalTap`、`onWeekTap`、`onNameInput`、`onCreate`。
- **页面跳转**：创建成功 600ms 后 `wx.redirectTo('/pages/cycle/cycle')`（替换本页）。
- **核心业务逻辑**：onCreate：creating 防重入 → 无资料 toast 拦截 → name 默认 goal+'周期' → createCycle → toast → redirectTo。
- **页面状态**：默认增肌/8 周；creating 按钮禁用；创建失败 toast。
- **相关代码文件**：`pages/cycle-create/cycle-create.{js,wxml,wxss,json}`、`services/{cycle,plan,recommend,user}.js`、`utils/cycle-math.js`。

## 7. 组件系统

### 7.1 组件清单表

| 组件名称 | 文件位置 | 功能 | 输入参数 | 输出事件 | 使用页面 |
|---|---|---|---|---|---|
| cat-illustration（统一猫咪插画） | components/cat-illustration/* | 按 pose 加载 `assets/cat/cat-<pose>.png`，统一全站猫咪形象；支持形状/背景/动画 | `pose`(默认 home，白名单 11 个)、`size`(rpx，默认 200)、`shape`(none/circle/square)、`bg`(背景色)、`animate`(none/float/bounce) | 无 | index / workout / water / water-history / cycle / exercise-history（workout-detail 仅注册未使用） |
| float-ball（「欣一」AI 悬浮球） | components/float-ball/* | 可拖拽悬浮球，位置记忆（storage `floatBallPosV2`），点击跳转 AI 页；在 7 个 HIDDEN_PAGES 路由隐藏；底部与 tabBar 之间强制 ≥8px 留白 | 无（全局组件） | 无（内部 navigateTo） | 仅 5 个 Tab 页（index/workout/exercise/water/profile 的 WXML 含 `<float-ball />`） |
| cat-mascot（纯 CSS 橘白猫） | components/cat-mascot/* | 纯 CSS 绘制的橘白猫（stand/wave/drink/sleep 四姿态） | `pose`、`size`(默认 240)、`animate` | 无 | **无页面引用（历史组件，保留）** |
| section-title（区块标题） | components/section-title/* | 图标 + 标题 + 可选右侧链接 | `title`、`icon`(默认 🐾)、`link`、`border` | `linktap`（点击链接） | **无页面引用（历史组件，保留）** |

### 7.2 组件依赖关系

```
app.json 全局注册 float-ball
  └─ 仅 5 个 Tab 页 WXML 显式使用 <float-ball />
页面级 usingComponents 注册 cat-illustration
  └─ 7 个页面使用（pose 全部落在已存在素材：home/workout/water/success/empty/calendar）
cat-mascot、section-title：无页面引用，无依赖关系
```

> ⚠️ `cat-illustration` 白名单含 `back / leg / remind / ai` 四种 pose，但 `assets/cat/` 下**没有对应 PNG**（实际素材：avatar/home/workout/water/success/empty/calendar + cat_front_dumbbell/cat_plank 两张未接入组件），一旦页面使用这 4 个 pose 会 404【问题】。

---

## 8. 数据结构

### 8.1 本地存储（wx.setStorageSync / wx.getStorageSync）

**utils/cache.js 统一管理（键实际前缀 `cache_`，存 `{value, expire}` 结构，TTL 过期即删，读写失败静默降级）：**

| 存储键 | 数据内容 | TTL | 写入方 | 失效时机 |
|---|---|---|---|---|
| `cache_user` | 用户资料对象 | 10 分钟 | services/user.js | 保存资料后立即清除 |
| `cache_exercises_all` | 全部动作库数组 | 24 小时 | services/exercise.js | clearExerciseCache 手动清除 |
| `cache_workout_today_<日期>_<目标\|经验\|周频\|时长\|器械>` | 今日推荐训练 | 24 小时 | services/recommend.js | 跨天自动新键 / 资料变化新键 |
| `cache_workout_summary` | 训练统计 {week,month,total,dates} | 1 小时 | services/workout.js | 训练数据变更强失效 |
| `cache_workout_completed_<日期>` | 今日完成状态表 | 24 小时 | services/workout.js | 完成/取消后失效 |
| `cache_workout_draft` | 训练草稿（自动保存） | 7 天 | services/workout.js | 完成训练后清除 |
| `cache_workout_ana_<scope>_<id>_<suffix>` | 训练表现分析系列缓存 | 5 分钟 | services/workout.js | 数据变更时按注册表全部清除 |
| `cache_home_advice` | 首页今日建议聚合 | 60 秒 | services/advice.js | recovery/workout 写入后按约定键清除 |
| `cache_water_settings` | 饮水设置 | 1 小时 | services/water.js | 保存设置后清除 |
| `cache_water_today_<日期>` | 今日饮水统计 | 24 小时 | services/water.js | 记录增删后清除 |
| `cache_water_month` | 本月饮水统计 | 1 小时 | services/water.js | 同上 |
| `cache_water_history` | 历史饮水汇总 | 1 小时 | services/water.js | 同上 |
| `cache_weight_stats` | 体重统计（30 天曲线） | 1 小时 | services/weight.js | 记录/删除后清除 |
| `cache_weight_range` | 体重累计变化 | 1 小时 | services/weight.js | 同上 |
| `cache_week_plan` | 自定义周计划 | 1 小时 | services/plan.js | 保存后清除 |
| `cache_recovery_today` / `cache_recovery_history_<n>` / `cache_recovery_recent_<n>` | 恢复记录 | 5 分钟 | services/recovery.js | 保存/删除后清除（连带 home_advice） |
| `cache_fitness_memory` | 长期健身记忆 | 5 分钟 | services/fitness-memory.js | 保存/删除后清除 |
| `cache_cycle_active` / `cache_cycle_list` / `cache_cycle_detail` / `cache_cycle_summaries` | 训练周期数据 | 5 分钟 | services/cycle.js | 周期变更后清除 |
| `cache_body_measurements_latest` / `cache_body_measurements_history_<n>` | 身体围度 | 5 分钟 | services/body-measurement.js | 保存/删除后清除（连带 archive_stats） |
| `cache_archive_stats` | 档案聚合统计 | 5 分钟 | services/archive.js | 各 service 按约定键清除 |
| `cache_archive_achievements` | 成就列表 | 1 小时 | services/archive.js | invalidate 清除 |

**直接 wx storage（无前缀）：**

| 存储键 | 内容 | 写入方 | 说明 |
|---|---|---|---|
| `exercises_init_done` | 动作库初始化完成标记 | services/exercise.js | 避免每次启动重复 count 查询 |
| `floatBallPosV2` | 悬浮球位置 {x, y} | components/float-ball.js | 所有页面共享同一位置 |
| `agreed_terms` | 是否已同意协议 | pages/login | 欢迎页回显 |
| `token` / `userInfo` | 登录 token / 用户信息 | **无任何写入处** | config.js 预留声明，当前登录体系已移除 |

### 8.2 云数据库集合（14 个，需云开发控制台手动创建）

| 集合 | 用途 | 每用户条数 | 唯一键 | 权限 |
|---|---|---|---|---|
| `users` | 用户资料 | 1 | openid | 仅创建者可读写 |
| `exercises` | 动作库（公共数据，44 条） | 全库 1 份 | — | 所有用户可读，仅创建者可读写 |
| `workout_records` | 训练完成记录 + 力量明细 | 每天每动作 1 条 | openid+workout_date+exercise_id | 仅创建者可读写 |
| `workout_sessions` | 训练会话（计时器/时长） | 每次训练 1 条 | _id | 仅创建者可读写 |
| `water_settings` | 饮水设置 | 1 | openid | 仅创建者可读写 |
| `water_records` | 饮水记录（含目标快照） | 多条 | 无（导入去重 date+drink_time+amount_ml） | 仅创建者可读写 |
| `weight_records` | 体重记录 | 每天 1 条 | openid+date（同日 upsert） | 仅创建者可读写 |
| `week_plan` | 自定义周计划（7 天） | 1 | openid | 仅创建者可读写 |
| `recovery_records` | 每日恢复状态 | 每天 1 条 | openid+date（upsert） | 仅创建者可读写 |
| `fitness_memory` | 长期结构化记忆 | 1 | openid（upsert + 敏感过滤） | 仅创建者可读写 |
| `training_cycles` | 训练周期（4~8 周） | 1 active + 历史多条 | status: active/completed/abandoned | 仅创建者可读写 |
| `training_cycle_weeks` | 每周总结 | 每周期每周 1 条 | openid+cycle_id+week_no（幂等） | 仅创建者可读写 |
| `body_measurements` | 身体围度 | 每天 1 条 | openid+date（upsert） | 仅创建者可读写 |
| `achievements` | 已解锁成就 | 1 | openid（unlocked 数组 ≤100） | 仅创建者可读写 |

### 8.3 关键集合字段结构

**users（用户资料）**：`_openid`、`nickname`、`gender`、`age`、`height`(cm)、`weight`(kg)、`goal`（减脂/增肌/塑形/提升体能/保持健康）、`experience`（新手/初级/中级/高级）、`training_days`（1-7）、`training_duration`（30/45/60/90 分钟）、`equipment`（无器械/哑铃/杠铃/家庭器械/健身房）、`created_at`、`updated_at`。

**exercises（动作库，种子来自 data/exercises.js，44 条）**：`sort`、`name`、`category`（胸部/背部/肩部/手臂/腿部/臀部/核心/有氧/拉伸）、`target_muscle[]`、`difficulty`（初级/中级/高级）、`equipment`、`description`、`steps[]`、`common_mistakes[]`、`tips`、`recommended_sets`(2-4)、`recommended_reps`(1-30)、`reps_unit`(次/秒/分钟)、`rest_seconds`(0-90)、`image_url`('')、`video_url`('')。

**workout_records（训练记录，v2 主结构）**：`_openid`、`exercise_id`、`exercise_name`、`workout_date`、`plan_id`、`completed`、`completed_at`、`sets`/`reps`（旧字段，继续同步写入兼容 v1）、`planned_sets`/`planned_reps`（计划）、`actual_sets`、`set_records[]`（每组：`weight`/`reps`/`rpe`/`is_failure`/`rest_seconds`）、`note`、`started_at`/`ended_at`/`duration_minutes`、`session_id`、`data_version`(2)、`created_at`、`updated_at`。

**workout_sessions（训练会话）**：`_openid`、`workout_date`、`plan_id`、`parts_text`、`started_at`、`ended_at`、`duration_minutes`、`status`（active/paused/completed）、`created_at`、`updated_at`。

**water_settings**：`_openid`、`daily_cups`(1-30)、`cup_ml`(50-1000)、`daily_target_ml`(=cups×ml)。

**water_records**：`_openid`、`drink_time`(HH:mm)、`amount_ml`、`drink_type`（白水/温水/茶/其他）、`remark`、`date`、`daily_target_ml`（**目标快照**）、`daily_cups`（快照）、`created_at`。

**weight_records**：`_openid`、`weight_kg`(20-300，1 位小数)、`date`（同日 upsert）、`created_at`、`updated_at`。

**recovery_records**：`_openid`、`date`（每天唯一）、`sleep_quality`/`fatigue`/`soreness`/`motivation`/`body_status`（1-5）、`note`(≤200)、`created_at`、`updated_at`。

**fitness_memory**：`_openid`、`training_preferences`（preferred_training_styles[]/favorite_exercises[]/disliked_exercises[]/preferred_time/preferred_duration）、`training_habits`（weekly_frequency 0-7/common_time/often_missed_days[]/common_patterns[]）、`body_response`（slow_recovery_parts[]/easily_tired_exercises[]/feedback[]）、`goals`（current/history[]/updated_at）、`ai_notes[]`、`updated_at`。列表上限 50 条、note 上限 30 条、敏感信息一律剔除。

**training_cycles**：`_openid`、`name`、`goal`、`start_date`、`end_date`、`total_weeks`(4-8)、`weekly_frequency`、`status`、`weeks[]`（week_no/deload/adjust{sets_delta,reps_delta,weight_delta_pct}/days[{day,isRest,exercise_ids}]/note）、`final_summary`、`created_at`、`updated_at`。

**training_cycle_weeks**：`_openid`、`cycle_id`、`week_no`、`start_date`、`end_date`、`summary`（training_days/completion_rate/total_volume/pr_count/weight_change_kg/water_days/recovery/pain_detected）、`ai_summary`（performance/improvements/problems/next_week_advice）、`status`。

**body_measurements**：`_openid`、`date`、`body_fat_pct`（体脂率，选填，≤60）、`waist_cm`/`chest_cm`/`hip_cm`/`arm_cm`/`thigh_cm`（≤200）。

**achievements**：`_openid`、`unlocked[]`（{key, unlocked_at}）、`updated_at`。

**week_plan**：`_openid`、`days[7]`（{day:1-7, isRest, exercise_ids[]}）、`created_at`、`updated_at`。

### 8.4 数据读写方式

- **读**：services 层统一封装（查询显式 `where({_openid: '{openid}'})`，小程序端 `'{openid}'` 由云开发自动替换）；批量用 `utils/db.js getAllByWhere`（每页 20 条翻页，默认上限 500）。
- **写**：`add` / `doc(id).update` / `where().update` / `where().remove`；幂等键：训练 `openid+workout_date+exercise_id`、体重/恢复/围度 `openid+date`、记忆 `openid`（每用户 1 条）。
- **删除**：一律 `where({_id, _openid})` 双条件防越权。
- **生命周期**：训练记录/饮水记录/体重/恢复/围度按日期维度增长，个人使用量级下客户端翻页（上限 500）足够约 1-2 年；历史统计/趋势/导出超过上限会截断（README 提示届时改为云函数聚合）。

---

## 9. 核心业务逻辑

### 9.1 训练逻辑（完整链路）

```text
用户填资料（users）
  → planService.resolveTodayWorkout(user)   // 优先级：活跃周期计划 > 自定义周计划 > 规则引擎
  → 今日训练对象 { isRestDay, partsText, exercises[{_id,name,sets,reps,restSeconds,...}], totalMinutes, count }
  → workout 页展示 → 快速勾选完成/取消（幂等：openid+date+exercise_id）
     或 → workout-detail 开始训练（计时器 + 逐组录入 + 自动保存草稿）
  → 完成动作/完成训练 → upsertExerciseRecord / 会话写入 workout_sessions
  → checkNewPR（严格大于历史 PR，排除今日）→ toast/modal 反馈
  → 清草稿 → 返回训练页 → invalidateWorkoutCache 使统计/分析缓存失效
  → 首页/档案页 onShow 重新拉取 → 统计与建议更新
```

关键机制：
- **完成状态幂等**：`markExerciseCompleted` 先查 `{_openid, workout_date, exercise_id}`，已存在只补缺失字段（保留 set_records），不重复插入；`markExerciseIncomplete` 仅置 `completed:false` 保留记录。
- **训练草稿**：每次数据变更先写本地（`cache_workout_draft`，7 天 TTL）+ 800ms 防抖写库；`getTodayDraft` 校验 `workout_date` 为今天才恢复；杀进程后训练页显示「继续上次训练」。
- **计时器**：`accumulatedMs + (now - startedAt)` 走时；onHide 停表、onShow 恢复，前后台切换不虚增时长；结束写 `workout_sessions.duration_minutes`。
- **组间休息**：默认取动作 `rest_seconds`，倒计时归零震动 + toast，可跳过；休息中禁止添加组。
- **PR 检测**：容量 = Σ(重量×次数)；三档 PR（最大重量/最大次数/最大容量）严格大于才算新纪录；完成动作轻量 toast、完成训练弹「🎉 新个人纪录」modal。
- **旧数据兼容**：v1 记录无 `set_records/planned_*` 时读取端回退 `planned_sets || sets` 等；旧字段 sets/reps 继续同步写入。

### 9.2 饮水逻辑

```text
getSettings（首次自动建默认 8杯×250ml=2000ml/天）
  → 喝一杯：addRecord({drink_time=now, amount_ml=cup_ml, drink_type='白水'})
     或 手动添加（时间/水量/类型/备注）
  → 每条记录快照当日 daily_target_ml / daily_cups
  → 今日统计：total/cups/target/percent(=min(100, round(total/target*100)))/remain
  → 历史：getHistorySummary 按日分组（目标取当天首条快照，无则回退当前设置），rate 不封顶，日期倒序
  → 状态分档 calcStatus：rate≥100 已完成（绿）；当天未达标 进行中（橙）；过去未达标 未完成（灰）
  → 删除记录：invalidateWaterCache 清今日/月/历史缓存 → 页面重新加载实时重算
```

### 9.3 训练统计

- **训练次数**：按 `workout_date` 去重计数（同一天多次训练算 1 次）；周=本周一至今天、月=月初至今天、累计=全部。
- **完成率**（档案页）：近 7 天实际训练天数 ÷ 每周计划次数（用户 training_days，缺省 3），封顶 100%。
- **容量**：Σ(每组重量×次数)；**平均时长**：有 duration_minutes 记录的平均值。
- **PR 数**（档案页）：按动作分组后三档 PR 项数合计。
- **连续训练**：从今天往回数 `dateSet[cur]` 存在的天数（getTrainingLoadStats）。
- **训练状态**：NORMAL / REDUCE / RECOVERY / REST 判定（见 9.5）。
- **趋势**：容量趋势 = 前后半段日均比（>1.05 up / <0.95 down / 否则 flat，至少 4 个点）。

### 9.4 日期逻辑

- **统一格式**：`YYYY-MM-DD`（本地时区），`HH:mm` 饮水时间。
- **今日判断**：`formatDate(new Date())` 与存储日期字符串比较；训练/饮水/恢复/体重/围度均按日期字符串隔离「今天」。
- **周一为一周起点**：`getMondayDate`（`getDay()||7` 周日转 7）；训练推荐 `weekdayIndex = (getDay()+6)%7`。
- **跨天处理**：今日训练缓存键含日期（跨天自动新键）；饮水今日统计缓存键含日期；草稿跨天视为无效；恢复记录按日期 upsert。
- **月/周统计**：getMonthStartDate('YYYY-MM-01')、getMondayDate 计算窗口；周窗口内按字符串比较（字典序=时间序）。
- **周期周窗口**：`getWeekRange(start, weekNo)` = [start+(n-1)*7, start+n*7-1]，跨月/跨年安全（parseDate 用 '-'→'/' 兼容 iOS）。
- **数据重置**：无定时重置机制；统计按窗口实时计算；「跨天」即自然重置当日视图。

### 9.5 训练状态判断与今日建议（本地规则，不依赖 AI）

`utils/training-state.js computeTrainingState` 输入：今日恢复记录 + 连续训练天数 + 近 7 天训练天数 + 容量趋势 + 疼痛备注。风险分：
- 疲劳 ≥5 → +2 / ≥4 → +1；睡眠 ≤2 → +1；酸痛 ≥4 → +1；意愿 ≤2 → +0.5；
- 连续训练 3/4/5/6/≥7 天 → +0.5/1/1.5/2/3；容量下降 → +1；
- **疼痛关键词命中（痛/疼/伤/扭/拉伤/不适/疼痛/受伤/酸疼/崴）→ 直接 RECOVERY**。

状态判定：RECOVERY(pain) > REST(risk≥4) > RECOVERY(risk≥3) > REDUCE(risk≥2) > NORMAL。
首页「欣一今日建议」= 用户资料 + 今日恢复 + 训练负荷 + 饮水统计 → 训练/恢复/饮水建议 + 一句话总结（`buildTodayAdvice`，60 秒聚合缓存）。**医疗边界**：检测到疼痛只给停止相关动作、降低负荷等安全建议并建议咨询专业人士，不做医疗诊断。

### 9.6 档案统计（services/archive.js + utils/archive-math.js）

- **训练**：周/月/累计（按日期去重）、近 7 天完成率、总容量、平均时长、PR 数。
- **体重**：当前 = 最新记录；30/90 天变化 = 窗口内第一条 vs 最新。
- **身体**：BMI（用户资料）+ 最新体脂率与 5 项围度。
- **饮水**：本月总量、日均（按本月已过自然日）、达标天数（total≥target 快照）、历史最长连续达标。
- **恢复**：近 30 天平均疲劳/睡眠/酸痛 + 不适天数（detectPain 计数）。
- **趋势**：体重/容量/次数/饮水按近 30 天逐日补零序列；新 PR 按「当天 vs 此前」滚动比较；腰围取实际记录点。
- **成就（11 项）**：第一次训练 / 训练 10·50·100 次 / 连续训练 7 天 / 连续饮水达标 7 天 / 首个 PR / 10 个 PR / 连续记录体重 30 天 / 容量 10000kg / 完成训练周期。程序检测，新解锁写 achievements 集合并 toast。

### 9.7 训练周期（v6）

- **创建**：4/6/8 周；模板 = 自定义周计划（有效时）→ 规则引擎逐天；每用户同时最多 1 个 active。
- **优先级**：周期计划 > 自定义周计划 > 规则推荐（plan.js resolveTodayWorkout）。
- **渐进调整**：k = floor((weekNo-1)/2)，非减脂：组数 +min(k,2)，重量 +min(k×5,15)%；减脂只加组数不加重量；**减量周**（≥6 周周期中段 ceil(totalWeeks/2) 插入）：-1 组、-20% 重量；建议重量 = 动作最近表现建议重量 × (1+weight_delta_pct%)，取 0.5 倍数。
- **每周总结**：程序计算（训练天数/完成率/容量/PR/体重/饮水/恢复均值+疼痛）+ 本地规则文案；查看周期页时惰性补生成已结束周；周结束后重算。
- **周期总结**：完成率/总训练天数/总容量/PR 数/体重变化/表现变化（首末周容量比）+ 下周期建议；周期到期惰性标记 completed。
- **放弃**：仅置 status='abandoned'，不生成总结。

### 9.8 AI 教练 Agent（云函数 aiCoach）

```text
用户问题（≤500 字 + 最近 10 条历史）
  → LLM（DeepSeek deepseek-chat，带 23 个工具定义，tool_choice=auto，temperature 0.7，max_tokens 1500）
  → 返回 tool_calls → 依次执行工具（openid 隔离查询数据库）
  → 结果回填（>6000 字符截断并标注「数据被截断」）→ 再问 LLM
  → 直到无 tool_calls 输出最终回答（最多 4 轮；LLM 单次 30s 超时；前端调用 60s 超时）
```

- **23 个工具**：getUserProfile / getTodayWorkout / getWorkoutHistory / getWaterRecords / getExercises / createWorkoutPlan / saveWorkoutRecord / saveWaterRecord / getExerciseHistory / getExercisePR / getTrainingVolume / getProgressTrend / getLastPerformance / getRecoveryStatus / getRecoveryHistory / analyzeTrainingLoad / getRecentBodyStatus / getFitnessMemory / saveFitnessMemory / updateFitnessMemory / deleteFitnessMemory / getTrainingCycle / getFitnessReport。
- **防幻觉**：动作必须来自工具返回数据（saveWorkoutRecord 批量校验动作 _id 真实存在）；建议重量/次数只能来自 getLastPerformance.suggestion（数据推算）；统计数字只能来自程序计算工具（AI 只解释不伪造）。
- **主动调整**：REDUCE/RECOVERY/REST 时必须调整今日训练并解释原因（数据依据）。
- **本地兜底**：云函数不可用时 ai 页按关键词回答训练/饮水问题并标注「AI 暂不可用」；stats 页 AI 分析失败 toast。

---

## 10. 页面交互（跳转关系全图）

### 10.1 完整跳转清单（按出发页面）

| 出发页面 | 目标 | API | 传参 |
|---|---|---|---|
| login | agreement | navigateTo | type=terms/privacy |
| login | index | **reLaunch** | 无 |
| index | water / workout | switchTab | 无 |
| index | water-add / user-info / recovery / weight | navigateTo | 无 |
| workout | workout-detail | navigateTo | 点动作卡 ?id=；开始训练/继续草稿 无参 |
| workout | week-plan-edit / user-info / cycle | navigateTo | 无 |
| workout | exercise | switchTab | 无 |
| workout-detail | exercise-history | navigateTo | ?id&name（encodeURIComponent） |
| workout-detail | user-info | navigateTo | 无 |
| workout-detail | workout | **navigateBack** | 完成训练 100/800ms 后 |
| exercise | exercise-history | navigateTo | ?id&name |
| exercise | user-info | navigateTo | 无 |
| exercise-history | workout | switchTab | 无 |
| exercise-history | 来源页 | navigateBack | 无 |
| water | water-add | navigateTo | 无 |
| water | water-setting / water-history | navigateTo | **（WXML 未绑定，不可达）** |
| water-history | water-history-detail | navigateTo | ?date=YYYY-MM-DD |
| water-history / water-history-detail | water | switchTab | 无 |
| profile | user-info / water-setting / weight / stats / fitness-memory / cycle | navigateTo | 无 |
| stats | weight / body-measure / data-manage / cycle | navigateTo | 无 |
| stats | workout / water | switchTab | 无 |
| cycle | cycle-create | navigateTo | 无 |
| cycle | workout | switchTab | 无 |
| cycle-create | cycle | **redirectTo** | 无（创建成功替换） |
| ai | user-info | navigateTo | 无 |
| float-ball（全局） | ai | navigateTo | 无 |
| 所有二级页 | 来源页 | navigateBack | 无 |

### 10.2 关键闭环

```
协议闭环：login →(reLaunch)→ index；login → agreement → 返回
训练闭环：workout → workout-detail →(完成/返回)→ workout →(缓存失效)→ index/stats 刷新
饮水闭环：water → water-add/setting/history →(返回)→ water(onShow 刷新)；history → detail(删除实时重算)
档案闭环：profile → stats → weight/body-measure/data-manage/cycle/训练/饮水
AI 闭环：任意 Tab → float-ball → ai →(填资料)→ user-info →(返回)→ ai
周期闭环：profile/stats/workout → cycle → cycle-create →(redirectTo)→ cycle
```

### 10.3 全局悬浮球

- 仅 5 个 Tab 页 WXML 含 `<float-ball />`；组件内 `HIDDEN_PAGES`（ai/user-info/stats/fitness-memory/cycle/weight/water-setting 7 页）路由判断二次保险。
- 拖拽：手动 touch 事件（catchtouch*），位移 >3px 判定为拖动并屏蔽点击；位置持久化 `floatBallPosV2`，越界自动修正。
- 点击 → `wx.navigateTo('/pages/ai/ai')`。

---

## 11. UI 设计规范

> 全局主题层在 `app.wxss`（826 行）：CSS 变量（Design Tokens）+ 全局原语 + Phase1/Phase2 设计系统模块。所有页面隐式继承。

### 11.1 色彩系统（Design Tokens，单一来源）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--cat-primary` / `--cat-primary-deep` / `--cat-primary-soft` | `#FFB54D` / `#FF9F1C` / `#FFF3D6` | **主色活力橙**：训练主操作、开始训练、品牌强调 |
| `--cat-success` / `--cat-success-deep` / `--cat-success-soft` | `#4CD964` / `#3FAE85` / `#EAFBF4` | **健康绿**：喝一杯、已完成、TabBar 选中、进度条 |
| `--cat-blue` / `--cat-blue-soft` | `#4D9EFF` / `#E8F7FF` | **清新蓝**：添加记录、次按钮、饮水区域 |
| `--cat-yellow` / `--cat-pink` | `#FFD166` / `#FFE6F2` | 装饰黄 / 提示粉 |
| `--cat-red` / `--cat-red-soft` | `#FF6B6B` / `#FFECEC` | **警示红**：删除、未完成警示 |
| `--cat-bg` | `#F7F8FA` | 页面底色（浅灰白；window 配置 `#F8FBFA`） |
| `--cat-text` / `--cat-text-sub` / `--cat-text-muted` / `--cat-text-weak` | `#222222` / `#888888` / `#999999` / `#BBBBBB` | 文字层级 |
| `--cat-outline` / `--cat-border` | `rgba(31,74,58,0.08)` / `#EEEEEE` | 卡通描边 / 边框 |
| 阴影 | `--cat-shadow-sm/md/lg` | `0 2rpx 8rpx` / `0 8rpx 24rpx` / `0 12rpx 32rpx rgba(102,205,170,.28)`（柔和绿色系） |

**语义色分工**：橙色 = 训练/主操作；绿色 = 饮水/完成态；蓝色 = 次要操作；红色 = 删除/警示。

### 11.2 尺寸系统

- **间距**：8 点栅格（8/12/16/20/24/32/40 rpx），工具类 `.m-8…p-40`、`.mt-*`/`.mb-*`/`.pt-*`/`.pb-*`；Phase2 另有 `--space-1~7`（16~80rpx）。
- **圆角**：卡片 `--cat-radius-lg: 32rpx`；按钮 `999rpx`（胶囊）；标签 `12rpx`；输入框 `20rpx`；周圆点 50%。
- **字号**：页面标题 44rpx/800、卡片/区块标题 32rpx/700、正文 28rpx、辅助 24rpx、提示 22rpx、按钮 30rpx/700、统计数字 48rpx、英雄数字 64rpx。
- **卡片**：白底 + 32rpx 圆角 + 2rpx 漫画描边（rgba(31,74,58,0.08)）+ 柔和阴影；padding 32rpx；卡间距 24rpx。
- **按钮**：胶囊通栏（`btn-primary` 橙渐变 / `btn-success` 绿渐变 / `btn-warning` 红 / `btn-secondary` 灰描边 / `btn-outline` 蓝描边）；按压态 translateY(2rpx) scale(0.98)；禁用态 opacity 0.55。
- **进度条**：两端半圆，绿渐变（训练用橙渐变 `.progress-inner.training`）；thick 变体 22rpx。
- **周圆点**：72rpx 圆形，今天=绿渐变实心白字、已完成=浅绿底深绿勾、休息=灰。

### 11.3 UI 组件规范（全局原语）

| 组件/原语 | 实现位置 | 说明 |
|---|---|---|
| 卡片 `.card` / `.card-title` / `.card-head` / `.card-link` | app.wxss | 白卡 + 描边 + 阴影；标题行左图标右链接 |
| 按钮 `.btn-*` | app.wxss | 5 种语义按钮 + `.btn-block/.btn-row` 布局 |
| TabBar | app.json | 原生 5 Tab，卡通线条图标，选中绿 |
| 导航栏 | 各页 json | 大部分页面用默认导航；water-history/workout-detail/exercise-history/body-measure/stats/data-manage/cycle/cycle-create/recovery/fitness-memory 用 `navigationStyle: custom` 自绘导航 |
| 标签 `.tag` | app.wxss | 22rpx 胶囊小标签：`tag-green/tag-gray/tag-easy/tag-medium/tag-hard/tag-blue/tag-yellow` |
| 弹窗 | 全局 | `wx.showModal`（删除确认、完成训练确认、清空确认、PR 弹窗、导入确认等） |
| Toast | 全局 | `wx.showToast`（操作成功/失败统一提示）；加载用 `wx.showLoading` |
| 进度条 `.progress-wrap/.progress-inner` | app.wxss | 饮水/训练/周进度 |
| 数据卡片 | 各页 | 首页 7 卡、档案页 7 卡、饮水统计卡等 |
| 空状态 `.empty-state` / 页面内 `.empty` | app.wxss / 各页 | 统一猫咪插画 + 引导文案 |
| 加载状态 | 各页 | 多为「加载中...」文字或 loading 布尔字段 |
| 骨架屏 | pages/index/index.skeleton.* | 开发者工具生成，**未接入**（问题清单） |

### 11.4 卡通猫咪规范（核心视觉资产）

- **角色设定**：圆脸橘白短毛卡通猫——米白脸、橘色头顶、粉色腮红、蓝色运动背心、红色头带、深棕描边、黑色大眼+白色高光、粗描边平涂漫画风。
- **素材来源**：`assets/cat/cat-*.png`（9 张 PNG，尺寸 215×174 ~ 284×269，透明/浅色背景，10~19KB），由 `cat-illustration` 组件统一调用（pose 映射文件名），**全站猫咪的唯一来源**。
- **姿态与使用场景**：`home` 首页问候/本周概览、`workout` 训练页/首页训练卡（举哑铃）、`water` 饮水页/首页饮水卡（喝水）、`success` 训练页标题/完成庆祝（举奖杯）、`empty` 各空状态（睡觉）、`calendar` 首页周概览、`avatar` 悬浮球/欢迎页/协议页头像。
- **尺寸**：组件 `size` 属性控制（rpx），常见 120~260rpx；悬浮球头像 80×80px。
- **背景**：素材自带浅色底（悬浮球处图片自带米色背景），组件支持 `shape=circle/square` + `bg` 背景色；通用场景 `shape=none` 透明。
- **动画**：`animate=float`（上下浮动，页头装饰）/ `bounce`（轻弹，完成庆祝）。
- **替换规则**：只允许替换 `assets/cat/` 下同名 PNG（保持画风一致：圆脸/米白/橘顶/蓝背心/红头带）；**禁止引入其他画风元素**（.workbuddy MEMORY.md 强约束「全局视觉主题：卡通猫」）；`cat-mascot`（纯 CSS 猫）为历史组件，新 UI 一律用 `cat-illustration`。

---

## 12. 图片与资源

### 12.1 资源清单

| 资源 | 路径 | 类型/尺寸 | 用途 | 使用页面 | 是否核心视觉 |
|---|---|---|---|---|---|
| cat-avatar.png | assets/cat | PNG 252×276（16.2KB） | 猫咪头像 | 悬浮球/欢迎页/协议页 | ★核心 |
| cat-home.png | assets/cat | PNG 248×250 | 首页问候猫 | index（pose=home） | ★核心 |
| cat-workout.png | assets/cat | PNG 261×269 | 举哑铃猫 | index/workout（pose=workout） | ★核心 |
| cat-water.png | assets/cat | PNG 244×260 | 喝水猫 | index/water（pose=water） | ★核心 |
| cat-success.png | assets/cat | PNG 248×260 | 胜利猫 | workout（pose=success） | ★核心 |
| cat-empty.png | assets/cat | PNG 222×174 | 睡觉猫（空态） | workout/water/water-history/cycle/exercise-history | ★核心 |
| cat-calendar.png | assets/cat | PNG 215×258 | 日历猫 | index（pose=calendar） | ★核心 |
| cat_front_dumbbell.png | assets/cat | PNG 245×208 | 举哑铃猫（备用素材） | 未接入组件 | 素材 |
| cat_plank.png | assets/cat | PNG 284×213 | 平板支撑猫（备用素材） | 未接入组件 | 素材 |
| home/workout/exercise/water/profile 各 inactive/active | assets/tabbar | PNG 64×64 ×10 | TabBar 图标（卡通线条+绿填充） | 全局 TabBar | ★核心 |
| calendar-check.png | assets/icons | PNG 166×166 | 周圆点完成勾 | workout | 图标 |
| cloud.png | assets/icons | PNG 159×158 | 云朵装饰 | water 页头 | 装饰 |
| cup.png | assets/icons | PNG 144×144 | 水杯图 | water-history 卡片 | 装饰 |
| lightning.png / star.png / trophy.png | assets/icons | PNG 147-166 | 记录/徽章/成就图标 | （lightning/star 用于徽章、trophy 备用） | 图标 |
| trash.png | assets/icons | PNG 128×128 | 删除垃圾桶 | water/water-history-detail | 图标 |
| icons_pet/*（22 张） | assets/icons_pet | PNG 200×200 | 宠物头像装饰（卡片标题图标） | stats/profile/user-info/weight/water-setting/cycle/fitness-memory | 装饰 |
| terms.html / privacy.html | docs/agreement | HTML | 协议 H5（部署用，不进包） | 外部部署 | 文档 |
| design/ui-reference.png 等 | design | PNG/HTML | UI 参考图、设计预览 | 开发用（不打包） | 设计资产 |

> ⚠️ **缺失资源**：`assets/icons/heart.png`、`assets/icons/flame.png` 被 `pages/water-history/water-history.wxml` 引用但**文件不存在**（rate<100% 时徽章图加载失败）【问题】。

### 12.2 包体相关

- `project.config.json packOptions.ignore`：design / tools / docs / .workbuddy / .git / 三个 md 文档不打包。
- `packOptions.include`：强制包含 `assets/cat`（历史教训：模板变量拼路径会被「过滤无依赖文件」剔除，导致体验版猫咪图片空白）。
- 素材均为量化 PNG（10~19KB），包体控制良好；无字体文件（使用系统字体栈）。

---

## 13. 技术架构

### 13.1 分层架构

```text
UI 层（WXML / WXSS：卡通猫咪风格 · app.wxss 设计令牌）
  ↓
页面层（pages/，24 页：只做 UI 与交互，不直接操作数据库）
  ↓
组件层（components/：cat-illustration 插画、float-ball 悬浮球；cat-mascot/section-title 未用）
  ↓
业务逻辑层（services/：14 个模块，封装全部云数据库操作、缓存、幂等、统计计算）
  ↓
工具层（utils/：date/bmi/chart/db/cache/workout-analysis/training-state/sensitive/cycle-math/archive-math 纯函数）
  ↓
数据层（微信云开发 CloudBase）
  ├── 云数据库（14 集合，openid 隔离，权限双保险）
  └── 云函数 aiCoach（LLM Agent：23 工具 + Function Calling，DeepSeek）
  ↓
第三方：大模型 API（https://api.deepseek.com，OpenAI 兼容）
```

### 13.2 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端框架 | 微信小程序原生（WXML/WXSS/JS） | 无第三方 UI 框架；`style: v2`、`lazyCodeLoading: requiredComponents` |
| 语言 | JavaScript（CommonJS） | 无 TypeScript |
| 后端 | 微信云开发 CloudBase | 云数据库（小程序端直连 + 云函数管理端）、云函数 |
| 云函数依赖 | wx-server-sdk ~2.6.3（唯一 npm 依赖） | LLM 调用用 Node 原生 https，无 AI SDK |
| AI | DeepSeek deepseek-chat（OpenAI 兼容 Function Calling） | BASE_URL/MODEL 可配置 |
| 图表 | Canvas 2D 自绘（utils/chart.js） | 无第三方图表库 |
| 跨端 | multiPlatform（project.miniapp.json：Android/iOS/OHOS SDK 配置，i18n/base.json 应用名「健身小助手欣一」） | miniapp/ 目录为原生资源预留位（当前为空目录） |

### 13.3 安全设计

- **openid 隔离**：前端所有查询显式 `where({_openid: '{openid}'})` + 集合权限「仅创建者可读写」双保险；云函数内用 `cloud.getWXContext().OPENID` 自行过滤。
- **API Key**：只存在于云函数环境变量 `AI_API_KEY`（config.js 明确禁止放密钥；历史泄露事故已修复并提示轮换）。
- **防 AI 幻觉**：动作必须来自动作库（保存时批量校验 _id）；统计数字程序计算；输入/历史/工具结果截断（500 字 / 10 条 / 6000 字符）；最多 4 轮。
- **敏感信息**：手机号/身份证/银行卡/邮箱/密码/住址等前后端双重过滤，不进入长期记忆。
- **导入导出**：剥离 openid 强制当前用户；写入失败回滚；防重复。

---

## 14. 项目目录结构

```text
E:\Sport
├── app.js                          # 入口：wx.cloud.init + 动作库幂等导入（initExercisesIfEmpty）
├── app.json                        # 全局配置：24 页面注册、5 TabBar、全局组件 float-ball、window 样式
├── app.wxss                        # 全局主题层：Design Tokens + 全局原语 + Phase1/2 设计系统（826 行）
├── app.miniapp.json                # 跨端（miniapp）适配配置（userName: gh_94f6cfd2bb29）
├── project.config.json             # 微信开发者工具项目配置（AppID、libVersion 3.17.1、云函数目录、打包忽略/包含）
├── project.miniapp.json            # miniapp 跨端工程配置（Android/iOS/OHOS SDK）
├── project.private.config.json     # 个人本地工具配置（不入库）
├── config.js                       # 全局统一配置（CLOUD_ENV/STORAGE_KEYS/TOKEN_TTL/AGREEMENT；无任何密钥）
├── sitemap.json                    # 索引配置（全部允许）
├── .gitignore                      # Git 忽略（含 .env 等密钥文件、.workbuddy、.dsh-vision-router）
├── i18n/base.json                  # 跨端应用名「健身小助手欣一」
├── data/
│   └── exercises.js                # 动作库种子数据（44 个动作，仅首次初始化导入用，运行时禁止直接引用）
├── utils/                          # 工具层（纯函数，无 wx 依赖可单测）
│   ├── date.js                     # 日期工具（YYYY-MM-DD/HH:mm/周一/月初）
│   ├── bmi.js                      # BMI 计算 + 中国成人参考区间（非医疗）
│   ├── chart.js                    # Canvas 2D 折线图（体重曲线 drawWeightChart / 通用趋势 drawTrendChart）
│   ├── db.js                       # 翻页全量查询（突破单次 20 条，默认上限 500）
│   ├── cache.js                    # 本地缓存（TTL 过期 + 静默降级，前缀 cache_）
│   ├── workout-analysis.js         # 训练表现分析纯函数（PR/最近vs上次/渐进建议/趋势）
│   ├── training-state.js           # 训练状态判断（NORMAL/REDUCE/RECOVERY/REST）+ 今日建议文案
│   ├── sensitive.js                # 敏感信息过滤（5 类正则）
│   ├── cycle-math.js               # 训练周期数学（周窗口/渐进/减量周）
│   └── archive-math.js             # 档案统计纯函数 + 11 项成就定义
├── services/                       # 数据层（全部云数据库操作封装）
│   ├── user.js                     # 用户资料（users）
│   ├── exercise.js                 # 动作库（exercises，幂等导入/推荐过滤/24h 缓存）
│   ├── recommend.js                # 规则推荐引擎（目标模板/器械兼容/难度过滤/Fisher-Yates）
│   ├── workout.js                  # 训练（workout_records 幂等 + workout_sessions + 草稿 + 分析缓存）
│   ├── water.js                    # 饮水（settings/records/今日/月/历史/快照）
│   ├── weight.js                   # 体重（weight_records 同日 upsert）
│   ├── plan.js                     # 自定义周计划（week_plan，优先级解析 resolveTodayWorkout）
│   ├── recovery.js                 # 每日恢复（recovery_records upsert）
│   ├── fitness-memory.js           # 长期记忆（fitness_memory 整条 upsert + 区块更新）
│   ├── cycle.js                    # 训练周期（training_cycles/weeks 创建/周总结/周期总结）
│   ├── body-measurement.js         # 身体围度（body_measurements 同日 upsert）
│   ├── archive.js                  # 档案统计 + 成就（achievements）
│   ├── data-transfer.js            # 导出/导入（JSON/CSV，防重/回滚/openid 剥离）
│   └── advice.js                   # 首页今日建议聚合（home_advice 60s 缓存）
├── components/                     # 公共组件
│   ├── cat-illustration/           # 统一猫咪插画（pose/size/shape/bg/animate）
│   ├── float-ball/                 # 全局 AI 悬浮球（拖拽/位置记忆/路由隐藏）
│   ├── cat-mascot/                 # 纯 CSS 橘白猫（历史组件，未使用）
│   └── section-title/              # 区块标题（历史组件，未使用）
├── cloudfunctions/
│   └── aiCoach/                    # AI 健身教练云函数
│       ├── index.js                # Agent 入口与工具调度循环（最多 4 轮）
│       ├── prompt.js               # System Prompt（20 条约束）+ 23 个工具定义
│       ├── tools.js                # 23 个工具实现（openid 隔离 + 动作存在性校验）
│       ├── recommend.js            # 云端规则引擎（与前端同步；多 20min 档/exclude_parts）
│       ├── analysis.js             # 云端训练表现分析 + 训练状态（与前端同步）
│       ├── memory.js               # 长期记忆归一化与敏感过滤（与前端同步）
│       ├── cycle.js                # 云端周期统计（与前端同步）
│       ├── llm.js                  # 大模型 HTTPS 调用（原生 https，无依赖）
│       ├── config.js               # 配置（BASE_URL/MODEL/MAX_ROUNDS/TIMEOUT；Key 只读环境变量）
│       └── package.json            # 依赖仅 wx-server-sdk
├── pages/                          # 24 个页面（每页 js/wxml/wxss/json 四件套）
│   ├── login/ agreement/ index/ workout/ workout-detail/
│   ├── exercise/ exercise-history/ week-plan-edit/
│   ├── water/ water-add/ water-setting/ water-history/ water-history-detail/
│   ├── profile/ user-info/ weight/ body-measure/ stats/ data-manage/
│   ├── recovery/ fitness-memory/ cycle/ cycle-create/ ai/
│   └── index/index.skeleton.{wxml,wxss}   # 骨架屏（未接入）
├── assets/
│   ├── tabbar/                     # 5 组 TabBar 图标（10 张 64×64 PNG）
│   ├── cat/                        # 卡通猫咪插画（9 张 PNG，核心视觉）
│   ├── icons/                      # 功能图标（7 张 PNG）
│   └── icons_pet/                  # 宠物头像装饰（22 张 200×200 PNG）
├── design/                         # 设计资源（不打包）
│   ├── UI_REFACTOR_PLAN.md         # UI 重构实施方案（设计系统规范）
│   └── *-preview.html / cat-gallery.html / design-system-preview.html
├── tools/                          # 开发工具（不打包）
│   ├── check-project.ps1           # 静态校验（JSON/WXML/WXSS/资源引用）
│   ├── gen-tabbar-icons.ps1 / gen-cat-placeholders.ps1 / gen-cat-v2.ps1  # 素材生成
│   ├── process_cats.py             # 猫咪素材批处理
│   └── theme-preview.html / home-preview.html
├── docs/agreement/                 # 协议 H5 页面（terms.html/privacy.html/README.md，部署用）
├── miniapp/android/nativeResources/  # 跨端原生资源预留位（当前为空目录）
├── .workbuddy/memory/              # 本地工作记忆（不入库）
├── PROJECT_README.md               # 既有项目说明书（随项目迭代维护）
└── 健身小助手欣一_项目说明书.md      # 本文档
```

---

## 15. 开发规范

> 以下规范根据现有代码风格归纳（无独立规范文档），新代码应遵循以保持一致。

### 15.1 文件与命名

- **页面**：`pages/<page-name>/<page-name>.{js,wxml,wxss,json}` 四件套，kebab-case（如 `week-plan-edit`）。
- **组件**：`components/<comp-name>/<comp-name>.{js,wxml,wxss,json}`，kebab-case。
- **JS 变量/函数**：camelCase；常量 UPPER_SNAKE_CASE；事件处理函数 `onXxx`；页面方法按「onLoad/onShow → load → 具体操作」组织。
- **WXSS 类名**：kebab-case 或 BEM 风格（`.water-card`、`.week-dot.today`）；全局原语类名以 `cat-`/`btn-`/`card-`/`text-`/`fs-`/`m-`/`p-` 等前缀统一。
- **数据字段**：snake_case 与云数据库字段一致（`daily_target_ml`、`workout_date`、`set_records`）；页面展示字段可 camelCase（`hasData`、`deltaText`）。

### 15.2 结构与注释

- **分层**：页面只做 UI/交互；数据操作一律经 services；复杂计算放 utils 纯函数（可单测）。
- **文件头注释**：每个模块文件头写清职责、安全、性能、兼容要点（项目惯例）。
- **服务层错误处理**：catch → `console.error('[模块名] xxx 失败', err)` → 按场景 throw 或降级（页面统一 toast）。
- **缓存约定**：高频数据统一 `utils/cache.js`；缓存键含日期/资料特征时跨天/资料变化自动失效；写后立即 `cache.remove`。

### 15.3 数据处理规范

- 幂等优先：唯一键（openid+日期+动作 等）先查后写/upsert。
- openid 隔离：所有用户数据查询显式 `_openid` 过滤；删除必须 `{_id, _openid}` 双条件。
- 数值校验：服务层二次校验范围（体重 20-300、杯数 1-30、容量 50-1000、评分 1-5 等）。
- 展示字段预计算：WXML 不支持函数调用/复杂运算，页面 setData 前预拼好（deltaText、recoveryItems、partsText 等）。
- 兼容旧数据：读取端回退（`planned_sets || sets`），不破坏旧文档。

---

## 16. AI 开发规范

> 任何 AI 修改「健身小助手欣一」代码时必须遵守。**根目录 `.workbuddy/memory/MEMORY.md` 的「强约束」为最高优先级：**

1. **修改前先读代码**：不得凭印象改；涉及页面/服务先读对应 .js/.wxml/.wxss/.json 与相关 services。
2. **不做大重写**：不能为实现小功能重写整个页面；优先局部 edit。
3. **不删现有功能**：只增不改旧行为；移除代码前确认无引用（grep）。
4. **不随意改数据结构**：云集合字段/本地缓存键改动必须做兼容（旧字段回退），并同步前端 + 云函数双份逻辑。
5. **优先复用**：全局原语（`.card/.btn-*/.tag/.progress-*`）、组件（cat-illustration/float-ball）、工具函数（utils/*）、服务（services/*）；禁止页面内重复实现。
6. **保持视觉风格**：卡通猫咪风格；颜色一律走 `app.wxss` 设计令牌（`--cat-*`），不硬编码新色值。
7. **不换猫咪与核心视觉资源**：`assets/cat/*`、TabBar 图标为核心资产，只能同名替换且保持画风（圆脸/米白/橘顶/蓝背心/红头带）；不引入非猫系元素。
8. **不擅自引入大型第三方依赖**：项目零第三方 UI/图表/AI SDK；需要新能力优先原生/自绘。
9. **不擅自加账号体系**：当前为个人项目、无登录；不得增加手机号登录/注册/多用户/权限系统。
10. **修改后自检**：编译错误、页面错误、数据错误、页面跳转、UI 错位、数据兼容、空数据状态、异常状态；可运行 `pwsh tools/check-project.ps1` 静态校验。
11. **双份逻辑同步**：`utils/workout-analysis.js` ↔ `cloudfunctions/aiCoach/analysis.js`、`services/recommend.js` ↔ 云端 recommend.js、`services/fitness-memory.js`+`utils/sensitive.js` ↔ `cloudfunctions/aiCoach/memory.js`、`services/cycle.js` ↔ 云端 cycle.js、`utils/cycle-math.js` ↔ 云端 cycle.js——修改一侧必须同步另一侧。
12. **缓存一致性**：新增数据写入必须让相关缓存键失效（参考各 service 的 invalidate 函数与约定键 `home_advice`/`archive_stats` 等）。
13. **密钥红线**：任何 API Key/AppSecret 严禁写入代码与提交文件；只允许云函数环境变量。
14. **安全红线**：不把用户数据（含 openid）写入日志明文（现有 aiCoach index.js 有用户输入入日志的习惯，新代码避免）。

---

## 17. 数据存储

### 17.1 存储方案总览

| 数据 | 存储位置 | 说明 |
|---|---|---|
| 用户资料/训练/饮水/体重/恢复/记忆/周期/围度/成就/周计划 | 云数据库（14 集合） | 按 openid 隔离；小程序端直连 + 云函数管理端 |
| 高频只读数据缓存 | 本地 storage（cache_* 前缀 + TTL） | 秒开 + 减少查询；失效策略见 8.1 |
| 训练草稿 | 本地 storage（cache_workout_draft，7 天） | 自动保存兜底，跨页/杀进程恢复 |
| 协议同意标记 | 本地 storage（agreed_terms） | 无云端同步 |
| 悬浮球位置 | 本地 storage（floatBallPosV2） | 全页共享 |
| 导出文件 | `wx.env.USER_DATA_PATH` 临时文件 | 分享用，非持久 |

### 17.2 数据一致性与兼容策略

- 训练完成记录幂等键 `openid+workout_date+exercise_id`（不用 plan_id，兼容 AI 写入）。
- 饮水目标快照 `daily_target_ml/daily_cups` 存于每条记录，改目标不影响历史。
- 体重/恢复/围度按 `openid+date` 同日 upsert。
- 周计划集合缺失（-502005）静默降级规则引擎；恢复集合缺失降级按训练负荷判断。
- v1→v2 兼容：旧训练记录无 set_records 时读取端回退，页面/统计/AI 均不报错。

### 17.3 索引建议（数据量增长后，云开发控制台创建）

- `workout_records`：`_openid + workout_date`（倒序）、`_openid + exercise_id + workout_date`；
- `weight_records` / `water_records` / `recovery_records` / `body_measurements`：`_openid + date`（倒序）；
- `training_cycle_weeks`：`_openid + cycle_id + week_no`；`training_cycles`：`_openid + status + start_date`。

---

## 18. 项目运行

### 18.1 环境要求

| 项 | 要求 |
|---|---|
| 操作系统 | Windows（当前开发机） |
| 微信开发者工具 | 最新稳定版（导入项目即用；基础库 ≥2.2.3 可用云能力，项目配置 3.17.1） |
| 微信小程序 AppID | `wxb234666c120487ef`（个人主体，正式版） |
| 云开发 | 开通云开发环境（工具顶部「云开发」）；多环境可在 `config.js` 的 `CLOUD_ENV` 指定（留空 = 默认环境） |
| Node.js | 仅云函数部署需要（开发者工具可云端安装依赖，本机 Node 非必需） |
| 密钥 | 云函数环境变量 `AI_API_KEY`（DeepSeek 等 OpenAI 兼容 Key） |

> 项目**没有根目录 package.json**：小程序本体零 npm 依赖；唯一依赖 `wx-server-sdk` 在 `cloudfunctions/aiCoach/package.json`（云端安装）。

### 18.2 启动步骤

1. 打开微信开发者工具 → 导入项目 → 选择 `E:\Sport` → 填入 AppID（已写入 project.config.json）→ 确定。
2. 点击「编译」，模拟器运行；真机预览用「预览」或「真机调试」。
3. 首次启动自动向 `exercises` 集合导入 44 个动作（幂等；若清空集合需删除本地 `cache_exercises_all` 与 `exercises_init_done` 才会重导）。
4. 静态校验：`pwsh tools/check-project.ps1`（JSON 可解析 / WXSS 花括号 / WXML 标签 / app.json 资源引用）。

### 18.3 数据库准备

云开发控制台创建 **14 个集合**：users / exercises / water_settings / water_records / weight_records / workout_records / workout_sessions / recovery_records / fitness_memory / training_cycles / training_cycle_weeks / body_measurements / achievements / week_plan。权限：除 exercises 外全部「仅创建者可读写」；exercises 设为「所有用户可读，仅创建者可读写」。

## 19. 项目部署（发布流程）

### 19.1 AI 教练云函数部署

1. 开发者工具中右键 `cloudfunctions/aiCoach` → 「创建并部署：云端安装依赖」。
2. 云开发控制台 → 云函数 → aiCoach → 配置：
   - **超时时间改为 60 秒**（Agent 多轮工具调用较慢）；
   - **环境变量 `AI_API_KEY`**（唯一密钥来源；严禁写进代码/提交文件；曾泄露的 Key 请立即在 DeepSeek 控制台轮换）。
3. 默认对接 DeepSeek（`deepseek-chat`）；如需其他 OpenAI 兼容厂商修改 `cloudfunctions/aiCoach/config.js` 的 `BASE_URL/MODEL`。

### 19.2 协议与隐私

- 小程序内协议：欢迎页点击《用户协议》《隐私政策》打开原生协议页（pages/agreement），**无需外部域名**。
- H5 可选：`docs/agreement/terms.html`、`privacy.html` 部署到 HTTPS 静态托管后，将真实地址填入 `config.js` 的 `AGREEMENT.TERMS_URL / PRIVACY_URL`（**不要填虚假地址**）；未配置不影响功能。

### 19.3 微信公众平台后台（手动，代码无法替代）

- **用户隐私保护指引**：mp.weixin.qq.com → 设置 → 基本设置 → 服务内容声明 → 填写并发布（内容需与本小程序实际行为一致：不获取手机号/头像/位置等敏感信息、无需注册登录、健身数据存云开发按 openid 隔离、AI 对话经云函数发送第三方大模型并过滤敏感信息）。
- 业务域名（可选）：web-view 展示 H5 协议页时配置。

### 19.4 发布流程（实际流程）

```text
代码修改（遵循第 16 节 AI 开发规范）
  ↓ 本地测试（模拟器 + 真机预览；覆盖第 21 节测试要点）
  ↓ 静态校验：pwsh tools/check-project.ps1（PASS）
  ↓ Git 提交（见第 20 节）
  ↓ Git push origin main
  ↓ 微信开发者工具：上传（版本号 + 版本描述）
  ↓ 微信公众平台：提交审核 → 审核通过 → 发布
  ↓ 云函数（如改动 aiCoach）：单独「创建并部署：云端安装依赖」+ 环境变量检查
  ↓ 云数据库（如新增集合/索引）：控制台创建/配置
```

---

## 20. Git 版本管理

### 20.1 仓库现状

| 项 | 现状 |
|---|---|
| 仓库 | 本地 Git 仓库（`E:\Sport\.git`），远程 `origin/main` 已存在（曾合并远程 main） |
| 默认分支 | `main` |
| 提交历史 | 4 条：`b86592d`（2026-08-17 Initial Commit）、`6fb93a8`（2026-08-27 Initial commit）、`69c7375`（2026-08-27 备份：提交当前全部代码）、`fb485e9`（2026-08-27 合并远程 main 分支） |
| 版本标签 | 无 |
| 提交规范 | 无强制规范（历史提交含 "Initial commit"、"备份" 等随意文案） |

### 20.2 建议规范（供后续维护）

```bash
# 1. 查看工作区状态（改了什么、有无未跟踪文件）
git status

# 2. 暂存全部改动（确认无误后）
git add .

# 3. 提交（建议遵循 Conventional Commits 风格）
git commit -m "feat: 新增饮水历史入口"
# 类型建议：feat 新功能 / fix 修复 / refactor 重构 / style UI样式 / docs 文档 / chore 杂项

# 4. 推送
git push origin main
```

- **版本标签**：每次提审/发布打 tag：`git tag v1.0.0 && git push origin v1.0.0`（或 `--tags`）。
- **回滚**：`git log` 找到目标提交 → `git revert <commit>`（保留历史）或 `git reset --hard <commit>`（丢弃后续，慎用）→ 推送。
- **红线**：`.gitignore` 已忽略 `.env*`、`server/.env` 等密钥文件；**严禁提交任何含 API Key/AppSecret 的文件**（历史曾硬编码 Key 入库泄露）。

---

## 21. 测试说明

> 项目无自动化测试框架；以下为**人工回归要点**（结合 PROJECT_README「测试要点」与实际代码）。

### 21.1 训练

- 未填资料 → 引导填写；填后生成今日训练（规则引擎，动作当天固定）。
- 已完成/未完成切换双向；重启后状态保留（幂等）；重复点击不重复插入。
- 全部完成显示 100% 🎉；筛选 Tab 正确。
- 智能推荐：改资料后点击按新资料重生成；编辑计划保存后训练页采用自定义计划；空计划回退智能推荐。
- 开始训练：计时器开始/暂停/继续/结束；逐组录入（重量/次数/RPE/力竭/休息）；组间倒计时/跳过；完成动作；添加动作不重复；草稿自动保存与「继续上次训练」恢复；完成训练 PR 弹窗。
- 动作历史页：PR/对比/建议/三趋势图/列表渲染正确；无数据空态。

### 21.2 饮水

- 设置 8 杯×250ml → 目标 2000ml；喝一杯 +1 杯；修改目标不影响历史（快照）。
- 历史按日倒序；删除记录当天实时重算；三态状态标签正确。
- ⚠️ 已知问题：历史页 rate<100% 的徽章图缺失（见问题清单）。

### 21.3 体重 / 身体围度 / 每日状态

- 同日重复记录自动更新；30 天曲线正确；删除后曲线/统计更新。
- 围度每天一条 upsert；历史回填编辑/删除/回到今天正常。
- 恢复记录滑杆 1-5 保存；同日重复保存为更新；历史修改/删除正常。

### 21.4 数据中心 / 成就 / 数据管理

- 周/月/累计训练次数去重正确；饮水月均 = 总量÷已过天数；体重 30/90 天变化首末对比。
- 成就程序检测解锁、未解锁显示进度、新解锁 toast。
- 导出 JSON/CSV（BOM+转义）分享；导入粘贴 JSON：格式校验、按唯一键防重、失败回滚、不覆盖他人数据（openid 剥离）。

### 21.5 AI 教练

- 「今天练什么 / 只有20分钟 / 没有器械 / 帮我记录 / 我喝水情况」等场景回答正确，动作全部来自动作库。
- 工具轨迹展示；断网/无 Key 回退本地规则并标注。
- 分析类问题（我上次卧推多少/有没有进步/个人最佳）调分析工具返回真实数据，建议重量来自 suggestion。
- ⚠️ 已知问题：云函数 saveWorkoutRecord / saveFitnessMemory 写入缺 `_openid`（AI 保存的训练/记忆前端不可见），见问题清单。

### 21.6 安全与性能

- 换账号数据互不可见（openid 隔离）；切换 Tab 秒开（缓存）；数据变更后立即刷新。
- 悬浮球拖拽/点击/位置记忆；不压 tabBar；AI 页等 7 页不显示。
- 欢迎页未勾选协议不可进入；勾选后回显。

### 21.7 静态校验

- 改动后运行 `pwsh tools/check-project.ps1`，确认 PASS。

---

## 22. 已知问题（问题清单）

> 严重程度：🔴 高（数据/功能不可用）｜🟠 中（体验/性能）｜🟡 低（一致性/代码质量）。

| # | 问题 | 文件 | 严重程度 | 原因 | 建议 |
|---|---|---|---|---|---|
| 1 | **AI 保存训练记录缺少 `_openid`**：`saveWorkoutRecord` 的 recordData 只有 `openid` 无 `_openid`，云函数端 add 不会自动注入 `_openid`，导致 AI 记录的训练对前端不可见（数据孤岛） | cloudfunctions/aiCoach/tools.js（约 308-333 行） | 🔴 高 | 字段遗漏（对照 saveWaterRecord 显式写了 `_openid`） | 在 recordData 补 `_openid: openid`；补测「AI 帮我记录」后前端可见 |
| 2 | **AI 保存长期记忆缺少 `_openid`**：`saveFitnessMemory` 新增文档无 `_openid`；`updateFitnessMemory` 按 `_openid` 查询将永远找不到新文档 | cloudfunctions/aiCoach/tools.js（835-850、859-930 行） | 🔴 高 | 同上 | payload 补 `_openid: openid`；云端自测读写闭环 |
| 3 | 饮水历史页完成率徽章引用不存在的图片 `assets/icons/heart.png` / `flame.png`，rate<100% 时图片加载失败 | pages/water-history/water-history.wxml（43 行） | 🟠 中 | 资源缺失 | 补两张图标（保持现有画风）或改用已有 star/lightning |
| 4 | **饮水历史页无可见入口**：`onGoHistory`/`onGoSetting` 已定义但 water.wxml 未绑定；历史页全库无其他入口 | pages/water/water.js（58/63 行）、water.wxml | 🟠 中 | 绑定遗漏 | 在饮水页导航区补「历史/设置」入口（如页头图标） |
| 5 | 首页骨架屏未接入：index.skeleton.* 为开发者工具生成，WXML/WXSS 未引用 | pages/index/index.skeleton.{wxml,wxss} | 🟡 低 | 未接入 | 接入或删除 |
| 6 | cat-illustration 白名单含 back/leg/remind/ai，但 `assets/cat/` 无对应 PNG（加载 404 风险）；注释（WebP）与实际（PNG）不符 | components/cat-illustration/* | 🟡 低 | 素材未补齐 | 补素材或收紧白名单；修正注释 |
| 7 | 云函数/前端双份逻辑漂移风险：recommend/analysis/training-state/sensitive/memory/cycle 均双份实现，仅靠注释约定同步；云端 recommend 多 20min 档、analysis.computeRecentStats 缺 records 键 | cloudfunctions/aiCoach/* ↔ services/*、utils/* | 🟡 低（长期风险高） | 架构选择 | 抽公共包或加同步校验/单测 |
| 8 | 训练页「全部完成」判定用完成表总条数 vs 计划动作数，口径不一致（旧记录/临时动作可能提前弹🎉） | pages/workout/workout.js（onMarkDone） | 🟡 低 | 口径差异 | 统一用 workout.exercises 过滤计数 |
| 9 | workout-detail：`onStartSession` 无条件重置 `_sessionId`，草稿恢复后重新开始会悬挂旧 active 会话；`ended`/`completed` 状态两次写库语义不一致 | pages/workout-detail/workout-detail.js | 🟡 低 | 状态机设计 | 恢复草稿时沿用原 session；统一状态枚举 |
| 10 | workout-detail 注册 cat-illustration 但未使用；`.json` 冗余注册 | pages/workout-detail/workout-detail.json | 🟡 低 | 冗余 | 移除 |
| 11 | 档案页加载失败时 WXML 直接访问 `achievements.list.length` 等 null 属性有报错风险；`achievements.newly` 缓存 1h 内每次 onShow 重复弹成就 toast | pages/stats/stats.{js,wxml} | 🟡 低 | 空值防护/缓存语义 | 加空值保护；newly 一次性消费 |
| 12 | 资料页保存会用当前表单体重覆盖当天体重记录（仅改昵称/目标也会覆盖） | pages/user-info/user-info.js | 🟡 低 | 联动设计 | 仅体重变化时同步或改为「体重变化才写」 |
| 13 | 体重页曲线显示条件 records>=1 与文案「记录 2 次以上」不一致；delta=0 显示「↓ 0 kg」 | pages/weight/weight.{js,wxml} | 🟡 低 | 文案/边界 | 统一口径；0 显示「—」或「持平」 |
| 14 | 数据导入防重集合只拉 max 500 条已有记录，>500 条时可能误导入重复；单条失败只计数不回滚 | services/data-transfer.js | 🟡 低 | 上限/事务粒度 | 全量拉取或分批去重；单条失败回滚 |
| 15 | 饮水添加页无法补录历史日期（date 恒为今天）；保存按钮无防抖 | pages/water-add/water-add.js | 🟡 低 | 设计限制 | 增加日期选择（可选需求）；加防抖 |
| 16 | 饮水设置页读设置失败保留默认值，直接保存会用默认覆盖已有设置 | pages/water-setting/water-setting.js | 🟡 低 | 错误处理 | 读失败禁用保存 |
| 17 | utils/chart.js 第 185 行三元两分支相同（死代码）；drawWeightChart 与 drawTrendChart 高度重复 | utils/chart.js | 🟡 低 | 冗余 | 合并/清理 |
| 18 | 饮水今日统计 percent 封顶 100 vs 详情/历史 rate 不封顶，口径不一致（今日页显示 100%，详情可显示 120%） | services/water.js | 🟡 低 | 口径差异 | 统一（推荐统一不封顶，展示层封顶条宽） |
| 19 | AI 页消息列表 `wx:key="index"` 无效（item 无 index 属性） | pages/ai/ai.wxml | 🟡 低 | 键选择 | 用 `*this` 或唯一 id |
| 20 | 周期页活跃分支历史列表包含当前周期；`.adjust-tip` 样式未使用 | pages/cycle/cycle.{js,wxss} | 🟡 低 | 展示逻辑 | 过滤当前周期；清理样式 |
| 21 | 云端 `getTodayCyclePlan` 对每个动作串行查 `getLastPerformance`（N+1 查询），动作多时慢 | cloudfunctions/aiCoach/cycle.js、services/cycle.js | 🟡 低 | 性能 | 批量查询或并行 |
| 22 | aiCoach index.js 将用户输入全文打入云函数日志（隐私习惯） | cloudfunctions/aiCoach/index.js（21 行） | 🟡 低 | 日志习惯 | 只记长度或脱敏 |
| 23 | 悬浮球 TAB_BAR_HEIGHT=64 硬编码（非 50rpx 机型/自定义 tabBar 会偏移） | components/float-ball/float-ball.js | 🟡 低 | 兼容 | 动态测量或配置化 |
| 24 | utils/cache.js 无法区分「未命中」与「缓存值为 null」，部分 service「缓存 null 结果」的意图实际不生效（每次重查库） | utils/cache.js | 🟡 低 | 缓存语义 | get 增加 has 或包装 null 标记 |

> 全项目 **0 个 TODO / FIXME**；`console.warn` 仅 1 处（ai.js，合理）；`console.error` 81 处均为 catch 日志，覆盖较完整。

---

## 23. 功能完成度

> 完成度按实际代码判断（可用功能 + 边界覆盖），非主观评分。

| 功能板块 | 状态 | 完成度 | 说明 |
|---|---|---|---|
| 欢迎页 / 协议 | 已完成 | 100% | 勾选协议进入、原生协议页、回显 |
| 首页 | 已完成 | 95% | 全部卡片实现；骨架屏未接入、建议缓存 60s |
| 训练（workout + workout-detail） | 已完成 | 95% | 规则推荐/自定义/周期三层优先级、幂等完成、训练明细、计时器、草稿全实现；「全部完成」口径小瑕疵 |
| 动作库 | 已完成 | 100% | 11 Tab、推荐过滤、44 动作 |
| 动作历史/表现分析 | 已完成 | 90% | PR/对比/建议/趋势图全实现；趋势符号下降分支空白 |
| 自定义周计划 | 已完成 | 95% | 勾选/休息/清空/智能预填/保存全实现 |
| 饮水 | 已完成 | 90% | 统计/喝一杯/添加/设置/历史全实现；**历史页入口不可达 + 徽章图缺失** |
| 体重 | 已完成 | 100% | 同日 upsert、30 天曲线、历史删除 |
| 我的资料 | 已完成 | 95% | 表单/BMI/同步体重；体重覆盖边界问题 |
| 健身档案（stats） | 已完成 | 90% | 五维统计/趋势/成就/AI 分析全实现；null 防护与 toast 重复小问题 |
| 身体围度 | 已完成 | 100% | 每日 upsert、历史回填、删除 |
| 每日状态（recovery） | 已完成 | 100% | 5 滑杆 upsert、历史 CRUD、训练状态联动 |
| 长期记忆（fitness-memory） | 已完成 | 95% | CRUD/敏感过滤/空态降级全实现；**云端写入缺 _openid（AI 侧保存不可见）** |
| 训练周期 | 已完成 | 90% | 创建/渐进/减量/周总结/周期总结全实现；云端 N+1 与列表含当前周期小问题 |
| 数据管理 | 已完成 | 90% | 导出 JSON/CSV、导入校验/防重/回滚全实现；500 条去重上限边界 |
| AI 健身教练 | 已完成 | 90% | Agent 23 工具 + 本地兜底全实现；**云函数保存训练缺 _openid**；需配置 API Key 才可用 |
| 登录/账号体系 | 不适用（已移除） | — | 个人项目，欢迎页模式，无登录 |
| 自动化测试 | 未实现 | 0% | 无测试框架；仅静态校验脚本 + 人工回归 |

---

## 24. 后续规划

> 规划与当前项目实际定位（个人用户、无后端、云开发、卡通猫咪风格）匹配。

### V1.1（修复与体验）
- 修复云函数 `saveWorkoutRecord` / `saveFitnessMemory` 缺 `_openid`（🔴 优先）。
- 补齐 `assets/icons/heart.png` / `flame.png`；恢复饮水历史页可见入口（或加入口到饮水页页头）。
- 首页骨架屏接入；档案页 null 防护与成就 toast 一次性消费。
- 统一完成率口径（今日/详情/历史）；体重 delta=0 文案。

### V1.2（增强）
- 饮水记录支持补录历史日期；数据导入去重上限提升（云函数聚合）。
- 训练页「全部完成」口径统一；workout-detail 会话状态机整理。
- 趋势图增加「周/月」切换；档案页增加导出当前趋势图。

### V2.0（智能进阶）
- **AI 个性化训练建议**：深化长期记忆 → 智能周计划生成（在现规则引擎基础上由 AI 微调）。
- **智能训练计划**：基于历史表现自动编排周期（现有周期系统 + AI 文案增强）。
- 云函数聚合统计（解决客户端 500 条上限）；双份逻辑抽公共依赖消除漂移。
- 可选：云端同步备份（现有导出 JSON 已可手动备份）。

> 以上均为方向性规划，**当前代码中不存在**这些能力，实施前需重新评估。

---

## 25. 版本历史

| 版本 | 日期 | 说明 |
|---|---|---|
| v0.x（开发中） | 2026-08 起 | 需求阶段（PROJECT_REQUIREMENTS.md，Phase 1-15）→ MVP（训练/饮水/体重/统计）→ 规则推荐 → AI Agent → UI 卡通化重构 → v2 训练明细/计时器 → v3 表现分析/PR → v4 每日状态 → v5 长期记忆 → v6 训练周期 → v7 档案/成就/数据管理 |
| Git 提交 | 2026-08-17 / 2026-08-27 | `b86592d` Initial Commit、`6fb93a8` Initial commit、`69c7375` 备份提交、`fb485e9` 合并远程 main |
| 本次说明书 | 2026-08-27 | 基于当前全部代码生成（24 页 / 14 服务 / 10 工具 / 4 组件 / 云函数 aiCoach / 14 集合） |

> 小程序后台版本号未在代码中发现（提审时在开发者工具填写）；【待确认】当前线上版本号。

---

## 26. 附录

### 26.1 关键文件速查

| 需求 | 文件 |
|---|---|
| 全局配置/密钥红线 | `config.js`、`cloudfunctions/aiCoach/config.js` |
| 页面路由/TabBar | `app.json` |
| 设计令牌/全局原语 | `app.wxss` |
| 规则推荐引擎 | `services/recommend.js`（前端）、`cloudfunctions/aiCoach/recommend.js`（云端） |
| 训练记录核心 | `services/workout.js`、`utils/workout-analysis.js`、`pages/workout-detail/workout-detail.js` |
| 训练状态/今日建议 | `utils/training-state.js`、`services/advice.js` |
| 饮水 | `services/water.js` + `pages/water*` |
| 档案/成就 | `services/archive.js`、`utils/archive-math.js` |
| 训练周期 | `services/cycle.js`、`utils/cycle-math.js` |
| 长期记忆 | `services/fitness-memory.js`、`utils/sensitive.js`、`cloudfunctions/aiCoach/memory.js` |
| 数据导出导入 | `services/data-transfer.js`、`pages/data-manage/` |
| 云函数 Agent | `cloudfunctions/aiCoach/index.js`（入口）、`prompt.js`（提示与 23 工具）、`tools.js`（工具实现） |
| 静态校验 | `tools/check-project.ps1` |
| 既有说明书 | `PROJECT_README.md` |
| UI 重构规范 | `design/UI_REFACTOR_PLAN.md` |

### 26.2 数据字典备注

- 日期统一 `YYYY-MM-DD`（本地时区）；时间 `HH:mm`；重量 kg（1 位小数）；容量 kg（整数）；围度 cm（1 位小数）。
- 训练记录唯一键 `openid + workout_date + exercise_id`；`data_version: 2` 标识 v2 明细结构。
- 饮水目标快照字段：`daily_target_ml`、`daily_cups`。
- 训练状态枚举：`NORMAL`（正常）/ `REDUCE`（降低）/ `RECOVERY`（恢复）/ `REST`（休息）。
- 周期状态枚举：`active` / `completed` / `abandoned`；会话状态：`active` / `paused` / `completed`（页面另有 `ended` 展示态）。

### 26.3 免责声明

- BMI、训练建议、恢复建议等均「仅作参考，不作为医疗诊断依据」（代码多处注释声明）；AI 教练不做医疗诊断。
- 本文档标记【待确认】项：小程序后台线上版本号、云开发环境 ID（CLOUD_ENV 为空=默认环境）、`fitness_memory` 页面 `hasMemory` 字段用途、周期页历史列表是否应过滤当前周期（当前行为为包含）。

---

*本文档由代码全量扫描生成，随项目迭代更新。修改代码后请同步更新本文档，并保持与 `PROJECT_README.md` 一致。*

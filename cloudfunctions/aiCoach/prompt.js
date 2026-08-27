// cloudfunctions/aiCoach/prompt.js - System Prompt 与工具定义（Function Calling 声明，23 个工具）

// System Prompt：约束 AI 的行为边界（不能编造动作、必须用工具、考虑用户目标）
const SYSTEM_PROMPT = [
  '你是一名专业、友善的AI健身教练「小欣」，正在服务一位健身用户。',
  '你必须严格遵守以下规则：',
  '1. 所有训练动作建议必须通过工具（getExercises / getTodayWorkout / createWorkoutPlan）从动作库获取，严禁自己编造动作名称、组数或次数。',
  '2. 生成训练方案前，先调用 getUserProfile 了解用户的身体资料（目标/经验/器械/每周次数/每次时长），方案必须匹配用户情况。',
  '3. 涉及训练建议时，先查看今日计划（getTodayWorkout）和历史训练（getWorkoutHistory），避免连续训练同一部位。若用户提到昨天练过某部位（如“昨天练了胸”），先调用 getWorkoutHistory 确认最近训练的部位，再在 getTodayWorkout / createWorkoutPlan 中通过 exclude_parts 参数排除该部位（必要时连同关联部位如三头），让引擎重新组合不冲突的部位。',
  '4. 用户要求记录数据时（如“帮我记录训练/喝水”），调用 saveWorkoutRecord / saveWaterRecord，保存成功后明确告知用户。记录训练时优先使用 details 参数逐动作传入每组明细（set_records：重量/次数/RPE/力竭/休息），只记录用户明确口述的数据，不要编造组数或次数。',
  '5. 回答使用简体中文，简洁清晰，多使用换行和编号；涉及动作时给出 组数×次数 和组间休息时间。',
  '6. 不做医疗诊断：BMI 仅作参考，身体不适建议就医。',
  '7. 如果用户问题与健身无关，礼貌地引导回健身话题。',
  '8. 为减少响应轮数：当需要多个数据时，请在同一轮响应中并行调用多个工具（一次返回多个 tool_calls），不要串行等待。',
  '9. 用户提到时间限制（如“只有20分钟”）时，必须调用 getTodayWorkout 或 createWorkoutPlan 并传入对应的 duration 重新生成方案；用户提到器械限制（如“没有器械”）时，必须传入 equipment 重新生成方案。',
  '10. 用户口述的身体数据（如“我今天80kg”）仅作为本次回答的计算参考（如 BMI 估算），不要写入数据库，也不要覆盖用户资料。',
  '11. 用户询问训练表现时（如“上次卧推多少/最近有没有进步/今天卧推该做多重/个人最佳是多少/容量有没有增加/哪些动作没进步”），必须调用分析工具获取真实数据：getExercisePR（个人最佳）、getLastPerformance（最近一次/上一次表现与建议）、getProgressTrend（趋势）、getTrainingVolume（容量）、getExerciseHistory（历史明细）。动作可用名称或 _id 传入（名称需与动作库完全一致）。建议的重量与次数只能来自 getLastPerformance 返回的 suggestion 字段（基于历史数据推算），严禁自己编造数字；多个工具可在同一轮并行调用。',
  '12. 生成训练建议前必须综合分析用户状态：调用 analyzeTrainingLoad 获取训练负荷与状态判断（NORMAL/REDUCE/RECOVERY/REST）、getRecoveryStatus 获取今日恢复状态、getRecentBodyStatus 获取近期身体反馈，并结合 getUserProfile、getTodayWorkout、getWorkoutHistory、getTrainingVolume、体重变化（analyzeTrainingLoad 返回）综合判断。当状态为 REDUCE/RECOVERY/REST 时必须调整今日训练（减少动作/组数、改为恢复或休息），并主动向用户解释调整原因，例如：“今天将腿部训练减少 1 个动作，因为你最近连续训练 3 天，并且昨天疲劳度较高。”所有调整理由必须来自工具返回的真实数据。',
  '13. 医疗边界：如果用户描述明显疼痛、伤病等情况（如“膝盖疼”“扭伤了”“背不舒服”），你不得进行疾病诊断，不得强行安排训练；应给出停止相关动作、降低负荷等安全建议，必要时建议咨询专业医疗或运动专业人士。疼痛信号可以从 getRecoveryStatus/getRecoveryHistory 返回的 pain_detected 与备注中识别。',
  '14. 主动建议必须有数据依据：禁止凭空生成用户历史、编造训练记录、编造身体数据、编造动作或编造重量。所有数字必须来自工具返回的真实数据。',
  '15. 长期记忆（fitness_memory）：涉及用户的训练偏好、习惯、身体反馈、目标变化时，先调用 getFitnessMemory 了解已记住的内容。只有满足以下条件之一才允许调用 saveFitnessMemory / updateFitnessMemory 保存：① 对未来训练确实有价值；② 用户明确表达的长期偏好；③ 多次行为可确认的稳定习惯（如连续多次提到）；④ 用户主动要求记住。一次性的临时信息（如“今天有点累”“这次练得不错”）不得进入长期记忆。保存成功后告知用户“我已记住”，并说明记住了什么。',
  '16. 敏感信息保护：绝对不能把手机号、身份证号、银行卡号、邮箱、密码、详细住址等敏感信息写入长期记忆或任何数据；用户要求记住时也只记录健身相关内容，遇到敏感信息直接拒绝并说明。',
  '17. 综合回答训练安排：用户要求“安排今天训练”等场景时，必须综合 getUserProfile（资料）+ getTodayWorkout（今日计划）+ getWorkoutHistory（历史）+ analyzeTrainingLoad / getRecoveryStatus（恢复状态）+ getFitnessMemory（长期偏好）+ getExercisePR / getLastPerformance（训练表现）综合分析后给出，并说明依据。',
  '18. 训练周期：用户询问训练周期/本周总结/周期总结/进度时，调用 getTrainingCycle 获取程序计算的统计数据（当前周、每周总结、周期总结）。所有统计数字（训练天数/完成率/容量/PR/体重变化）只能来自该工具返回的数据，AI 负责解释与建议，禁止伪造任何统计数字；无周期时如实说明并引导在「我的 → 训练周期」创建。',
  '19. 数据分析：用户要求分析训练表现/体重/恢复/饮水趋势（如“我这段时间有没有进步”“训练和体重的关系”）时，必须调用 getFitnessReport 获取程序计算的统计（训练天数/容量趋势/PR/体重变化/饮水达标/恢复均值），基于真实数据指出进步与问题，禁止编造任何统计数字。',
  '20. 数据不足必须明说：当工具返回 has_data=false、无记录、空数组、或出现「数据被截断」标记时，必须如实告诉用户缺少哪些数据（如“你还没有训练记录”“最近没有恢复状态记录”），并基于现有数据给出可行建议或引导补充数据，严禁编造缺失的数据或假装看到了完整数据。'
].join('\n');

// 工具定义（OpenAI Function Calling 格式，DeepSeek 兼容）
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'getUserProfile',
      description: '获取当前用户的身体资料（年龄/身高/体重/健身目标/经验/每周训练次数/每次时长/器械），用于个性化建议。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getTodayWorkout',
      description: '获取今日推荐训练（规则引擎生成，动作全部来自动作库）。可通过参数模拟条件：duration 训练时长（分钟）、equipment 器械、goal 目标、exclude_parts 排除部位；不传则使用用户资料。',
      parameters: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: '训练时长分钟，如 20/30/45/60/90' },
          equipment: { type: 'string', enum: ['无器械', '哑铃', '杠铃', '健身房', '家庭器械'] },
          goal: { type: 'string', enum: ['减脂', '增肌', '塑形', '提升体能', '保持健康'] },
          exclude_parts: { type: 'array', items: { type: 'string' }, description: '排除的部位关键词（如昨天练过胸传 ["胸"]，必要时连同关联部位 ["胸","三头"]），引擎会自动重新组合不冲突的部位' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getWorkoutHistory',
      description: '获取用户最近的历史训练记录（倒序）。每条记录包含动作名称、部位分类（category）、目标肌肉（target_muscle）、计划组数/次数、实际组数、总容量与最大重量/次数汇总，以及最近 3 组明细（set_records）。用于判断用户最近训练了哪些部位、避免连续训练，以及分析训练负荷变化。需要某动作完整每组明细时使用 getExerciseHistory。',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数，默认10，最大30' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getWaterRecords',
      description: '获取用户最近的饮水记录与总量，了解饮水习惯。',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数，默认10，最大30' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getExercises',
      description: '从动作库查询动作。所有推荐的动作必须来自本工具返回的数据，禁止编造。可按分类/难度/器械过滤。',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['胸部', '背部', '肩部', '手臂', '腿部', '臀部', '核心', '有氧', '拉伸'] },
          equipment: { type: 'string', enum: ['无器械', '哑铃', '杠铃', '健身房', '家庭器械'] },
          difficulty: { type: 'string', enum: ['初级', '中级', '高级'] },
          limit: { type: 'number', description: '返回条数，默认10，最大30' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createWorkoutPlan',
      description: '按条件生成一套训练方案（动作全部来自动作库，不写入数据库）。参数：parts 部位组合（如 ["胸","三头"]）、duration 时长、equipment 器械、goal 目标、exclude_parts 排除部位；未传的用用户资料。',
      parameters: {
        type: 'object',
        properties: {
          parts: { type: 'array', items: { type: 'string' }, description: '部位关键词：胸/背/肩/三头/二头/手臂/腿/臀/核心/有氧/全身' },
          duration: { type: 'number', description: '训练时长分钟' },
          equipment: { type: 'string', enum: ['无器械', '哑铃', '杠铃', '健身房', '家庭器械'] },
          goal: { type: 'string', enum: ['减脂', '增肌', '塑形', '提升体能', '保持健康'] },
          exclude_parts: { type: 'array', items: { type: 'string' }, description: '排除的部位关键词（如昨天练过胸传 ["胸"]），引擎会自动重新组合不冲突的部位' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'saveWorkoutRecord',
      description: '保存训练记录到数据库。exercise_ids 必须来自 getExercises/getTodayWorkout/createWorkoutPlan 返回的真实动作 _id，禁止编造。推荐使用 details 参数逐动作保存每组明细（重量/次数/RPE/力竭/休息秒）；也可使用旧参数 exercise_ids/sets/reps 批量保存。',
      parameters: {
        type: 'object',
        properties: {
          exercise_ids: { type: 'array', items: { type: 'string' }, description: '动作 _id 列表（必须真实存在）' },
          sets: { type: 'array', items: { type: 'number' }, description: '每个动作的组数（旧参数，与 exercise_ids 等长）' },
          reps: { type: 'array', items: { type: 'number' }, description: '每个动作每组次数（旧参数，与 exercise_ids 等长）' },
          details: {
            type: 'array',
            description: '逐动作明细（推荐）：每个动作的每组数据与备注',
            items: {
              type: 'object',
              properties: {
                exercise_id: { type: 'string', description: '动作 _id（必须真实存在）' },
                planned_sets: { type: 'number', description: '计划组数' },
                planned_reps: { type: 'number', description: '计划每组次数' },
                set_records: {
                  type: 'array',
                  description: '实际每组明细（顺序即组序）',
                  items: {
                    type: 'object',
                    properties: {
                      weight: { type: 'number', description: '该组重量（kg，自重为0）' },
                      reps: { type: 'number', description: '该组完成次数' },
                      rpe: { type: 'number', description: '该组 RPE（1-10，可省略）' },
                      is_failure: { type: 'boolean', description: '是否力竭' },
                      rest_seconds: { type: 'number', description: '该组后休息秒数' }
                    },
                    required: ['weight', 'reps']
                  }
                },
                note: { type: 'string', description: '动作备注' },
                duration_minutes: { type: 'number', description: '该动作耗时（分钟，可为小数）' }
              },
              required: ['exercise_id', 'set_records']
            }
          },
          duration: { type: 'number', description: '本次训练总时长（分钟）' },
          date: { type: 'string', description: '训练日期 YYYY-MM-DD，默认今天' },
          note: { type: 'string', description: '备注（旧参数，用于没有 details 时）' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'saveWaterRecord',
      description: '保存一条饮水记录。amount_ml 饮水量（毫升，50-1000），drink_type 类型（白水/温水/茶/其他），remark 备注。',
      parameters: {
        type: 'object',
        properties: {
          amount_ml: { type: 'number', description: '饮水量（毫升）' },
          drink_type: { type: 'string', enum: ['白水', '温水', '茶', '其他'] },
          remark: { type: 'string', description: '备注' }
        },
        required: ['amount_ml']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getExerciseHistory',
      description: '获取某个动作的训练历史（倒序）。包含每次的日期、组数、每组明细（重量/次数/RPE/力竭/休息）、总容量。用于回答“我上次做这个动作的情况”。',
      parameters: {
        type: 'object',
        properties: {
          exercise_id: { type: 'string', description: '动作 _id（来自 getExercises/getTodayWorkout/createWorkoutPlan）' },
          exercise_name: { type: 'string', description: '动作名称（与动作库完全一致，如“卧推”）；与 exercise_id 二选一' },
          limit: { type: 'number', description: '返回条数，默认10，最大30' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getExercisePR',
      description: '获取某个动作的个人最佳 PR：最大重量（附带次数与日期）、最大次数（附带重量与日期）、最大训练容量（单日重量×次数×组数，附带组数与日期）。用于回答“我的个人最佳是多少”。',
      parameters: {
        type: 'object',
        properties: {
          exercise_id: { type: 'string', description: '动作 _id' },
          exercise_name: { type: 'string', description: '动作名称（与动作库完全一致）；与 exercise_id 二选一' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getTrainingVolume',
      description: '获取训练容量统计：指定动作或全部动作在最近 N 天内的总容量（Σ 重量×次数）、训练天数、按日容量、趋势方向（up/flat/down）。用于回答“我的训练容量有没有增加”。',
      parameters: {
        type: 'object',
        properties: {
          exercise_id: { type: 'string', description: '动作 _id（可选，缺省统计全部动作）' },
          exercise_name: { type: 'string', description: '动作名称（可选）' },
          days: { type: 'number', description: '最近 N 天（如 7/30/90），缺省全部' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getProgressTrend',
      description: '获取某个动作的进度趋势数据点（按日期升序：最大重量/最大次数/容量）与首尾对比摘要（重量变化、容量变化）。用于回答“最近有没有进步”和“哪些动作长期没有进步”。',
      parameters: {
        type: 'object',
        properties: {
          exercise_id: { type: 'string', description: '动作 _id' },
          exercise_name: { type: 'string', description: '动作名称（与动作库完全一致）；与 exercise_id 二选一' },
          days: { type: 'number', description: '最近 N 天（如 30/90），缺省全部' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getLastPerformance',
      description: '获取某个动作的最近一次表现、上一次表现对比，以及基于历史数据推算的下次训练建议（suggestion：建议增加重量/保持重量增加次数/保持/降低训练量，含建议重量与次数）。用于回答“今天应该用多少重量”和“我上次做了多少”。',
      parameters: {
        type: 'object',
        properties: {
          exercise_id: { type: 'string', description: '动作 _id' },
          exercise_name: { type: 'string', description: '动作名称（与动作库完全一致）；与 exercise_id 二选一' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getRecoveryStatus',
      description: '获取用户今日的身体恢复状态：睡眠质量/疲劳程度/肌肉酸痛/训练意愿/今日身体状态（各 1-5）、备注，以及是否检测到疼痛/不适（pain_detected）。用于判断今天该不该练、练多重。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getRecoveryHistory',
      description: '获取用户最近的每日身体状态反馈历史（睡眠/疲劳/酸痛/意愿/备注，含 pain_detected）。用于分析近期身体反馈趋势，判断是否长期疲劳或反复不适。',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数，默认10，最大30' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyzeTrainingLoad',
      description: '综合分析用户训练负荷与状态：连续训练天数、近7天训练天数、训练容量趋势、最近训练部位、最近体重变化、今日恢复状态，并给出训练状态判断（NORMAL正常/REDUCE降低/RECOVERY恢复/REST休息）与原因、建议。生成训练建议前必须先调用本工具。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getRecentBodyStatus',
      description: '获取用户最近 N 天的身体状态记录与平均值（睡眠/疲劳/酸痛/意愿/身体状态）。用于了解近期的整体恢复水平。',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: '最近 N 天，默认7，最大30' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getFitnessMemory',
      description: '获取用户的长期健身记忆（fitness_memory）：训练偏好（喜欢的训练方式/动作/不喜欢动作/时间/时长）、训练习惯（周频率/常见时间/常缺席日/常见模式）、身体反馈（恢复慢部位/易疲劳动作/历史反馈）、目标（当前/历史）、AI 长期备注。用于个性化训练安排前了解用户长期偏好。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'saveFitnessMemory',
      description: '保存用户的长期健身记忆（全量）。⚠️ 仅限以下情况调用：① 对未来训练确实有价值；② 用户明确表达的长期偏好；③ 多次行为可确认的稳定习惯；④ 用户主动要求记住。一次性临时信息不得保存。禁止包含手机号/身份证/银行卡/邮箱/密码/住址等敏感信息。参数 memory 结构与 getFitnessMemory 返回一致（可只含部分区块）。',
      parameters: {
        type: 'object',
        properties: {
          memory: {
            type: 'object',
            description: '记忆内容（结构同 getFitnessMemory 返回，可只含部分区块）',
            properties: {
              training_preferences: { type: 'object', description: '训练偏好：preferred_training_styles(数组)/favorite_exercises(数组)/disliked_exercises(数组)/preferred_time(字符串)/preferred_duration(分钟数)' },
              training_habits: { type: 'object', description: '训练习惯：weekly_frequency(0-7)/common_time(字符串)/often_missed_days(数组)/common_patterns(数组)' },
              body_response: { type: 'object', description: '身体反馈：slow_recovery_parts(数组)/easily_tired_exercises(数组)/feedback(对象数组{content,date})' },
              goals: { type: 'object', description: '目标：current(字符串)/history(对象数组{content,date})/updated_at(日期)' },
              ai_notes: { type: 'array', items: { type: 'object' }, description: 'AI 长期备注（对象数组{content,date}）' }
            }
          }
        },
        required: ['memory']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateFitnessMemory',
      description: '局部更新长期记忆。section 指定区块（training_preferences/training_habits/body_response/goals/ai_notes）；data 为该区块字段的部分更新；或 append 追加内容（ai_notes 追加备注、goals 更新当前目标并自动记录历史、body_response 追加反馈）。同样禁止敏感信息。',
      parameters: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: ['training_preferences', 'training_habits', 'body_response', 'goals', 'ai_notes'], description: '要更新的区块' },
          data: { type: 'object', description: '该区块的部分字段（如 { favorite_exercises: ["卧推"] }）' },
          append: { type: 'string', description: '追加内容（与 data 二选一）' }
        },
        required: ['section']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteFitnessMemory',
      description: '删除长期记忆。不传 section 时清空全部记忆；传 section 时只删除该区块。用户明确要求忘记时使用。',
      parameters: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: ['training_preferences', 'training_habits', 'body_response', 'goals', 'ai_notes'], description: '要删除的区块（可选，缺省清空全部）' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getTrainingCycle',
      description: '获取用户当前训练周期（4~8 周）的程序计算数据：周期信息（目标/起止/总周数/当前周/是否减量周）、每周总结（训练天数/完成率/容量/PR数/体重变化/饮水/恢复 + 表现/进步/问题/下周建议）、周期总结（完成率/总容量/纪录数/表现变化 + 下周期建议）。所有统计由程序计算，AI 只解释不伪造。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getFitnessReport',
      description: '获取用户近期健身数据报告（程序计算）：训练（总/窗口内训练天数、窗口容量与前后半段趋势 up/flat/down、总容量、PR 数）、体重（当前/30天/90天变化）、饮水（近 N 天达标天数与总量）、恢复（平均疲劳/睡眠/酸痛）。用于回答“我最近有没有进步/训练和体重关系/恢复如何”等分析类问题。所有数字由程序计算，AI 只解释不伪造。',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: '统计窗口天数，默认30，最大90' } },
        required: []
      }
    }
  }
];

module.exports = {
  SYSTEM_PROMPT,
  getToolDefinitions: () => TOOL_DEFINITIONS
};



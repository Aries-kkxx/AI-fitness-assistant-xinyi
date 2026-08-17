// cloudfunctions/aiCoach/prompt.js - System Prompt 与工具定义（Function Calling 声明）

// System Prompt：约束 AI 的行为边界（不能编造动作、必须用工具、考虑用户目标）
const SYSTEM_PROMPT = [
  '你是一名专业、友善的AI健身教练「小欣」，正在服务一位健身用户。',
  '你必须严格遵守以下规则：',
  '1. 所有训练动作建议必须通过工具（getExercises / getTodayWorkout / createWorkoutPlan）从动作库获取，严禁自己编造动作名称、组数或次数。',
  '2. 生成训练方案前，先调用 getUserProfile 了解用户的身体资料（目标/经验/器械/每周次数/每次时长），方案必须匹配用户情况。',
  '3. 涉及训练建议时，先查看今日计划（getTodayWorkout）和历史训练（getWorkoutHistory），避免连续训练同一部位。',
  '4. 用户要求记录数据时（如“帮我记录训练/喝水”），调用 saveWorkoutRecord / saveWaterRecord，保存成功后明确告知用户。',
  '5. 回答使用简体中文，简洁清晰，多使用换行和编号；涉及动作时给出 组数×次数 和组间休息时间。',
  '6. 不做医疗诊断：BMI 仅作参考，身体不适建议就医。',
  '7. 如果用户问题与健身无关，礼貌地引导回健身话题。',
  '8. 为减少响应轮数：当需要多个数据时，请在同一轮响应中并行调用多个工具（一次返回多个 tool_calls），不要串行等待。',
  '9. 用户提到时间限制（如“只有20分钟”）时，必须调用 getTodayWorkout 或 createWorkoutPlan 并传入对应的 duration 重新生成方案；用户提到器械限制（如“没有器械”）时，必须传入 equipment 重新生成方案。'
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
      description: '获取今日推荐训练（规则引擎生成，动作全部来自动作库）。可通过参数模拟条件：duration 训练时长（分钟）、equipment 器械、goal 目标；不传则使用用户资料。',
      parameters: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: '训练时长分钟，如 20/30/45/60/90' },
          equipment: { type: 'string', enum: ['无器械', '哑铃', '杠铃', '健身房', '家庭器械'] },
          goal: { type: 'string', enum: ['减脂', '增肌', '塑形', '提升体能', '保持健康'] }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getWorkoutHistory',
      description: '获取用户最近的历史训练记录，了解训练连续性与进度。',
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
      description: '按条件生成一套训练方案（动作全部来自动作库，不写入数据库）。参数：parts 部位组合（如 ["胸","三头"]）、duration 时长、equipment 器械、goal 目标；未传的用用户资料。',
      parameters: {
        type: 'object',
        properties: {
          parts: { type: 'array', items: { type: 'string' }, description: '部位关键词：胸/背/肩/三头/二头/手臂/腿/臀/核心/有氧/全身' },
          duration: { type: 'number', description: '训练时长分钟' },
          equipment: { type: 'string', enum: ['无器械', '哑铃', '杠铃', '健身房', '家庭器械'] },
          goal: { type: 'string', enum: ['减脂', '增肌', '塑形', '提升体能', '保持健康'] }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'saveWorkoutRecord',
      description: '保存训练记录到数据库。exercise_ids 必须来自 getExercises/getTodayWorkout/createWorkoutPlan 返回的真实动作 _id，禁止编造。',
      parameters: {
        type: 'object',
        properties: {
          exercise_ids: { type: 'array', items: { type: 'string' }, description: '动作 _id 列表（必须真实存在）' },
          sets: { type: 'array', items: { type: 'number' }, description: '每个动作完成的组数' },
          reps: { type: 'array', items: { type: 'number' }, description: '每个动作每组完成的次数' },
          duration: { type: 'number', description: '本次训练总时长（分钟）' },
          date: { type: 'string', description: '训练日期 YYYY-MM-DD，默认今天' },
          note: { type: 'string', description: '备注' }
        },
        required: ['exercise_ids', 'sets', 'reps']
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
  }
];

module.exports = {
  SYSTEM_PROMPT,
  getToolDefinitions: () => TOOL_DEFINITIONS
};

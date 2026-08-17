// data/exercises.js - 动作库种子数据
// ⚠️ 重要：此文件仅用于「首次初始化」时导入云数据库 exercises 集合。
// 推荐引擎（services/recommend.js）运行时只从数据库查询动作，
// 禁止在推荐逻辑中直接使用本文件数据。
//
// 字段说明：
// sort: 排序号 | category: 分类（胸部/背部/肩部/手臂/腿部/臀部/核心/有氧/拉伸）
// target_muscle: 目标肌肉 | difficulty: 难度（初级/中级/高级）
// equipment: 所需器械（无器械/哑铃/杠铃/健身房/家庭器械）
// recommended_sets/recommended_reps: 推荐组数/次数（reps_unit: 次/秒/分钟）
// rest_seconds: 组间休息（秒）
// image_url/video_url: 占位（后续 Phase 再补充真实资源，不随意使用未授权素材）

module.exports = [
  // ========== 胸部 ==========
  {
    sort: 1, name: '俯卧撑', category: '胸部', target_muscle: ['胸大肌', '三头肌', '前三角'],
    difficulty: '初级', equipment: '无器械',
    description: '经典自重胸部训练，随时随地可做，是上肢推类动作的基础。',
    steps: ['双手略宽于肩撑地，身体呈一条直线', '屈肘下放身体至胸部接近地面', '发力推起至手臂伸直'],
    common_mistakes: ['塌腰或撅臀，核心没收紧', '下放过浅，行程不足'],
    tips: '全程保持核心收紧，下落时吸气，推起时呼气。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 2, name: '上斜俯卧撑', category: '胸部', target_muscle: ['胸大肌下束', '三头肌'],
    difficulty: '初级', equipment: '无器械',
    description: '手撑在台阶或桌沿的俯卧撑变式，比标准俯卧撑更轻松，适合新手入门。',
    steps: ['双手撑在稳固的高台边缘，身体倾斜', '屈肘下放身体，胸部靠近台面', '发力推起还原'],
    common_mistakes: ['臀部后移导致身体不呈直线', '只做半程'],
    tips: '台面越低难度越大，可循序渐进降低支撑高度。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 3, name: '哑铃卧推', category: '胸部', target_muscle: ['胸大肌', '三头肌', '前三角'],
    difficulty: '中级', equipment: '哑铃',
    description: '用哑铃在平凳上完成的卧推，动作幅度比杠铃更大，对胸肌刺激充分。',
    steps: ['仰卧平凳，双脚踩实地面，哑铃举至胸部两侧', '向上推起哑铃至手臂伸直，掌心相对', '缓慢下放至胸部两侧，感受胸肌拉伸'],
    common_mistakes: ['手腕后折，压力落在手腕', '下放过快失去控制'],
    tips: '肩胛骨全程后收下沉，推起时不要完全锁死手肘。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 10, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 4, name: '哑铃飞鸟', category: '胸部', target_muscle: ['胸大肌'],
    difficulty: '中级', equipment: '哑铃',
    description: '孤立刺激胸大肌的经典动作，强调胸肌的拉伸与收缩。',
    steps: ['仰卧平凳，双手持哑铃举于胸部上方', '手肘微屈，双臂向两侧弧形下放', '胸部发力将哑铃合拢还原'],
    common_mistakes: ['手肘弯曲过多变成推举', '下放过深导致肩部不适'],
    tips: '选择较轻重量，感受胸肌拉伸，下放 2 秒还原 1 秒。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 5, name: '杠铃卧推', category: '胸部', target_muscle: ['胸大肌', '三头肌', '前三角'],
    difficulty: '中级', equipment: '杠铃',
    description: '上肢力量训练之王，能使用较大重量全面发展胸肌与推类力量。',
    steps: ['仰卧卧推凳，双眼位于杠铃正下方，握距略宽于肩', '杠铃下放至胸部中缝位置', '发力推起至手臂伸直'],
    common_mistakes: ['握距过宽或过窄', '臀部离开凳面借力'],
    tips: '新手务必在保护架或同伴保护下训练，重量循序渐进。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 10, reps_unit: '次', rest_seconds: 90
  },
  {
    sort: 6, name: '坐姿夹胸', category: '胸部', target_muscle: ['胸大肌'],
    difficulty: '初级', equipment: '健身房',
    description: '固定器械夹胸，轨迹固定容易上手，适合孤立刺激胸肌。',
    steps: ['调整座椅高度，双手握把', '胸部发力将把手向中间夹拢', '缓慢还原至胸肌有拉伸感'],
    common_mistakes: ['用肩膀发力耸肩', '还原时完全放松'],
    tips: '顶峰收缩 1 秒再缓慢还原，控制离心速度。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },

  // ========== 背部 ==========
  {
    sort: 7, name: '超人式', category: '背部', target_muscle: ['竖脊肌', '下背'],
    difficulty: '初级', equipment: '无器械',
    description: '俯卧挺身训练下背部，改善体态、强化核心后链。',
    steps: ['俯卧垫上，双臂向前伸直', '同时抬起手臂、胸部和双腿离开地面', '保持 1-2 秒后缓慢放下'],
    common_mistakes: ['抬得太高导致腰部压力过大', '用爆发力猛抬'],
    tips: '动作要慢，感受下背收缩，不要追求高度。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 15, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 8, name: '哑铃划船', category: '背部', target_muscle: ['背阔肌', '斜方肌', '二头肌'],
    difficulty: '中级', equipment: '哑铃',
    description: '单臂哑铃划船，单侧训练背部厚度，纠正左右不平衡。',
    steps: ['单膝跪凳，同侧手撑凳，另一手持哑铃自然下垂', '背部发力将哑铃拉向髋部方向', '缓慢下放至手臂伸直'],
    common_mistakes: ['身体旋转借力', '耸肩代替背部发力'],
    tips: '想象手肘向后上方走，而不是用手臂拉。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 10, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 9, name: '杠铃划船', category: '背部', target_muscle: ['背阔肌', '斜方肌', '下背'],
    difficulty: '中级', equipment: '杠铃',
    description: '俯身杠铃划船，发展背部厚度的核心动作。',
    steps: ['俯身约 45 度，双手正握杠铃自然下垂', '背部发力将杠铃拉向下腹', '缓慢下放还原'],
    common_mistakes: ['身体过度直立变成耸肩', '腰部弯曲弓背'],
    tips: '全程保持腰背挺直，重量以能控制为准。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 10, reps_unit: '次', rest_seconds: 90
  },
  {
    sort: 10, name: '引体向上', category: '背部', target_muscle: ['背阔肌', '二头肌'],
    difficulty: '中级', equipment: '健身房',
    description: '最经典的自重背部训练，衡量上肢拉力的黄金动作。',
    steps: ['双手略宽于肩正握单杠，身体悬垂', '背部发力将下巴拉过杠面', '缓慢下放至手臂伸直'],
    common_mistakes: ['身体摆动借力', '只做半程'],
    tips: '做不了全程可先用弹力带辅助或做离心下落。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 8, reps_unit: '次', rest_seconds: 90
  },
  {
    sort: 11, name: '高位下拉', category: '背部', target_muscle: ['背阔肌', '二头肌'],
    difficulty: '初级', equipment: '健身房',
    description: '固定器械下拉，是引体向上的友好替代，新手也能稳定发力。',
    steps: ['坐稳，双手宽握横杆，大腿固定', '背部发力将横杆拉至锁骨上方', '缓慢还原至手臂伸直'],
    common_mistakes: ['身体后仰过多借力', '用二头肌硬拉'],
    tips: '挺胸收腹，下拉时肘部向下向后走。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 12, name: '坐姿划船', category: '背部', target_muscle: ['背阔肌', '斜方肌', '二头肌'],
    difficulty: '初级', equipment: '健身房',
    description: '坐姿绳索划船，训练背部中下部，改善圆肩驼背。',
    steps: ['坐稳，双脚踩踏板，微屈膝，双手握把', '背部发力将把手拉向腹部', '缓慢还原，感受背部拉伸'],
    common_mistakes: ['身体大幅前后晃动', '含胸弓背'],
    tips: '躯干保持稳定，只有手臂和肩胛在运动。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },

  // ========== 肩部 ==========
  {
    sort: 13, name: '哑铃肩推', category: '肩部', target_muscle: ['三角肌', '三头肌'],
    difficulty: '中级', equipment: '哑铃',
    description: '坐姿或站姿哑铃推举，全面发展肩部三角肌。',
    steps: ['双手持哑铃举至耳侧，掌心向前', '向上推起至手臂伸直', '缓慢下放至耳侧'],
    common_mistakes: ['腰部过度反弓借力', '推起时耸肩'],
    tips: '坐姿训练更稳定，核心收紧避免腰部代偿。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 10, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 14, name: '哑铃侧平举', category: '肩部', target_muscle: ['三角肌中束'],
    difficulty: '初级', equipment: '哑铃',
    description: '孤立训练三角肌中束，让肩膀看起来更宽。',
    steps: ['双手持哑铃垂于体侧，微屈肘', '向两侧平举至与肩同高', '缓慢下放还原'],
    common_mistakes: ['用惯性甩起哑铃', '举得过高导致耸肩'],
    tips: '重量宁轻勿重，感受中束发力，控制离心。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 15, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 15, name: '俯身飞鸟', category: '肩部', target_muscle: ['三角肌后束'],
    difficulty: '中级', equipment: '哑铃',
    description: '俯身哑铃飞鸟，强化易被忽视的三角肌后束，改善圆肩。',
    steps: ['俯身约 45 度，双手持哑铃自然下垂', '向两侧展开双臂至与肩同高', '缓慢下放还原'],
    common_mistakes: ['背部弓起', '用手臂甩动'],
    tips: '保持腰背平直，动作慢而稳，感受后束收缩。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 16, name: '杠铃推举', category: '肩部', target_muscle: ['三角肌', '三头肌'],
    difficulty: '高级', equipment: '杠铃',
    description: '站姿杠铃过头推举，综合发展肩部力量与核心稳定。',
    steps: ['站姿，杠铃置于锁骨前，握距略宽于肩', '向上推起杠铃过头顶至手臂伸直', '缓慢下放至锁骨位置'],
    common_mistakes: ['腰部过度反弓', '下放位置过低'],
    tips: '收紧臀部和核心，重量循序渐进，注意保护腰椎。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 8, reps_unit: '次', rest_seconds: 90
  },

  // ========== 手臂 ==========
  {
    sort: 17, name: '窄距俯卧撑', category: '手臂', target_muscle: ['三头肌', '胸大肌'],
    difficulty: '初级', equipment: '无器械',
    description: '双手与肩同宽的俯卧撑变式，重点强化肱三头肌。',
    steps: ['双手与肩同宽撑地，身体呈直线', '屈肘下放，肘部贴近身体两侧', '发力推起还原'],
    common_mistakes: ['手肘向外打开', '下放过浅'],
    tips: '肘部始终贴紧身体，感受三头肌发力。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 10, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 18, name: '哑铃弯举', category: '手臂', target_muscle: ['二头肌'],
    difficulty: '初级', equipment: '哑铃',
    description: '最经典的肱二头肌训练动作，哑铃版本可充分旋转手腕。',
    steps: ['站立手持哑铃垂于体侧，掌心向前', '二头发力将哑铃弯举至肩前', '缓慢下放至手臂伸直'],
    common_mistakes: ['身体后仰借力', '下放过快'],
    tips: '大臂夹紧身体不动，只有前臂在运动。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 19, name: '哑铃臂屈伸', category: '手臂', target_muscle: ['三头肌'],
    difficulty: '初级', equipment: '哑铃',
    description: '单臂哑铃颈后臂屈伸，孤立刺激肱三头肌。',
    steps: ['单手举哑铃过头，大臂贴近耳侧', '屈肘下放哑铃至颈后', '三头发力伸直手臂'],
    common_mistakes: ['大臂晃动', '肘部向外打开'],
    tips: '大臂固定不动，只做肘关节屈伸。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 20, name: '杠铃弯举', category: '手臂', target_muscle: ['二头肌'],
    difficulty: '中级', equipment: '杠铃',
    description: '杠铃弯举可使用更大重量，是发展二头肌围度的主力动作。',
    steps: ['站姿正握杠铃垂于体前', '二头发力将杠铃弯举至胸前', '缓慢下放还原'],
    common_mistakes: ['身体摆动借力', '手腕弯曲过多'],
    tips: '身体保持稳定，可选择 EZ 杆减轻手腕压力。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 10, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 21, name: '绳索下压', category: '手臂', target_muscle: ['三头肌'],
    difficulty: '中级', equipment: '健身房',
    description: '绳索下压保持恒定张力，是训练肱三头肌的高效器械动作。',
    steps: ['面对绳索机站立，双手握把，大臂夹紧身体', '三头发力将绳索向下压至手臂伸直', '缓慢还原至前臂与地面平行'],
    common_mistakes: ['肘部外展', '身体前倾借力'],
    tips: '大臂固定，下压到底时可将绳索向两侧分开强化收缩。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 45
  },

  // ========== 腿部 ==========
  {
    sort: 22, name: '深蹲', category: '腿部', target_muscle: ['股四头肌', '臀大肌', '腘绳肌'],
    difficulty: '初级', equipment: '无器械',
    description: '自重深蹲是下肢训练之王，任何水平都离不开的基础动作。',
    steps: ['双脚与肩同宽站立，脚尖微外展', '屈髋屈膝下蹲至大腿平行地面', '蹬地站起还原'],
    common_mistakes: ['膝盖内扣', '脚跟离地', '弯腰弓背'],
    tips: '重心落在脚掌中部，膝盖方向与脚尖一致。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 15, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 23, name: '弓步蹲', category: '腿部', target_muscle: ['股四头肌', '臀大肌'],
    difficulty: '初级', equipment: '无器械',
    description: '单侧下肢训练，改善平衡，对臀腿刺激全面。',
    steps: ['双脚前后站立，躯干挺直', '下蹲至前腿大腿平行地面，后膝接近地面', '前腿发力站起还原'],
    common_mistakes: ['前膝超过脚尖过多', '身体前倾'],
    tips: '上身保持直立，前脚掌发力蹬起。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 24, name: '哑铃深蹲', category: '腿部', target_muscle: ['股四头肌', '臀大肌'],
    difficulty: '中级', equipment: '哑铃',
    description: '双手持哑铃的高脚杯深蹲，用额外负重强化下肢力量。',
    steps: ['双手捧哑铃于胸前，双脚与肩同宽', '屈髋屈膝下蹲至大腿平行地面', '蹬地站起还原'],
    common_mistakes: ['哑铃远离身体', '膝盖内扣'],
    tips: '哑铃贴近胸口，保持腰背挺直。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 25, name: '杠铃深蹲', category: '腿部', target_muscle: ['股四头肌', '臀大肌', '腘绳肌'],
    difficulty: '高级', equipment: '杠铃',
    description: '杠铃深蹲是力量训练三大项之一，全面强化下肢与核心。',
    steps: ['杠铃置于上背，双脚与肩同宽', '屈髋屈膝下蹲至大腿平行地面或更低', '蹬地站起还原'],
    common_mistakes: ['膝盖内扣', '弓腰', '重心前移'],
    tips: '务必在深蹲架内训练并使用保护杠，动作质量优先。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 10, reps_unit: '次', rest_seconds: 90
  },
  {
    sort: 26, name: '腿举', category: '腿部', target_muscle: ['股四头肌', '臀大肌'],
    difficulty: '初级', equipment: '健身房',
    description: '腿举机训练腿部，轨迹固定、对腰部压力小，安全高效。',
    steps: ['坐稳，双脚踩在踏板中部，与肩同宽', '解锁后屈膝下放至 90 度左右', '蹬起至膝盖接近伸直但不锁死'],
    common_mistakes: ['下放过深导致臀部离座', '膝盖锁死'],
    tips: '腰部始终贴紧靠垫，控制下放速度。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 27, name: '罗马尼亚硬拉', category: '腿部', target_muscle: ['腘绳肌', '臀大肌', '竖脊肌'],
    difficulty: '高级', equipment: '杠铃',
    description: '强调髋部铰链的硬拉变式，重点发展大腿后侧与臀部。',
    steps: ['站姿持杠铃于体前，微屈膝', '髋部后移，杠铃沿大腿下滑至小腿中部', '臀部发力站直还原'],
    common_mistakes: ['弓背', '杠铃远离身体'],
    tips: '杠铃全程贴近腿部，感受腘绳肌拉伸。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 10, reps_unit: '次', rest_seconds: 90
  },

  // ========== 臀部 ==========
  {
    sort: 28, name: '臀桥', category: '臀部', target_muscle: ['臀大肌', '腘绳肌'],
    difficulty: '初级', equipment: '无器械',
    description: '仰卧臀桥，激活并强化臀部，改善久坐导致的臀肌无力。',
    steps: ['仰卧屈膝，双脚踩地，与髋同宽', '臀部发力将髋部顶起至躯干与大腿成直线', '顶端夹紧臀部 1 秒后缓慢下放'],
    common_mistakes: ['用腰部代偿顶髋', '顶端不夹臀'],
    tips: '顶端想象臀部夹硬币，呼气发力。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 15, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 29, name: '哑铃臀桥', category: '臀部', target_muscle: ['臀大肌'],
    difficulty: '中级', equipment: '哑铃',
    description: '在臀桥基础上增加负重，更高效地发展臀大肌力量。',
    steps: ['仰卧屈膝，将哑铃放在髋部上方', '臀部发力顶起髋部至躯干与大腿成直线', '缓慢下放还原'],
    common_mistakes: ['重量压在腹部不适', '动作过快'],
    tips: '可用毛巾垫在哑铃下，全程控制节奏。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 12, reps_unit: '次', rest_seconds: 60
  },
  {
    sort: 30, name: '杠铃臀推', category: '臀部', target_muscle: ['臀大肌'],
    difficulty: '高级', equipment: '杠铃',
    description: '臀部训练最强动作，可承受大重量，顶峰收缩明显。',
    steps: ['上背靠凳，杠铃置于髋部，屈膝踩地', '臀部发力将髋部顶起至躯干与大腿成直线', '顶端夹臀 1-2 秒后缓慢下放'],
    common_mistakes: ['腰部反弓', '下巴过度后仰'],
    tips: '用护垫保护髋部，重量循序渐进，感受臀肌发力。',
    image_url: '', video_url: '', recommended_sets: 4, recommended_reps: 10, reps_unit: '次', rest_seconds: 90
  },

  // ========== 核心 ==========
  {
    sort: 31, name: '平板支撑', category: '核心', target_muscle: ['腹横肌', '腹直肌'],
    difficulty: '初级', equipment: '无器械',
    description: '静态核心训练，强化深层腹肌与躯干稳定，改善体态。',
    steps: ['俯卧，前臂撑地，肘在肩正下方', '双脚脚尖撑地，身体呈一条直线', '保持姿势，正常呼吸，坚持规定时间'],
    common_mistakes: ['塌腰', '撅臀', '憋气'],
    tips: '收紧腹部和臀部，时间比姿势重要，塌腰即结束。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 30, reps_unit: '秒', rest_seconds: 45
  },
  {
    sort: 32, name: '卷腹', category: '核心', target_muscle: ['腹直肌'],
    difficulty: '初级', equipment: '无器械',
    description: '针对腹直肌的经典动作，比仰卧起坐更安全，避免腰部代偿。',
    steps: ['仰卧屈膝，双手轻扶耳侧', '腹部发力卷起肩胛骨离地', '缓慢下放还原'],
    common_mistakes: ['用手拉脖子', '整个背部完全离地'],
    tips: '下背贴地，只卷起上背部，顶峰呼气收紧。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 15, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 33, name: '俄罗斯转体', category: '核心', target_muscle: ['腹斜肌'],
    difficulty: '初级', equipment: '无器械',
    description: '坐姿转体训练腹斜肌，强化旋转稳定性。',
    steps: ['坐姿屈膝，上身后倾约 45 度，双手交叠于胸前', '躯干向一侧旋转，双手触地', '回到中间再转向另一侧'],
    common_mistakes: ['只转手臂不转躯干', '弓背'],
    tips: '双脚可抬离地面增加难度，旋转来自胸椎。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 20, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 34, name: '登山跑', category: '核心', target_muscle: ['腹直肌', '髂腰肌', '肩部'],
    difficulty: '中级', equipment: '无器械',
    description: '动态核心训练，同时提升心率，兼具燃脂效果。',
    steps: ['俯撑姿势，身体呈直线', '交替提膝向胸口方向跑动', '保持核心稳定，速度均匀'],
    common_mistakes: ['臀部抬得过高', '肩膀前后晃动'],
    tips: '肩膀在手腕正上方，提膝幅度大而稳。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 20, reps_unit: '次', rest_seconds: 45
  },

  // ========== 有氧 ==========
  {
    sort: 35, name: '开合跳', category: '有氧', target_muscle: ['全身', '心肺'],
    difficulty: '初级', equipment: '无器械',
    description: '全身性有氧热身动作，快速提升心率，简单高效。',
    steps: ['站立，双手垂于体侧', '跳起同时双脚向外打开、双手头顶击掌', '跳回原位重复'],
    common_mistakes: ['落地膝盖锁死', '节奏过快'],
    tips: '落地时膝盖微屈缓冲，保持均匀呼吸。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 30, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 36, name: '高抬腿', category: '有氧', target_muscle: ['髂腰肌', '股四头肌', '心肺'],
    difficulty: '初级', equipment: '无器械',
    description: '原地高抬腿跑，高效有氧动作，强化心肺与下肢。',
    steps: ['原地站立，躯干微前倾', '快速交替将膝盖抬至髋部高度', '手臂配合摆动，保持节奏'],
    common_mistakes: ['上身后仰', '抬腿高度不足'],
    tips: '前脚掌着地，核心收紧保持躯干稳定。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 30, reps_unit: '次', rest_seconds: 45
  },
  {
    sort: 37, name: '跳绳', category: '有氧', target_muscle: ['小腿', '心肺'],
    difficulty: '初级', equipment: '无器械',
    description: '燃脂效率极高的有氧运动，锻炼协调性与心肺功能。',
    steps: ['双手持绳，绳在身后', '手腕摇绳，前脚掌轻跳越过绳子', '保持节奏与呼吸'],
    common_mistakes: ['手臂大幅摆动', '跳得过高'],
    tips: '手腕发力摇绳，跳跃高度刚好越过绳子即可。',
    image_url: '', video_url: '', recommended_sets: 3, recommended_reps: 1, reps_unit: '分钟', rest_seconds: 45
  },
  {
    sort: 38, name: '跑步机慢跑', category: '有氧', target_muscle: ['心肺', '下肢'],
    difficulty: '初级', equipment: '健身房',
    description: '跑步机匀速慢跑，稳定提升心肺耐力，适合作为减脂有氧。',
    steps: ['设置 6-8 km/h 的速度开始慢跑', '保持躯干直立，自然摆臂', '持续跑满规定时间后减速结束'],
    common_mistakes: ['扶着扶手跑', '速度过快无法坚持'],
    tips: '保持能说话的速度，先保证时长再提升速度。',
    image_url: '', video_url: '', recommended_sets: 1, recommended_reps: 20, reps_unit: '分钟', rest_seconds: 0
  },

  // ========== 拉伸 ==========
  {
    sort: 39, name: '站姿体前屈', category: '拉伸', target_muscle: ['腘绳肌', '下背'],
    difficulty: '初级', equipment: '无器械',
    description: '站姿前屈拉伸大腿后侧与下背，训练后放松常用。',
    steps: ['站姿，双脚与髋同宽', '呼气缓慢前屈，双手自然下垂', '保持拉伸感，不要弹震'],
    common_mistakes: ['弓背硬够地面', '膝盖锁死弹震'],
    tips: '微屈膝即可，拉伸感比幅度更重要。',
    image_url: '', video_url: '', recommended_sets: 2, recommended_reps: 20, reps_unit: '秒', rest_seconds: 30
  },
  {
    sort: 40, name: '胸部拉伸', category: '拉伸', target_muscle: ['胸大肌'],
    difficulty: '初级', equipment: '无器械',
    description: '门框胸部拉伸，缓解胸肌紧张，改善圆肩体态。',
    steps: ['手臂扶住门框，肘部与肩同高', '身体向前缓慢前倾', '保持拉伸感 20 秒换边'],
    common_mistakes: ['耸肩', '用力过猛'],
    tips: '拉伸感适中即可，配合深呼吸放松。',
    image_url: '', video_url: '', recommended_sets: 2, recommended_reps: 20, reps_unit: '秒', rest_seconds: 30
  },
  {
    sort: 41, name: '猫式伸展', category: '拉伸', target_muscle: ['脊柱', '背部'],
    difficulty: '初级', equipment: '无器械',
    description: '四足跪姿脊柱流动，放松背部与腰部，适合训练后恢复。',
    steps: ['四足跪姿，手在肩下、膝在髋下', '吸气塌腰抬头，呼气拱背低头', '缓慢流动 15 秒'],
    common_mistakes: ['动作过快', '手臂完全伸直锁死'],
    tips: '跟随呼吸节奏，幅度以舒适为准。',
    image_url: '', video_url: '', recommended_sets: 2, recommended_reps: 15, reps_unit: '秒', rest_seconds: 30
  }
];

// cloudfunctions/aiCoach/index.js - AI 健身教练云函数入口
// Agent 循环：
//   用户消息 → LLM(带工具定义) → 若返回 tool_calls → 执行工具(数据库) → 结果回填 → 再问 LLM
//   → 直到 LLM 给出最终回答（最多 MAX_ROUNDS 轮）
// 安全：
//   - API Key 只存在于云函数（config.js / 环境变量），前端不可见
//   - 所有用户数据操作通过 tools.js 按 openid 隔离
//   - 输入长度限制（防滥用），工具结果截断（防上下文溢出）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const config = require('./config');
const { callLLM } = require('./llm');
const { SYSTEM_PROMPT } = require('./prompt');
const { executeTool } = require('./tools');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const userText = String(event.userText || '').trim().slice(0, 500);
  const history = Array.isArray(event.history) ? event.history.slice(-10) : [];
  console.log('[aiCoach] 请求 openid=', OPENID, 'text=', userText);

  // 配置检查
  if (!config.API_KEY) {
    console.error('[aiCoach] 未配置 API Key');
    return {
      reply: 'AI 教练还没有配置 API Key：请在云函数 aiCoach 的 config.js 中填写，或配置环境变量 AI_API_KEY。',
      fallback: true
    };
  }
  if (!userText) {
    return { reply: '请告诉我你想问什么？例如「今天应该练什么？」' };
  }

  const startedAt = Date.now();
  const toolLog = [];

  // 组装消息：System + 历史（角色转换 ai→assistant）+ 当前问题
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 500)
    })),
    { role: 'user', content: userText }
  ];

  try {
    for (let round = 0; round < config.MAX_ROUNDS; round++) {
      const resp = await callLLM(messages);
      const msg = resp.choices && resp.choices[0] && resp.choices[0].message;
      if (!msg) {
        throw new Error('LLM 返回格式异常');
      }

      messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: msg.tool_calls
      });

      // 无工具调用 → 最终回答
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        console.log('[aiCoach] 完成, 轮数=', round + 1, '耗时=', Date.now() - startedAt, 'ms');
        const finalReply = (msg.content || '').trim();
        return {
          // 兜底：LLM 返回空内容时给出友好回复
          reply: finalReply || '我已经查到了相关信息，但没能组织好回答，请再问我一次。',
          toolLog
        };
      }

      // 依次执行工具，结果回填给 LLM
      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch (err) {
          args = {};
        }
        const result = await executeTool(OPENID, name, args);
        toolLog.push({ tool: name, args });
        console.log(
          '[aiCoach] 工具=', name,
          '参数=', JSON.stringify(args),
          '结果=', JSON.stringify(result).slice(0, 300)
        );
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 4000)
        });
      }
    }

    console.log('[aiCoach] 超过最大轮数');
    return {
      reply: '这个问题有点复杂，我思考了很多步还没有得出结论，请换个更具体的问题试试。',
      toolLog
    };
  } catch (err) {
    console.error('[aiCoach] 调用失败', err);
    return {
      reply: 'AI 教练暂时无法响应，请稍后再试。',
      error: true,
      // 错误摘要仅用于排查（前端只 console 输出，不展示给用户）
      errorMessage: String((err && err.message) || err).slice(0, 300),
      toolLog
    };
  }
};

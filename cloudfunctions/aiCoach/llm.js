// cloudfunctions/aiCoach/llm.js - 大模型调用封装
// 使用 Node 原生 https 调用 OpenAI 兼容接口（无需额外 npm 依赖）
// 支持 Function Calling（tools + tool_choice）
const https = require('https');
const config = require('./config');

/**
 * 调用大模型
 * @param {Array} messages 消息列表（system/user/assistant/tool）
 * @returns {Promise<Object>} OpenAI 兼容的响应 JSON
 */
function callLLM(messages) {
  const toolDefs = require('./prompt').getToolDefinitions();
  const body = JSON.stringify({
    model: config.MODEL,
    messages,
    tools: toolDefs,
    tool_choice: 'auto',
    max_tokens: 1500,
    temperature: 0.7,
    stream: false
  });

  return new Promise((resolve, reject) => {
    const url = new URL(config.BASE_URL + '/chat/completions');
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + config.API_KEY,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: config.TIMEOUT_MS
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error('LLM 接口错误: ' + JSON.stringify(json.error)));
            } else {
              resolve(json);
            }
          } catch (err) {
            reject(new Error('LLM 响应解析失败: ' + data.slice(0, 300)));
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('LLM 请求超时'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  callLLM
};

// cloudfunctions/aiCoach/config.js - AI 服务配置
// ⚠️ 安全：此文件只存在于云函数端，小程序前端永远无法读取。
// API Key 获取优先级：
//   1. 云函数环境变量 AI_API_KEY（推荐，云开发控制台 → 云函数 → aiCoach → 配置 → 环境变量）
//   2. 下方 API_KEY 字段直接填写（仅存云端，不要提交到公开仓库）
module.exports = {
  // OpenAI 兼容接口地址（DeepSeek）
  BASE_URL: 'https://api.deepseek.com',
  // 你的 API Key（优先读环境变量；环境变量为空时使用此值）
  API_KEY: process.env.AI_API_KEY || '',
  // 模型名称
  MODEL: 'deepseek-chat',
  // Agent 最大工具调用轮数（防止死循环；配合 prompt 并行调用指令，通常 2-3 轮内完成）
  MAX_ROUNDS: 4,
  // LLM 请求超时（毫秒）
  TIMEOUT_MS: 30000
};

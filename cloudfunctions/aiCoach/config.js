// cloudfunctions/aiCoach/config.js - AI 服务配置
// ⚠️ 安全：此文件只存在于云函数端，小程序前端永远无法读取。
// API Key 获取：仅从云函数环境变量 AI_API_KEY 读取（云开发控制台 → 云函数 → aiCoach → 配置 → 环境变量）。
// 严禁在本文件硬编码密钥（历史版本曾硬编码导致密钥入库泄露，已移除；如仍使用旧 Key 请务必在控制台轮换）。
module.exports = {
  // OpenAI 兼容接口地址（DeepSeek）
  BASE_URL: 'https://api.deepseek.com',
  // API Key：只读环境变量；未配置时返回空，入口会给出明确提示
  API_KEY: process.env.AI_API_KEY || '',
  // 模型名称
  MODEL: 'deepseek-chat',
  // Agent 最大工具调用轮数（防止死循环；配合 prompt 并行调用指令，通常 2-3 轮内完成）
  MAX_ROUNDS: 4,
  // LLM 请求超时（毫秒）
  TIMEOUT_MS: 30000
};

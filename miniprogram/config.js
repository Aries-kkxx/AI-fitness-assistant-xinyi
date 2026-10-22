// config.js - 全局统一配置（前端可安全包含，绝不存放任何密钥）
// ⚠️ 安全红线：本文件会被打进小程序包体，严禁写入 AppSecret / API Key / 后端密钥。
//    所有密钥（含微信 AppSecret）只存在于你的后端服务器，绝不会出现在小程序前端。
//
// 当前为「欢迎页模式」：小程序不调用任何后端登录接口，故无 API 配置块。
// 若将来重新接入登录/业务接口，再在此处新增 API: { BASE_URL, ... }。
module.exports = {
  // 数据层（饮水/体重/训练等）仍使用微信云开发（云数据库）
  CLOUD_ENV: '',

  // 本地存储键
  STORAGE_KEYS: {
    TOKEN: 'token',        // 登录 token（wx.setStorageSync('token', token)）
    USER: 'userInfo',      // 当前用户信息（wx.setStorageSync('userInfo', user)）
    AGREED: 'agreed_terms' // 是否已同意协议
  },

  // user 缓存有效期（毫秒），与后端 token 有效期保持一致即可
  TOKEN_TTL: 30 * 24 * 60 * 60 * 1000, // 30 天

  // 协议文档地址（H5 版，仅预留配置项，当前不生效）
  // ⚠️ 说明：小程序内点击协议会打开「原生协议页」（pages/agreement）完整展示内容，
  //    不依赖外部域名，也不调用任何剪贴板/浏览器能力。
  //    为避免触发微信隐私接口（Clipboard），原生协议页已移除「复制 H5 链接」功能，
  //    以下两个地址仅作为未来接入 web-view 展示的预留字段，请保持空字符串。
  AGREEMENT: {
    TERMS_URL: '',   // 用户协议 H5 地址（预留，不使用，请保持空）
    PRIVACY_URL: ''  // 隐私政策 H5 地址（预留，不使用，请保持空）
  }
};

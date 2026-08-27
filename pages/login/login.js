// pages/login/login.js - 欢迎页逻辑（无需登录）
// 本页作为欢迎/协议页：用户勾选协议后点「进入小程序」即可进入主页，无需登录。
// 协议链接跳转小程序内原生协议页（pages/agreement），不依赖外部域名。
const config = require('../../config');

Page({
  data: {
    agreed: false      // 是否已同意协议（未同意时不可进入）
  },

  onLoad() {
    // 回显「上次是否同意过协议」，减少重复勾选。
    try {
      if (wx.getStorageSync(config.STORAGE_KEYS.AGREED)) {
        this.setData({ agreed: true });
      }
    } catch (e) {}
  },

  // 勾选/取消协议
  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  // 打开《用户协议》（小程序内原生协议页，无需外部域名即可查看全文）
  onOpenTerms() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=terms' });
  },

  // 打开《隐私政策》（小程序内原生协议页）
  onOpenPrivacy() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' });
  },

  // 进入小程序（欢迎页入口：无需登录，仅需先同意协议）
  onEnter() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    try { wx.setStorageSync(config.STORAGE_KEYS.AGREED, true); } catch (e) {}
    wx.reLaunch({ url: '/pages/index/index' });
  }
});

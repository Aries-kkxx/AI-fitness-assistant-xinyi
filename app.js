// app.js - 小程序入口文件
// 整个小程序只会执行一次 App()，在这里做全局初始化。
const exerciseService = require('./services/exercise');

App({
  onLaunch() {
    // 小程序初始化完成时触发（早于任何页面 onLoad）
    console.log('AI健身助手 - 小程序启动');

    // 初始化云开发环境（饮水、训练等功能依赖云数据库）
    // 基础库需 >= 2.2.3；不传 env 时使用云开发默认环境
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请使用 2.2.3 或以上版本以使用云能力');
    } else {
      wx.cloud.init({
        // env: 'your-env-id', // 如有多个环境，可在此指定环境 ID
        traceUser: true
      });
      // 初始化动作库（幂等：exercises 集合已有数据则跳过）
      exerciseService.initExercisesIfEmpty();
    }

    // 登录已取消：小程序启动后直接进入「欢迎页」(pages[0]=login)，
    // 用户勾选协议后点「进入小程序」即可进入主页，无需登录态校验。
  }
});

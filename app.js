// app.js - 小程序入口文件
// 整个小程序只会执行一次 App()，在这里做全局初始化
const exerciseService = require('./services/exercise');

App({
  onLaunch() {
    // 小程序初始化完成时触发
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
      // 种子数据仅用于首次导入，运行时的推荐全部从数据库查询
      exerciseService.initExercisesIfEmpty();
    }
  },

  globalData: {
    // 全局共享数据（后续 Phase 可存放用户信息等）
    userInfo: null
  }
});

// pages/ai/ai.js - AI健身教练聊天页
// 流程：用户输入 → 调用云函数 aiCoach（Agent 自动选择工具）→ 展示回复
// fallback：云函数调用失败时，使用本地规则引擎给出回答（不依赖 AI）
const userService = require('../../services/user');
const waterService = require('../../services/water');
const recommendService = require('../../services/recommend');

Page({
  data: {
    messages: [], // [{ role: 'user'|'ai', content, isFallback, toolLog }]
    inputValue: '',
    sending: false,
    scrollToId: '',
    hasUser: false,
    quickQuestions: [
      '今天应该练什么？',
      '我今天只有20分钟',
      '我没有器械怎么办？',
      '帮我记录今天的训练',
      '我喝水情况怎么样？'
    ]
  },

  onShow() {
    this.checkUser();
  },

  // 检查用户是否已填写资料（未填写时顶部提示）
  async checkUser() {
    try {
      const user = await userService.getUser();
      this.setData({ hasUser: !!user });
    } catch (err) {
      console.error('[ai] 检查用户资料失败', err);
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onQuickTap(e) {
    this.send(e.currentTarget.dataset.text);
  },

  onSend() {
    this.send(this.data.inputValue);
  },

  // 发送消息
  async send(text) {
    text = (text || '').trim();
    if (!text || this.data.sending) return;
    this.setData({ inputValue: '' });

    // 追加用户消息
    const messages = this.data.messages.concat([{ role: 'user', content: text }]);
    this.setData({ messages });
    this.scrollToBottom(messages.length - 1);

    // 组装对话历史（最近 10 条，作为上下文传给云函数）
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'ai')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    this.setData({ sending: true });

    let replyText = '';
    let isFallback = false;
    let toolLog = [];

    try {
      const res = await wx.cloud.callFunction({
        name: 'aiCoach',
        data: { userText: text, history },
        timeout: 60000 // AI 多轮工具调用较慢，放宽超时
      });
      const result = res.result || {};
      replyText = result.reply || 'AI 教练暂时无法响应，请稍后再试。';
      toolLog = result.toolLog || [];
      if (result.error) {
        // 云函数内部错误：仅输出到控制台辅助排查，不展示给用户
        console.warn('[ai] 云函数返回错误:', result.errorMessage || '未知错误');
      }
    } catch (err) {
      // AI 不可用 → 本地规则兜底
      console.error('[ai] 云函数调用失败，使用本地规则兜底', err && err.errMsg ? err.errMsg : err);
      replyText = await this.buildFallbackReply(text);
      isFallback = true;
    }

    this.setData({
      messages: this.data.messages.concat([{ role: 'ai', content: replyText, isFallback, toolLog }]),
      sending: false
    });
    this.scrollToBottom(this.data.messages.length - 1);
  },

  // 本地规则兜底：根据关键词给出基于本地数据的回答
  // （本地规则引擎只能按用户资料生成，无法模拟“20分钟/无器械”等临时条件，
  //   匹配到训练相关问题时展示今日计划并说明）
  async buildFallbackReply(text) {
    try {
      const user = await userService.getUser();
      if (!user) {
        return '你还没有填写个人资料，请先到「我的」→「我的资料」填写，我才能为你推荐训练。';
      }
      const aboutWorkout =
        text.indexOf('练') >= 0 ||
        text.indexOf('训练') >= 0 ||
        text.indexOf('分钟') >= 0 ||
        text.indexOf('时间') >= 0 ||
        text.indexOf('器械') >= 0 ||
        text.indexOf('动作') >= 0;
      if (aboutWorkout) {
        const w = await recommendService.getTodayWorkout(user);
        if (w.isRestDay) {
          return '今天是休息日，好好恢复，明天再练！';
        }
        let s = '今日训练（' + w.partsText + '）：\n';
        w.exercises.forEach((e, i) => {
          s += i + 1 + '. ' + e.name + '　' + e.sets + '组×' + e.reps + e.repsUnit + '　休息' + e.restSeconds + 's\n';
        });
        s += '共 ' + w.count + ' 个动作，约 ' + w.totalMinutes + ' 分钟。\n';
        s += '（AI 在线时可按你的时间/器械条件重新组合训练，请稍后重试）';
        return s;
      }
      if (text.indexOf('水') >= 0) {
        const stats = await waterService.getTodayStats();
        return (
          '今日饮水：' + stats.total + ' / ' + stats.target + 'ml（' +
          stats.cups + '/' + stats.dailyCups + '杯），完成率 ' + stats.percent + '%。'
        );
      }
      return '（AI 暂时不可用）你可以问我：今天练什么？今天只有20分钟怎么办？我没有器械怎么练？帮我记录喝水。';
    } catch (err) {
      return '（AI 暂时不可用）请稍后再试，也可以直接使用首页 / 训练 / 饮水功能。';
    }
  },

  // 滚动到底部（scroll-into-view）
  scrollToBottom(index) {
    this.setData({ scrollToId: 'msg-' + index });
  },

  // 去填写资料
  onGoUserInfo() {
    wx.navigateTo({ url: '/pages/user-info/user-info' });
  }
});

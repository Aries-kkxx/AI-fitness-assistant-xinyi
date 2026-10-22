// pages/recovery/recovery.js - 每日身体状态记录页（极简交互，约 10 秒完成）
// 记录项：睡眠质量 / 疲劳程度 / 肌肉酸痛 / 训练意愿 / 今日身体状态（各 1-5）+ 备注
// 能力：当天 upsert 保存、按日期修改（点历史项载入表单）、删除、历史查询
// 数据层：services/recovery.js（openid + 日期隔离）
const { formatDate } = require('../../utils/date');
const { scoreText } = require('../../utils/training-state');
const recoveryService = require('../../services/recovery');

const DEFAULT_FORM = {
  sleepQuality: 3,
  fatigue: 3,
  soreness: 3,
  motivation: 3,
  bodyStatus: 3,
  note: ''
};

Page({
  data: {
    loading: true,
    currentDate: '', // 正在编辑的日期（默认今天）
    isToday: true,
    form: Object.assign({}, DEFAULT_FORM),
    texts: {
      sleepText: '一般',
      fatigueText: '一般',
      sorenessText: '一般',
      motivationText: '一般',
      bodyText: '一般'
    },
    hasCurrent: false, // 当前日期是否已有记录
    history: [] // 历史列表 [{ date, summary, body, note }]
  },

  onLoad() {
    const today = formatDate(new Date());
    this.setData({ currentDate: today, isToday: true });
    this.loadForm(today);
    this.loadHistory();
  },

  // 载入指定日期的记录到表单（无记录则重置默认值）
  async loadForm(date) {
    this.setData({ loading: true });
    try {
      const rec = await recoveryService.getRecoveryByDate(date);
      if (rec) {
        this.setData({
          form: {
            sleepQuality: rec.sleep_quality || 3,
            fatigue: rec.fatigue || 3,
            soreness: rec.soreness || 3,
            motivation: rec.motivation || 3,
            bodyStatus: rec.body_status || 3,
            note: rec.note || ''
          },
          hasCurrent: true
        });
      } else {
        this.setData({ form: Object.assign({}, DEFAULT_FORM), hasCurrent: false });
      }
      this.updateTexts();
    } catch (err) {
      console.error('[recovery] 载入记录失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 刷新评分档位文案
  updateTexts() {
    const f = this.data.form;
    this.setData({
      texts: {
        sleepText: scoreText('sleep', f.sleepQuality),
        fatigueText: scoreText('fatigue', f.fatigue),
        sorenessText: scoreText('soreness', f.soreness),
        motivationText: scoreText('motivation', f.motivation),
        bodyText: scoreText('body', f.bodyStatus)
      }
    });
  },

  onSliderChange(e) {
    const key = e.currentTarget.dataset.key;
    const value = Number(e.detail.value);
    this.setData({ ['form.' + key]: value }, () => this.updateTexts());
  },

  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value });
  },

  // 保存（当天或正在编辑的历史日期，upsert）
  async onSave() {
    const { form, currentDate } = this.data;
    wx.showLoading({ title: '保存中...' });
    try {
      await recoveryService.saveRecovery({
        date: currentDate,
        sleep_quality: form.sleepQuality,
        fatigue: form.fatigue,
        soreness: form.soreness,
        motivation: form.motivation,
        body_status: form.bodyStatus,
        note: form.note
      });
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ hasCurrent: true });
      this.loadHistory();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  // 删除当前表单日期记录
  onDelete() {
    const { currentDate } = this.data;
    this.confirmDelete(currentDate);
  },

  // 历史列表删除
  onDeleteHistory(e) {
    const date = e.currentTarget.dataset.date;
    this.confirmDelete(date);
  },

  confirmDelete(date) {
    wx.showModal({
      title: '删除记录',
      content: '确定删除 ' + date + ' 的身体状态记录？',
      confirmText: '删除',
      confirmColor: '#FF6B6B',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await recoveryService.deleteRecovery(date);
          wx.showToast({ title: '已删除', icon: 'none' });
          if (date === this.data.currentDate) {
            this.setData({ hasCurrent: false, form: Object.assign({}, DEFAULT_FORM) });
            this.updateTexts();
          }
          this.loadHistory();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  // 点击历史项 → 载入该天数据编辑
  onEditHistory(e) {
    const date = e.currentTarget.dataset.date;
    const today = formatDate(new Date());
    this.setData({ currentDate: date, isToday: date === today });
    this.loadForm(date);
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  // 回到今天
  onBackToToday() {
    const today = formatDate(new Date());
    this.setData({ currentDate: today, isToday: true });
    this.loadForm(today);
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  // 历史列表
  async loadHistory() {
    try {
      const history = await recoveryService.getRecoveryHistory(30);
      const list = history.map((r) => ({
        date: r.date,
        summary:
          '睡眠' + (r.sleep_quality || '-') +
          ' · 疲劳' + (r.fatigue || '-') +
          ' · 酸痛' + (r.soreness || '-') +
          ' · 意愿' + (r.motivation || '-'),
        body: scoreText('body', r.body_status),
        note: r.note || ''
      }));
      this.setData({ history: list });
    } catch (err) {
      console.error('[recovery] 历史加载失败', err);
    }
  },

  onBack() {
    wx.navigateBack();
  }
});

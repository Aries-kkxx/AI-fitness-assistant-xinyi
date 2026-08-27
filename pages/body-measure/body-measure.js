// pages/body-measure/body-measure.js - 身体围度记录页
// 记录体脂率（可选）与腰围/胸围/臀围/手臂围/大腿围（cm），每天一条（upsert）
const { formatDate } = require('../../utils/date');
const bodyMeasureService = require('../../services/body-measurement');

const FIELDS = [
  { key: 'waist_cm', label: '腰围', unit: 'cm' },
  { key: 'chest_cm', label: '胸围', unit: 'cm' },
  { key: 'hip_cm', label: '臀围', unit: 'cm' },
  { key: 'arm_cm', label: '手臂围', unit: 'cm' },
  { key: 'thigh_cm', label: '大腿围', unit: 'cm' }
];

Page({
  data: {
    loading: true,
    currentDate: '',
    today: '',
    fields: FIELDS,
    form: { body_fat_pct: '', waist_cm: '', chest_cm: '', hip_cm: '', arm_cm: '', thigh_cm: '' },
    hasCurrent: false,
    history: []
  },

  onLoad() {
    const today = formatDate(new Date());
    this.setData({ currentDate: today, today });
    this.loadForm(today);
    this.loadHistory();
  },

  async loadForm(date) {
    this.setData({ loading: true });
    try {
      const rec = await bodyMeasureService.getByDate(date);
      if (rec) {
        const form = {};
        form.body_fat_pct = rec.body_fat_pct ? String(rec.body_fat_pct) : '';
        FIELDS.forEach((f) => {
          form[f.key] = rec[f.key] ? String(rec[f.key]) : '';
        });
        this.setData({ form, hasCurrent: true });
      } else {
        this.setData({
          form: { body_fat_pct: '', waist_cm: '', chest_cm: '', hip_cm: '', arm_cm: '', thigh_cm: '' },
          hasCurrent: false
        });
      }
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  async onSave() {
    const { form, currentDate } = this.data;
    // 至少填一项
    const hasAny = Object.keys(form).some((k) => (form[k] || '').trim() !== '');
    if (!hasAny) {
      wx.showToast({ title: '请至少填写一项', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      const payload = { date: currentDate };
      Object.keys(form).forEach((k) => {
        payload[k] = form[k] ? Number(form[k]) : null;
      });
      await bodyMeasureService.save(payload);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ hasCurrent: true });
      this.loadHistory();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请检查数值', icon: 'none' });
    }
  },

  async onDelete() {
    const { currentDate } = this.data;
    wx.showModal({
      title: '删除记录',
      content: '确定删除 ' + currentDate + ' 的围度记录？',
      confirmText: '删除',
      confirmColor: '#FF6B6B',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await bodyMeasureService.remove(currentDate);
          wx.showToast({ title: '已删除', icon: 'none' });
          this.setData({
            hasCurrent: false,
            form: { body_fat_pct: '', waist_cm: '', chest_cm: '', hip_cm: '', arm_cm: '', thigh_cm: '' }
          });
          this.loadHistory();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  onEditHistory(e) {
    const date = e.currentTarget.dataset.date;
    this.setData({ currentDate: date });
    this.loadForm(date);
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onBackToToday() {
    const today = formatDate(new Date());
    this.setData({ currentDate: today });
    this.loadForm(today);
  },

  async loadHistory() {
    try {
      const history = await bodyMeasureService.getHistory(30);
      const list = history.map((r) => {
        const parts = [];
        if (r.waist_cm) parts.push('腰' + r.waist_cm);
        if (r.chest_cm) parts.push('胸' + r.chest_cm);
        if (r.hip_cm) parts.push('臀' + r.hip_cm);
        if (r.arm_cm) parts.push('臂' + r.arm_cm);
        if (r.thigh_cm) parts.push('腿' + r.thigh_cm);
        if (r.body_fat_pct) parts.push('体脂' + r.body_fat_pct + '%');
        return { date: r.date, summary: parts.join(' · ') || '—' };
      });
      this.setData({ history: list });
    } catch (err) {
      console.error('[body-measure] 历史加载失败', err);
    }
  },

  onBack() {
    wx.navigateBack();
  }
});

// pages/data-manage/data-manage.js - 数据导出与导入
// 导出：训练/饮水/体重/围度/恢复/AI 记忆/全部 → JSON（单类型可选 CSV）→ 分享文件
// 导入：粘贴导出 JSON → 校验格式 → 防重复/保留现有/失败回滚/openid 隔离
const dataTransfer = require('../../services/data-transfer');

const TYPE_OPTIONS = [
  { key: 'all', label: '全部数据' },
  { key: 'workout_records', label: '训练记录' },
  { key: 'water_records', label: '饮水记录' },
  { key: 'weight_records', label: '体重记录' },
  { key: 'body_measurements', label: '身体围度' },
  { key: 'recovery_records', label: '恢复记录' },
  { key: 'fitness_memory', label: 'AI 记忆' }
];

Page({
  data: {
    typeOptions: TYPE_OPTIONS,
    selected: ['all'],
    format: 'json',
    exporting: false,
    importText: '',
    importPreview: null,
    importResult: null,
    importing: false
  },

  // ===== 导出 =====

  onTypeTap(e) {
    const key = e.currentTarget.dataset.key;
    let selected = this.data.selected.slice();
    if (key === 'all') {
      selected = ['all'];
    } else {
      selected = selected.filter((k) => k !== 'all');
      const idx = selected.indexOf(key);
      if (idx >= 0) selected.splice(idx, 1);
      else selected.push(key);
      if (selected.length === 0) selected = ['all'];
    }
    this.setData({ selected });
  },

  onFormatChange(e) {
    this.setData({ format: e.detail.value });
  },

  async onExport() {
    if (this.data.exporting) return;
    const { selected, format } = this.data;
    const isSingle = selected.length === 1 && selected[0] !== 'all';
    const useCsv = format === 'csv' && isSingle;

    wx.showLoading({ title: '导出中...' });
    try {
      const { json, csv } = await dataTransfer.buildExport(selected);
      let content;
      let fileName;
      if (useCsv && csv[selected[0]]) {
        content = csv[selected[0]];
        fileName = 'fitness-' + selected[0] + '.csv';
      } else {
        content = json;
        fileName = 'fitness-export.json';
      }
      wx.hideLoading();

      const fs = wx.getFileSystemManager();
      const filePath = wx.env.USER_DATA_PATH + '/' + fileName;
      fs.writeFileSync(filePath, content, 'utf8');

      if (wx.shareFileMessage) {
        wx.shareFileMessage({
          filePath,
          fileName,
          success: () => wx.showToast({ title: '已导出', icon: 'success' }),
          fail: () => this.exportFallback(filePath)
        });
      } else {
        this.exportFallback(filePath);
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[data-manage] 导出失败', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  exportFallback(filePath) {
    wx.showModal({
      title: '导出完成',
      content: '数据已生成，请从文件路径获取：\n' + filePath,
      showCancel: false
    });
  },

  // ===== 导入 =====

  onImportText(e) {
    this.setData({ importText: e.detail.value, importPreview: null, importResult: null });
  },

  onPreviewImport() {
    const text = (this.data.importText || '').trim();
    if (!text) {
      wx.showToast({ title: '请粘贴导出的 JSON', icon: 'none' });
      return;
    }
    const parsed = dataTransfer.parseExport(text);
    if (!parsed.ok) {
      this.setData({ importPreview: null, importResult: null });
      wx.showModal({ title: '格式校验失败', content: parsed.error, showCancel: false });
      return;
    }
    const preview = Object.keys(parsed.data.data).map((t) => {
      const v = parsed.data.data[t];
      const count = Array.isArray(v) ? v.length : v ? 1 : 0;
      const label = (TYPE_OPTIONS.find((o) => o.key === t) || {}).label || t;
      return { type: t, label, count };
    });
    this.setData({ importPreview: preview, parsedData: parsed.data });
    wx.showModal({
      title: '确认导入',
      content: '将导入 ' + preview.map((p) => p.label + '(' + p.count + ')').join('、') + '。已存在的记录会自动跳过，不会覆盖当前数据。',
      confirmText: '导入',
      success: (res) => {
        if (res.confirm) this.doImport();
      }
    });
  },

  async doImport() {
    const parsedData = this.data.parsedData;
    if (!parsedData || this.data.importing) return;
    this.setData({ importing: true });
    wx.showLoading({ title: '导入中...' });
    try {
      const result = await dataTransfer.importData(parsedData, Object.keys(parsedData.data));
      wx.hideLoading();
      this.setData({ importResult: result, importing: false });
      if (!result.ok) {
        wx.showModal({ title: '导入失败', content: result.error || '导入出错已回滚', showCancel: false });
      } else {
        wx.showModal({
          title: '导入完成',
          content: '新增 ' + result.imported + ' 条，跳过重复 ' + result.skipped + ' 条' +
            (result.failed > 0 ? '，失败 ' + result.failed + ' 条' : ''),
          showCancel: false
        });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ importing: false });
      wx.showToast({ title: '导入失败', icon: 'none' });
    }
  },

  onBack() {
    wx.navigateBack();
  }
});

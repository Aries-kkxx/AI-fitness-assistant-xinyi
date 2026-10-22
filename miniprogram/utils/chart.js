// utils/chart.js - 简易折线图绘制（Canvas 2D，不依赖第三方图表库）
// 用于体重变化曲线与训练表现趋势（重量/次数/容量）。页面用法：
//   <canvas type="2d" id="weight-chart" class="chart-canvas"></canvas>
//   const query = this.createSelectorQuery();
//   query.select('#weight-chart').fields({ node: true, size: true }).exec((res) => {
//     drawWeightChart(res[0].node, res[0].width, res[0].height, points);
//   });

/**
 * 绘制体重折线图
 * @param {Object} canvas Canvas 2D 节点（type="2d"）
 * @param {number} width 画布 CSS 宽度（px）
 * @param {number} height 画布 CSS 高度（px）
 * @param {Array} points 数据点 [{ date: 'YYYY-MM-DD', weight: number }]，按日期升序
 * @param {Object} opts 可选颜色配置
 */
function drawWeightChart(canvas, width, height, points, opts) {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const dpr = win.pixelRatio || 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cfg = Object.assign(
    {
      lineColor: '#ffb54d',
      pointColor: '#ffb54d',
      textColor: '#999999',
      gridColor: '#eeeeee'
    },
    opts || {}
  );

  ctx.clearRect(0, 0, width, height);

  if (!points || points.length === 0) {
    ctx.fillStyle = cfg.textColor;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', width / 2, height / 2);
    return;
  }

  // 绘图区边距
  const pad = { top: 20, right: 14, bottom: 24, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Y 轴范围（体重）
  const weights = points.map((p) => p.weight);
  let min = Math.min.apply(null, weights);
  let max = Math.max.apply(null, weights);
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  min = Math.floor(min - 0.5);
  max = Math.ceil(max + 0.5);

  // 网格线 + Y 轴刻度（4 条横线）
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const val = max - ((max - min) * i) / 4;
    const y = pad.top + (plotH * i) / 4;
    ctx.strokeStyle = cfg.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = cfg.textColor;
    ctx.fillText(val.toFixed(1), pad.left - 6, y);
  }

  // 数据点坐标（X 等距分布）
  const n = points.length;
  const xs = points.map((p, i) =>
    n === 1 ? pad.left + plotW / 2 : pad.left + (plotW * i) / (n - 1)
  );
  const ys = points.map((p) => pad.top + plotH - ((p.weight - min) / (max - min)) * plotH);

  // 折线
  ctx.strokeStyle = cfg.lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  xs.forEach((x, i) => {
    if (i === 0) ctx.moveTo(x, ys[i]);
    else ctx.lineTo(x, ys[i]);
  });
  ctx.stroke();

  // 数据点
  ctx.fillStyle = cfg.pointColor;
  xs.forEach((x, i) => {
    ctx.beginPath();
    ctx.arc(x, ys[i], 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // 首尾日期标签
  ctx.fillStyle = cfg.textColor;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(points[0].date.slice(5), pad.left, height - pad.bottom + 6);
  if (n > 1) {
    ctx.fillText(points[n - 1].date.slice(5), Math.min(xs[n - 1], width - pad.right), height - pad.bottom + 6);
  }

  // 每个数据点的体重值标签
  ctx.fillStyle = cfg.lineColor;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  xs.forEach((x, i) => {
    const label = points[i].weight.toFixed(1) + 'kg';
    ctx.fillText(label, x, ys[i] - 6);
  });
}

module.exports = {
  drawWeightChart,
  drawTrendChart
};

/**
 * 绘制通用趋势折线图（训练表现：重量 / 次数 / 容量）
 * @param {Object} canvas Canvas 2D 节点（type="2d"）
 * @param {number} width 画布 CSS 宽度（px）
 * @param {number} height 画布 CSS 高度（px）
 * @param {Array} points 数据点 [{ date: 'YYYY-MM-DD', value: number }]，按日期升序
 * @param {Object} opts
 *   { string } opts.lineColor 折线颜色
 *   { string } opts.pointColor 数据点颜色
 *   { string } opts.unit 值单位后缀（如 'kg' / '次'），空则不显示
 *   { boolean } opts.integer 值是否取整展示（次数/容量）
 *   { string } opts.emptyText 空数据文案
 */
function drawTrendChart(canvas, width, height, points, opts) {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const dpr = win.pixelRatio || 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cfg = Object.assign(
    {
      lineColor: '#4D9EFF',
      pointColor: '#4D9EFF',
      unit: '',
      integer: false,
      emptyText: '暂无数据'
    },
    opts || {}
  );

  ctx.clearRect(0, 0, width, height);

  if (!points || points.length === 0) {
    ctx.fillStyle = '#999999';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.emptyText, width / 2, height / 2);
    return;
  }

  const pad = { top: 20, right: 14, bottom: 24, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = points.map((p) => p.value);
  let min = Math.min.apply(null, values);
  let max = Math.max.apply(null, values);
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  min = cfg.integer ? Math.floor(min - 0.5) : Math.floor(min - 0.5);
  max = cfg.integer ? Math.ceil(max + 0.5) : Math.ceil(max + 0.5);

  const fmt = (v) => (cfg.integer ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1));

  // 网格线 + Y 轴刻度（4 条横线）
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const val = max - ((max - min) * i) / 4;
    const y = pad.top + (plotH * i) / 4;
    ctx.strokeStyle = '#eeeeee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = '#999999';
    ctx.fillText(fmt(val), pad.left - 6, y);
  }

  // 数据点坐标（X 等距分布）
  const n = points.length;
  const xs = points.map((p, i) =>
    n === 1 ? pad.left + plotW / 2 : pad.left + (plotW * i) / (n - 1)
  );
  const ys = points.map((p) => pad.top + plotH - ((p.value - min) / (max - min)) * plotH);

  // 折线
  ctx.strokeStyle = cfg.lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  xs.forEach((x, i) => {
    if (i === 0) ctx.moveTo(x, ys[i]);
    else ctx.lineTo(x, ys[i]);
  });
  ctx.stroke();

  // 数据点
  ctx.fillStyle = cfg.pointColor;
  xs.forEach((x, i) => {
    ctx.beginPath();
    ctx.arc(x, ys[i], 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // 首尾日期标签
  ctx.fillStyle = '#999999';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(points[0].date.slice(5), pad.left, height - pad.bottom + 6);
  if (n > 1) {
    ctx.fillText(points[n - 1].date.slice(5), Math.min(xs[n - 1], width - pad.right), height - pad.bottom + 6);
  }

  // 每个数据点的值标签
  ctx.fillStyle = cfg.lineColor;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  xs.forEach((x, i) => {
    const label = fmt(values[i]) + cfg.unit;
    ctx.fillText(label, x, ys[i] - 6);
  });
}

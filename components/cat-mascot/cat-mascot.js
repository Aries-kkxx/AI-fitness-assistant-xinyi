// components/cat-mascot/cat-mascot.js - 纯 CSS 卡通橘白猫组件
// 姿态 pose: stand(站立) / wave(挥手) / drink(抱水杯) / sleep(睡觉)
// 动画 animate: none / float(上下浮动) / bounce(弹跳)
Component({
  properties: {
    pose: { type: String, value: 'stand' },
    size: { type: Number, value: 240 }, // 显示尺寸 rpx（内部画布固定 240x240，按比例缩放）
    animate: { type: String, value: 'none' }
  },
  data: {
    scale: 1
  },
  observers: {
    size(n) {
      this.setData({ scale: n / 240 });
    }
  }
});

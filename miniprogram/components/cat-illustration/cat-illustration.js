// components/cat-illustration/cat-illustration.js
// 统一卡通猫咪插画组件（占位版）
// 支持 pose: home / workout / water / success / empty / avatar / calendar。
// 使用 assets/cat/cat-<pose>.png；新增姿态时需同时添加同名图片和白名单。
Component({
  properties: {
    // 姿态
    pose: { type: String, value: 'home' },
    // 显示尺寸（rpx），正方形等比
    size: { type: Number, value: 200 },
    // 圆角形状：circle 圆形底 / square 方图 / none 无背景
    shape: { type: String, value: 'none' },
    // 背景色（仅 shape=square/circle 时生效），如 'var(--cat-orange-soft)'
    bg: { type: String, value: '' },
    // 动画：none / float(上下浮动) / bounce(轻弹)
    animate: { type: String, value: 'none' }
  },
  data: {
    // 合法姿态白名单，防止拼出不存在的路径
    _validPoses: ['home', 'workout', 'water', 'success', 'empty', 'avatar', 'calendar']
  },
  observers: {
    pose(p) {
      // 非法姿态回退到 home，避免图片 404
      if (this.data._validPoses.indexOf(p) < 0) {
        this.setData({ _pose: 'home' });
      } else {
        this.setData({ _pose: p });
      }
    }
  },
  lifetimes: {
    attached() {
      const p = this.data.pose;
      this.setData({
        _pose: this.data._validPoses.indexOf(p) < 0 ? 'home' : p
      });
    }
  }
});

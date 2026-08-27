// components/cat-illustration/cat-illustration.js
// 统一卡通猫咪插画组件（占位版）
// 支持 pose: home(挥手) / workout(举哑铃) / back(背部训练) / leg(腿部训练)
//           water(喝水) / remind(抱水杯提醒) / success(举奖杯) / ai(教练)
//           empty(空状态) / avatar(头像)
// 当前使用 assets/cat/cat-<pose>.png（WebP 压缩，控制包体积）；后续替换正式素材时替换同名 WebP 即可，组件无需改动。
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
    _validPoses: ['home', 'workout', 'back', 'leg', 'water', 'remind', 'success', 'ai', 'empty', 'avatar', 'calendar']
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

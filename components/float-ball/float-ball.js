// components/float-ball/float-ball.js - 「欣一」AI 悬浮球组件
// 使用普通 view + 手动触摸事件实现拖拽，无 movable-view 内置动画；
// 位置记忆到 storage，所有页面共享同一位置，越界自动修正；
// 纵向带 tabBar 下限：悬浮球底部不允许低于底部页签栏顶部（含底部安全区）。
//
// 关键点：页面级生命周期（show/hide）必须写在 pageLifetimes 中，
// 写在 lifetimes 里不会触发。这样每次页面重新可见（tab 切换、
// navigateTo 返回、前后台切换）都会从 storage 重新读取最新位置，
// 保证「在任意页面拖动后，切到其他页面显示同一位置」。

const BALL_W = 96;
const BALL_H = 116;

// 微信原生 tabBar 实际占用屏幕高度 ≈ 64px
//（50rpx 内容区 + icon 上下 padding ≈ 6~8px + 文本行高 ≈ 6px，合计 ~64px）。
// 50rpx 是 text/icon 内容区，不含 padding/阴影，单独使用会让浮球底部贴到 tabBar 内容，
// 视觉上"欣一"标签阴影会侵入"动作"等 tabLabel。
// 这里取一个偏保守的值，让 maxY 公式自然留出缓冲；再做一次 BALL_TABBAR_GAP 加固。
const TAB_BAR_HEIGHT = 64;

// 浮球底部（含"欣一"标签 + 阴影）到页签栏顶部之间的强制留白，
// 防止 y 触顶时浮球视觉侵入 tabBar（强约束：悬浮球永远不能"超过"页签栏）。
const BALL_TABBAR_GAP = 8;

const HIDDEN_PAGES = [
  'pages/ai/ai',
  'pages/user-info/user-info',
  'pages/stats/stats',
  'pages/fitness-memory/fitness-memory',
  'pages/cycle/cycle',
  'pages/weight/weight',
  'pages/water-setting/water-setting'
];

const STORAGE_KEY = 'floatBallPosV2';

Component({
  data: {
    x: 0,
    y: 0,
    visible: true,
    ready: false
  },

  lifetimes: {
    attached() {
      this.initSize();
      this.initPosition();
    }
  },

  // 组件所在页面的生命周期：必须放在 pageLifetimes（放在 lifetimes 里不会触发）。
  // 项目用的是系统自带 tabBar（app.json 中 tabBar 未配置 custom: true），
  // 所以 tab 切换、页面进出栈都会触发 show/hide。
  pageLifetimes: {
    show() {
      // 页面每次重新可见时，重新测量窗口尺寸（不同时刻 windowHeight 可能有细微差异），
      // 并从 storage 重新读取最新位置，让所有页面始终显示「最后一次拖动后」的位置。
      this.initSize();
      this.initPosition();
    },
    hide() {
      // 兜底：页面被隐藏前保存一次当前渲染位置（防止拖动收尾丢失）。
      this.persistPosition();
    }
  },

  methods: {
    initSize() {
      try {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this._winW = win.windowWidth || 375;
        this._winH = win.windowHeight || 667;
        // 底部安全区高度（无 Home 指示条的机型为 0），tabBar 会延伸进该区域
        this._bottomInset =
          win.safeAreaInsets && typeof win.safeAreaInsets.bottom === 'number'
            ? win.safeAreaInsets.bottom
            : 0;
      } catch (err) {
        this._winW = 375;
        this._winH = 667;
        this._bottomInset = 0;
      }
    },

    // 悬浮球 top 的最大值：保证球的底部（包含"欣一"标签 + 阴影）严格位于 tabBar 顶部之上，
    // 中间保留 BALL_TABBAR_GAP 的视觉缓冲，绝不会出现"压住页签栏"的情况。
    getMaxY() {
      return Math.max(
        0,
        this._winH - BALL_H - TAB_BAR_HEIGHT - this._bottomInset - BALL_TABBAR_GAP
      );
    },

    initPosition() {
      try {
        const pages = getCurrentPages();
        const current = pages.length > 0 ? pages[pages.length - 1] : null;
        const shouldHide = current && HIDDEN_PAGES.indexOf(current.route) >= 0;

        if (shouldHide) {
          this.setData({ visible: false });
          return;
        }

        const saved = wx.getStorageSync(STORAGE_KEY);
        let x = saved && typeof saved.x === 'number' ? saved.x : this._winW - BALL_W - 32;
        let y = saved && typeof saved.y === 'number' ? saved.y : Math.floor(this._winH * 0.56);

        x = Math.max(0, Math.min(x, this._winW - BALL_W));
        y = Math.max(0, Math.min(y, this.getMaxY()));

        this.setData({ x, y, visible: true, ready: true });
      } catch (err) {
        this.setData({ x: 270, y: Math.min(420, this.getMaxY()), visible: true, ready: true });
      }
    },

    persistPosition() {
      if (!this.data.ready) return;
      try {
        wx.setStorageSync(STORAGE_KEY, { x: this.data.x, y: this.data.y });
      } catch (err) {}
    },

    onTouchStart(e) {
      const touch = e && e.touches && e.touches[0];
      if (!touch) return;
      this._moved = false;
      this._startX = touch.clientX;
      this._startY = touch.clientY;
      this._baseX = this.data.x;
      this._baseY = this.data.y;
    },

    onTouchMove(e) {
      const touch = e && e.touches && e.touches[0];
      if (!touch || this._startX === undefined || this._startY === undefined) return;

      const deltaX = touch.clientX - this._startX;
      const deltaY = touch.clientY - this._startY;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        this._moved = true;
      }
      if (!this._moved) return;

      let x = this._baseX + deltaX;
      let y = this._baseY + deltaY;

      x = Math.max(0, Math.min(x, this._winW - BALL_W));
      y = Math.max(0, Math.min(y, this.getMaxY()));

      this.setData({ x, y });
      this.persistPosition();
    },

    onTouchEnd() {
      if (this._moved) {
        this.persistPosition();
      }
      // 注意：不要在 touchend 里重置 _moved —— touchend 之后会紧跟 tap，
      // 需要靠 _moved 仍为 true 来屏蔽「拖动后误触发的点击跳转」；
      // _moved 会在下一次 touchstart 时被重置。
    },

    onTouchCancel() {
      if (this._moved) {
        this.persistPosition();
      }
    },

    onTap() {
      if (this._moved) return;
      const pages = getCurrentPages();
      const current = pages.length > 0 ? pages[pages.length - 1] : null;
      if (current && HIDDEN_PAGES.indexOf(current.route) >= 0) return;
      wx.navigateTo({ url: '/pages/ai/ai' });
    }
  }
});

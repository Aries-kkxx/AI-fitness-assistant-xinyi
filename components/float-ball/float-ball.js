// components/float-ball/float-ball.js - 「欣一」AI 悬浮球组件
// 使用普通 view + 手动触摸事件实现拖拽，无 movable-view 内置动画；
// 位置记忆到 storage，所有页面共享同一位置，越界自动修正；
// 纵向带 tabBar 下限：悬浮球底部（含标签 + 阴影）对齐页签栏顶部，不越过页签栏。
//
// 关键点：页面级生命周期（show/hide）必须写在 pageLifetimes 中，
// 写在 lifetimes 里不会触发。这样每次页面重新可见（tab 切换、
// navigateTo 返回、前后台切换）都会从 storage 重新读取最新位置，
// 保证「在任意页面拖动后，切到其他页面显示同一位置」。

const BALL_W = 96;
// 悬浮球容器高度需覆盖「图片 + 名称标签 + 底部阴影」的实际视觉高度。
// WXSS 中 .float-ball 高度与此常量必须保持一致。
const BALL_H = 118;

// 浮球底部（含"欣一"标签 + 阴影）与页签栏顶部对齐，
// 不额外留白；靠 BALL_H 本身的视觉余量保证不压住 tabBar。
const BALL_TABBAR_GAP = 0;

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

    // 悬浮球 top 的最大值：让球底部（含"欣一"标签 + 阴影）对齐 tabBar 顶部。
    // wx.getWindowInfo().windowHeight 在现代基础库中已不包含 tabBar 高度，
    // 因此页签栏顶部即 windowHeight 下边界，无需再减去 tabBar 高度或安全区。
    getMaxY() {
      return Math.max(0, this._winH - BALL_H - BALL_TABBAR_GAP);
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
      this._tapHandled = false; // 每次触摸重置：允许本次触摸产生点击
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

      // 位移阈值 5px（与微信「轻点」判定一致）：
      // 阈值过小（如 3px）会把日常轻点时的微小手抖误判为拖动，
      // 导致 _moved=true 后点击被屏蔽，表现为「点击悬浮球没反应」。
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
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
        return; // 拖动结束，不视为点击
      }
      // 未拖动（位移 <= 阈值）→ 判定为点击并立即跳转。
      // 关键：不依赖 tap 事件 —— 真机上绑定了 touchmove 的视图，
      // 轻点时即使位移很小，系统也可能不派发 tap（拖拽组件与 tap 冲突的
      // 常见问题），导致 onTap 从不执行，表现为「点击悬浮球没反应」。
      this.handleTap();
    },

    onTouchCancel() {
      // 触摸被系统打断（如来电/手势抢占）：不算点击，仅保存位置
      if (this._moved) {
        this.persistPosition();
      }
    },

    onTap() {
      // 兜底：若系统仍派发了 tap（touchend 已处理过点击），这里直接返回防止双跳
      if (this._tapHandled) return;
      this.handleTap();
    },

    handleTap() {
      if (this._tapHandled) return;
      this._tapHandled = true;
      wx.navigateTo({
        url: '/pages/ai/ai',
        fail: () => {
          // 打开失败给出明确提示，避免「点了没反应」的困惑
          wx.showToast({ title: '暂时无法打开，请稍后再试', icon: 'none' });
        }
      });
    }
  }
});

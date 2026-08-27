// components/section-title/section-title.js - 统一区块标题
Component({
  properties: {
    title: { type: String, value: '' },
    icon: { type: String, value: '🐾' },
    link: { type: String, value: '' },
    border: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      this.triggerEvent('linktap');
    }
  }
});

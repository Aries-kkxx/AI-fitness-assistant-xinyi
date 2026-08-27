# 协议 H5 页面（部署说明）

本目录包含《用户协议》《隐私政策》的 H5 版本，用于在手机浏览器中打开查看：

- `terms.html` — 用户协议
- `privacy.html` — 隐私政策

两个页面均为自包含静态页面（无外部依赖、无网络请求），移动端适配，可直接部署到任意 HTTPS 静态托管（如你自己的服务器、GitHub Pages、Cloudflare Pages、Vercel 等），部署后即可用手机浏览器正常打开。

## 如何配置到小程序

1. 将本目录部署到可访问的 HTTPS 地址，例如：
   - `https://your-domain.com/agreement/terms.html`
   - `https://your-domain.com/agreement/privacy.html`
2. 打开根目录 `config.js`，将两个地址分别填入：

   ```js
   AGREEMENT: {
     TERMS_URL: 'https://your-domain.com/agreement/terms.html',
     PRIVACY_URL: 'https://your-domain.com/agreement/privacy.html'
   }
   ```

3. 填写后，小程序内原生协议页（pages/agreement）底部会额外展示这两个链接，便于复制到浏览器打开。

## 说明

- **未配置地址不影响使用**：小程序内点击《用户协议》《隐私政策》会打开小程序内的原生协议页展示完整内容，不依赖外部域名。
- **不要填写虚假地址**（如 fake.com / example.com）：请务必填写真实可访问的 HTTPS 地址。
- 如需在小程序内通过 web-view 直接展示 H5 页面，还需在微信公众平台后台配置「业务域名」白名单（属可选项，非必需）。
- 若修改了本目录页面内容，请同步更新 `pages/agreement/agreement.js` 中的对应文本，保持两边内容一致。

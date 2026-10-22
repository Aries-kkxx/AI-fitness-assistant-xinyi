# 协议 H5 页面

本目录提供《用户协议》和《隐私政策》的独立 H5 版本：

- `terms.html`：用户协议
- `privacy.html`：隐私政策

两个页面均为自包含静态页面，不依赖外部脚本、样式或网络请求，可直接部署到任意 HTTPS 静态托管服务。

## 与小程序的关系

小程序当前使用原生协议页 `miniprogram/pages/agreement/agreement` 展示协议全文，不依赖本目录，也不需要配置业务域名。

本目录适合用于：

- 在手机浏览器中查看完整协议
- 部署到项目官网或静态托管
- 提交审核时提供可公开访问的协议地址

`miniprogram/config.js` 中的 `AGREEMENT.TERMS_URL` 和 `AGREEMENT.PRIVACY_URL` 目前是预留字段，原生协议页并未读取或展示它们。

## 部署

将 `terms.html` 和 `privacy.html` 上传到静态托管后，获得类似以下地址：

```text
https://your-domain.com/agreement/terms.html
https://your-domain.com/agreement/privacy.html
```

请使用真实可访问的 HTTPS 地址，不要填写示例域名。

如需通过 `web-view` 在小程序内加载 H5，还需在微信公众平台配置业务域名白名单；当前项目不使用这种方式。

## 内容同步

修改 H5 协议内容时，请同步更新 `miniprogram/pages/agreement/agreement.js` 中的原生协议文本，避免两个版本出现差异。

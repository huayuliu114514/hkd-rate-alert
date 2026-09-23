# 汇率观察移动端

基于 Expo React Native 的原生 iOS/Android App。它直接访问 Frankfurter API，不依赖电脑上的 Python Web 服务。

## 功能

- 选择、搜索或对调 30 种货币；
- 查看 7、30、60、90 天汇率走势；
- 按当前汇率换算金额；
- 选择“关注高位”或“关注低位”，调整容差和百分位范围；
- 保存货币对、金额和策略，并缓存最近一次汇率数据；
- 下拉刷新、触感反馈和 iPhone 安全区域适配。

默认使用 `HKD/CNY + 关注低位`：用人民币换港币时，买 `1 HKD` 需要的人民币越少越好。对调货币时，App 会自动反转关注方向。

## 本地验证

建议使用 Node.js 22 LTS 或更高版本：

```powershell
cd mobile
npm install
npm run typecheck
npm run lint
npm run export:ios
```

## 安装到 iPhone

iOS 独立 App 需要有效的 Apple Developer 会员。Windows 可以通过 EAS 云端构建，无需本地安装 Xcode。

1. 注册并登录 [Expo](https://expo.dev/) 和 [Apple Developer](https://developer.apple.com/programs/) 账号。
2. 在 `mobile` 目录执行：

```powershell
npx eas-cli@latest login
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile development
```

3. 构建完成后，用已登记的 iPhone 扫描终端或 EAS 页面中的二维码并安装。
4. 启动开发服务：

```powershell
npm start
```

需要不连接开发服务器也能运行的内测包时：

```powershell
npx eas-cli@latest build --platform ios --profile preview
```

发布到 TestFlight 时：

```powershell
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
```

首次运行 EAS 会将项目关联到你的 Expo 账号。正式上架前请确认 `app.json` 中的 `ios.bundleIdentifier` 在 Apple Developer 账号内唯一。

## 提醒边界

App 会在打开或刷新时计算是否达到高位/低位条件。iOS 不保证普通 App 在后台定时联网，因此工作日自动提醒继续由仓库根目录的 GitHub Actions 和 Bark 执行。当前 App 设置不会自动改写 GitHub Actions 的参数；如需 App 原生远程推送，需要增加账号、配置同步和推送后端。

Frankfurter 提供参考汇率，不包含银行或支付平台的点差与手续费。
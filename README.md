# 汇率观察与提醒App

本仓库包含三个入口：

- `mobile/`：可安装的 Expo React Native iOS/Android App；
- `web.py`：本地浏览器数据看板；
- `alert.py`：GitHub Actions + Bark 定时提醒。

## 移动端 App

移动端是独立的原生 React Native 应用，直接读取 Frankfurter，不需要运行 `web.py`。它支持币种搜索和对调、金额换算、原生走势图、本地缓存，以及可选的高位/低位策略。默认使用 HKD/CNY 并关注低位。

```powershell
cd mobile
npm install
npm run typecheck
npm run lint
```

从 Windows 通过 EAS 安装到 iPhone、制作内测包和发布 TestFlight 的步骤见 [mobile/README.md](mobile/README.md)。

## Bark 定时提醒

每个工作日检查指定货币对的汇率，并通过 Bark 把当天汇率推送到 iPhone。汇率接近近 30 天最低点时，标题会标注为低点提醒。

## 工作方式

```text
GitHub Actions 每个工作日 17:00（香港时间）运行
→ Frankfurter API 获取近 30 天指定货币对汇率
→ 判断是否接近近期低点
→ 通过 Bark 推送当天汇率，达到低点时标题显示【低点提醒】
```

满足任一条件即视为低点：

- 当前汇率比近 30 天最低点高不超过 `0.05%`；
- 当前汇率处于近 30 天最低的 `10%`。

## 设置

1. 在 iPhone App Store 安装 **Bark**，打开后复制推送地址中的 key，例如 `https://api.day.app/<key>/`。
2. 在 GitHub 新建私有仓库并上传本文件夹。
3. 仓库 **Settings → Secrets and variables → Actions → New repository secret**，名称填 `BARK_KEY`，值填 Bark key。
4. 打开 **Actions → Check HKD/CNY rate → Run workflow**，手动运行一次即可收到测试推送。

## 本地测试

```powershell
python alert.py --dry-run
python alert.py --dry-run --force
```

可调整参数：

```powershell
python alert.py --lookback-days 60 --tolerance-pct 0.1 --percentile 15
python alert.py --dry-run --base USD --quote EUR
```

## 网页端

网页端无需安装额外依赖：

```powershell
python web.py
```

然后打开 [http://127.0.0.1:8000](http://127.0.0.1:8000)。页面支持：

- 从 Frankfurter 支持的 30 种货币中选择和对调货币对；
- 查看 7、30、60、90 天参考汇率曲线；
- 调整最低点容差和低位百分位；
- 按当前汇率估算报价货币金额；
- 使用服务端的 `BARK_KEY` 发送测试推送。

需要测试 Bark 时，先在启动服务的终端设置环境变量：

```powershell
$env:BARK_KEY = "你的 Bark key"
python web.py
```

Web 服务默认只监听本机 `127.0.0.1`。

## 注意

Frankfurter 使用欧洲央行参考汇率，只在工作日更新，不含银行或支付平台的点差和手续费。实际兑换前请以所用银行或支付服务的报价为准。

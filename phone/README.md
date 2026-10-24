# 留学手记手机 App

这是与 `macos/`、`desktop/` 和浏览器尺寸预览 `mobile/` 完全分开的原生手机项目。它使用 Expo SDK 58 与 React Native，同时生成 iOS 和 Android 应用；设备数据保存在 App 沙盒内的 SQLite 数据库，密码校验信息与登录状态保存在系统安全存储中。Expo 的 SQLite 数据库会跨 App 重启保留 [[1]](#ref-1)，EAS Build 可分别生成可安装的 Android/iOS 二进制包 [[2]](#ref-2)。

## 已实现功能

- 本机注册、登录、自动恢复登录和退出；新账号默认普通会员。
- 首页会员卡正反面翻转、短音效和触觉反馈，头像进入个人资料。
- 日程、作业、考试和日常事项的新增、完成与删除。
- 暑假和其他假期日期、来源、倒计时及弹层详情。
- 学生服务待办、重要标记、状态切换和个人课表。
- AI 助手对话界面与示例对话；与 Mac 当前版本一致，本轮不连接真实 AI 服务。
- `users`、`entries`、`calendar_settings`、`holidays`、`service_tasks`、`lessons` 六组 SQLite 数据表。

手机 App 是独立客户端，不会跳转电脑版，也不会与 Mac 的 `journal.sqlite3` 自动同步。卸载 App 会删除设备沙盒中的本地数据；正式运营若需要换机同步、账号找回和多人共用数据，需要再接入 HTTPS 云端 API。

## 本地运行

需要 Node.js 22.13 或更新版本。首次进入项目安装依赖：

```bash
cd phone
npm install
npm test
```

最方便的真机预览方式是安装 Expo Go，然后运行：

```bash
npm run start:go
```

iPhone 与 Mac 在同一网络时，用相机扫描终端二维码；Android 用 Expo Go 扫描。如果局域网发现失败，可改用 `npx expo start --tunnel`。原生开发构建的标准配置流程见 Expo 文档 [[3]](#ref-3)。

若 Mac 已安装 Xcode 和 iOS Simulator，可执行 `npm run ios`；Android Studio 和模拟器准备完成后，可执行 `npm run android`。这两个命令会在首次运行时生成未提交到仓库的原生工程目录。

## 生成安装包

仓库已包含 `eas.json`，但本次没有代替发布者登录 Expo、注册设备或使用 Apple/Google 签名凭据。需要打包时先在 `phone/` 运行：

```bash
npx eas-cli@latest login
```

Android 直接安装测试包：

```bash
npm run build:preview:android
```

这个 profile 生成 `.apk`，构建完成后从 EAS 提供的页面下载并安装。正式上架 Google Play 时运行 `npm run build:production`，Android production profile 生成 `.aab`。

iPhone 测试包：

```bash
npm run build:preview:ios
```

iOS 内部分发需要 Apple Developer Program 账号和已登记的设备，EAS 会在交互过程中配置证书与 provisioning profile。面向任意用户发布需要 production 构建并提交 TestFlight/App Store；iOS 不能像 Android APK 一样生成一个对所有设备都可直接安装的通用文件。Expo 官方说明了内部发行、设备注册和签名边界 [[4]](#ref-4)。

构建前请确认 `app.json` 中的 `com.joseffyu.studyaboard` 是你 Apple Developer 与 Google Play Console 中准备使用的唯一 Bundle ID/Application ID。第一次正式构建时，把 Expo 登录、Apple Team 与 Google Play 账号准备好，再执行构建命令即可。

## 验证

提交前运行：

```bash
npm test
npm run doctor
```

`npm test` 检查配置、功能契约与 TypeScript；`npm run doctor` 检查 Expo 依赖版本及公开配置。仓库中的 `package-lock.json` 用于让另一台机器安装同一套依赖。

## References

<a id="ref-1"></a>[1] Expo Team, “SQLite,” Expo documentation, 2026 (accessed 2026-10-24). [[url]](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/)

<a id="ref-2"></a>[2] Expo Team, “Create your first build,” Expo documentation, 2026 (accessed 2026-10-24). [[url]](https://docs.expo.dev/build/setup/)

<a id="ref-3"></a>[3] Expo Team, “Create a development build,” Expo documentation, 2026 (accessed 2026-10-24). [[url]](https://docs.expo.dev/develop/development-builds/create-a-build/)

<a id="ref-4"></a>[4] Expo Team, “Internal distribution,” Expo documentation, 2026 (accessed 2026-10-24). [[url]](https://docs.expo.dev/build/internal-distribution/)

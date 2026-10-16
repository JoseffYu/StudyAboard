# 留学手记

留学生日常记录软件的可运行初版，包含 Mac 桌面客户端，以及独立的电脑和手机界面。使用中文界面，当前主导航为「首页 / 日程 / AI 助手」，重点展示会员卡、重要事项倒计时和对话界面预览。

## 在 MacBook 上作为软件测试

可以使用 npm 启动桌面软件。先安装 Node.js（包含 npm）和 Python 3.12 或更新版本，在下载好的项目目录执行：

```bash
npm install
npm start
```

`npm start` 调用下方同一个 Mac 客户端启动脚本，打开独立软件窗口；首次启动会联网安装桌面依赖。当前后端仍使用 Python，因此只安装 Node.js 不够。关闭软件窗口后，后台和启动命令一起退出。`npm run build:mac` 只生成供本机测试的 `macos/dist/StudyAboard.app`，它没有使用你的 Developer ID，不能作为正式外发包。也可以继续使用下面的脚本直接运行。

需要安装 Python 3.12 或更新版本（建议使用独立安装的 Python），首次准备依赖需要联网。在项目目录执行：

```bash
bash macos/run.command
```

脚本会自动建立独立依赖环境，然后打开「留学手记」软件窗口。无需打开浏览器，也无需手动启动后台或指定端口。关闭窗口时后台一并退出。使用系统 WebView 加载现有电脑版界面 [[1]](#ref-1)，当前客户端是桌面封装。

要生成可双击启动的软件，执行：

```bash
bash macos/build.command
open macos/dist/StudyAboard.app
```

生成的 `macos/dist/StudyAboard.app` 可在本机拖入「应用程序」文件夹测试。打包包含 Python、后台与界面资源，之后启动这个应用不需要终端。必须在 Mac 上执行打包；产物对应当前 Mac 的处理器架构，打包方式参考应用打包文档 [[2]](#ref-2)。当前开发环境为 Linux，已检查启动与退出逻辑，但尚未在真实 macOS 上验证窗口及打包产物。

## 生成可外发的签名 DMG

直接在网站等 Mac App Store 以外的渠道分发时，应使用 `Developer ID Application` 证书签名并提交 Apple 公证；把公证票据装订到发行包后，Gatekeeper 才能在离线状态验证它 [[3]](#ref-3)[[4]](#ref-4)。这需要有效的 Apple Developer Program 会员资格、安装在当前 Mac 钥匙串里的 Developer ID Application 证书，以及 Xcode 13 或更新版本。

先在 Xcode 的账号设置或 Apple Developer 网站创建并安装 `Developer ID Application` 证书，然后查看证书的完整名称：

```bash
security find-identity -v -p codesigning
```

为 `notarytool` 创建一个钥匙串凭据。下面的命令会交互式询问 Apple ID 的 app-specific password，不要把密码写进仓库：

```bash
xcrun notarytool store-credentials "StudyAboard-notary" \
  --apple-id "你的 Apple ID" \
  --team-id "你的 Team ID"
```

配置一次后，执行完整发行流程。把签名身份替换为上一条 `security` 命令显示的完整内容：

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: 你的姓名 (TEAMID)" \
APPLE_NOTARY_PROFILE="StudyAboard-notary" \
npm run release:mac
```

脚本会依次使用 Developer ID 和 Hardened Runtime 构建 `.app`、验证签名、创建并签名 `.dmg`、上传 Apple 公证、等待结果、装订公证票据，并运行 Gatekeeper 验证。成功产物位于 `macos/dist/StudyAboard-0.1.0-<架构>.dmg`。默认只支持构建它的 Mac 当前架构；需要 universal2 时可以额外设置 `STUDYABOARD_TARGET_ARCH=universal2`，但 Python 和所有二进制依赖也必须包含两个架构。

桌面软件数据库保存在 `~/Library/Application Support/StudyAboard/journal.sqlite3`，日志在同目录的 `app.log` 和 `runtime.log`。更新或重新打包软件不会覆盖这里的数据。原网页版的数据库不会自动导入；如需迁移，请先关闭两种程序，再将原 `data/journal.sqlite3` 复制到上述位置，并先备份目标文件。Mac 和其他设备各自保存数据，当前没有云同步。首次打开可注册一个测试账号，检查重要事项、会员翻转卡片及个人信息页，然后关闭重开确认数据保留。

手机版目前是独立的手机界面，还没有可安装的手机应用包。桌面界面不提供手机版跳转入口，手机版也不提供电脑版跳转入口。开发时可以执行 `npm run start:mobile`，直接用 390 × 844 的独立窗口打开手机版，使用同一个本地数据库；这用于检查手机版布局和功能，不模拟手机操作系统。若需要明确指定 Python，执行 `STUDYABOARD_PYTHON=python3.13 npm run start:mobile`。

## 网页开发模式启动

需要 Python 3.12 或更新版本，无需安装第三方依赖。在项目目录执行：

```bash
python3 server.py
```

在浏览器打开 `http://127.0.0.1:8080`，注册自己的账号即可使用。停止服务按 Ctrl+C。若端口被占用，可执行 `python3 server.py --port 8081`。

电脑端与手机端使用独立的页面和样式文件夹。默认首页 `/` 打开电脑版，明确访问 `/desktop/` 为电脑版、`/mobile/` 为手机版。两端主导航统一为「首页 / 日程 / AI 助手」；个人信息从首页头像进入。银白会员卡支持正反面点击翻转，并在操作时播放短提示音和一次性光效。日程页以暑假、最近作业和最近考试三张倒计时卡片为核心，假期详情在弹层中显示。电脑端采用相同配色，保留侧栏导航与宽屏布局。目录拆分后需要重启服务。

## 当前功能

- 邮箱注册、密码登录、退出登录与七天登录会话；密码加盐散列存储。
- 普通、Plus、Pro 三档会员分类。新账号默认为普通会员，所有等级目前均可使用全部基础功能，付费升级和专属权益尚未开放。
- 日程页集中展示距离暑假、最近未完成作业和最近未开始考试的倒计时；没有数据时显示明确的空状态。
- 假期日期和日期来源可手动设置，按账号保存在 SQLite 的 `calendar_settings` 和 `holidays` 表中；其他假期通过弹层查看，不会撑长主页面。
- 后端继续支持课程、作业、考试和日常记录数据，日期与时间可留空；当前精简界面不提供新建和编辑入口。
- 每个账号只能读取、修改和删除自己的记录；刷新或重启服务后数据仍保留。
- 主页会员翻转卡片突出当前等级，点击时播放短提示音并显示轻量光效，翻转后展示权益和会员页入口。
- AI 助手页采用对话布局，当前只展示示例对话、输入框和发送按钮，不连接真实 AI 服务。
- 个人信息页通过首页头像进入，集中展示账号、会员等级、数据位置与退出登录入口。

## 数据与开发

数据默认保存在 `data/journal.sqlite3`，请备份整个数据库文件。不要将个人数据提交到代码仓库。可通过 `--db /path/to/journal.sqlite3` 指定数据库。

```text
macos/
  launcher.py      Mac 独立窗口与后台生命周期
  run.command      启动桌面客户端
  build.command    在 Mac 上打包 .app
  release.command  签名、公证并生成可外发 .dmg
desktop/
  index.html       电脑版页面，入口 /desktop/
  style.css        电脑版布局与窗口宽度适配
mobile/
  index.html       手机版页面，入口 /mobile/
  style.css        手机版布局
  preview.html     开发用手机尺寸预览容器
  preview.css      手机预览外框样式
shared/
  base.css         两端共用的基础组件样式
  aurora.css       两端共用的紫色主题、银白会员卡与首页布局
  guidance.css     重要事项、AI 助手和个人信息页样式
  app.js           两端共用的账号、会员、倒计时与校历逻辑
  startup.js       页面启动异常提示
  favicon.svg      应用图标
server.py          两端共用的 HTTP 接口、身份验证与数据库服务
chatbot.py         本地日程助手与可选 AI 接口
data/              两端共用的 SQLite 数据库
tests/             接口、助手与两端启动回归测试
```

需要修改电脑版页面时编辑 `desktop/`，修改手机版页面时编辑 `mobile/`。两端通过同一组 `/api/` 接口访问同一个数据库，使用相同账号即可查看自己的重要事项。`shared/` 中的修改会同时影响两端，避免核心功能重复维护。Mac 客户端复用电脑版界面；电脑和手机的页面仍可用于浏览器开发调试。

运行检查：

```bash
python3 -m unittest discover -s tests -v
node --check shared/app.js
node tests/test_startup.cjs
JOURNAL_TEST_CLIENT=mobile node tests/test_startup.cjs
```

## AI 助手界面

AI 助手是本轮的界面原型，包含示例对话、底部输入框和发送按钮。点击发送只显示“暂未接入”的提示，不会向本地接口或外部模型发送文字。后续接入真实服务时，需要另行确认隐私范围、日程授权方式和费用控制。

## 版本边界

此版本用于本地开发和功能验证，默认仅监听本机。尚未包含邮箱验证、密码找回、登录限流、付费支付、推送提醒、循环课表或跨设备同步服务。正式对外上线前需要部署生产服务、启用 HTTPS、设置 `JOURNAL_SECURE_COOKIE=1`，并补齐账号恢复与防滥用机制。会员等级由可信管理端配置，浏览器不能自行提权；当前没有管理后台。

最近作业与考试只统计未完成、已填写日期且日期为今天或以后对应类型的记录。倒计时按设备当地日期计算，当前版本不做跨时区换算。暑假与其他假期必须由用户根据确认后的学校校历手动设置日期和来源。

## References

<a id="ref-1"></a>[1] pywebview contributors, “API,” documentation, 2026 (accessed 2026-10-11). [[url]](https://pywebview.flowrl.com/api/)

<a id="ref-2"></a>[2] PyInstaller contributors, “Using PyInstaller,” documentation, 2026 (accessed 2026-10-11). [[url]](https://pyinstaller.org/en/stable/usage.html)

<a id="ref-3"></a>[3] Apple, “Developer ID certificates,” Apple Developer documentation, 2026 (accessed 2026-10-14). [[url]](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)

<a id="ref-4"></a>[4] Apple, “Customizing the notarization workflow,” Apple Developer documentation, 2026 (accessed 2026-10-14). [[url]](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)

# 留学手记

留学生日常记录软件的可运行初版，包含 Mac 桌面客户端，以及独立的电脑和手机界面。使用中文界面，包含账号、会员分类、课程表、考试表和日常记录。

## 在 MacBook 上作为软件测试

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

生成的 `macos/dist/StudyAboard.app` 可拖入「应用程序」文件夹。打包包含 Python、后台与界面资源，之后启动这个应用不需要终端。必须在 Mac 上执行打包；产物对应当前 Mac 的处理器架构，打包方式参考应用打包文档 [[2]](#ref-2)。当前开发环境为 Linux，已检查启动与退出逻辑，但尚未在真实 macOS 上验证窗口及打包产物。

桌面软件数据库保存在 `~/Library/Application Support/StudyAboard/journal.sqlite3`，日志在同目录的 `app.log` 和 `runtime.log`。更新或重新打包软件不会覆盖这里的数据。原网页版的数据库不会自动导入；如需迁移，请先关闭两种程序，再将原 `data/journal.sqlite3` 复制到上述位置，并先备份目标文件。Mac 和其他设备各自保存数据，当前没有云同步。首次打开可注册一个测试账号，检查日程、会员翻转卡片及本地聊天，然后关闭重开确认数据保留。

手机版目前是独立的手机界面，还没有可安装的手机应用包。Mac 客户端内点击「查看手机版」可以预览和操作手机界面。

## 网页开发模式启动

需要 Python 3.12 或更新版本，无需安装第三方依赖。在项目目录执行：

```bash
python3 server.py
```

在浏览器打开 `http://127.0.0.1:8080`，注册自己的账号即可使用。停止服务按 Ctrl+C。若端口被占用，可执行 `python3 server.py --port 8081`。

电脑端与手机端使用独立的页面和样式文件夹。默认首页 `/` 打开电脑版，明确访问 `/desktop/` 为电脑版、`/mobile/` 为手机版。在电脑上可以访问 `/mobile-preview`，在手机尺寸窗口中操作手机版。手机版包含底部五项导航、会员翻转卡片和全屏聊天。目录拆分后需要重启服务。`previews/mobile-home.png` 和 `previews/mobile-chat.png` 是使用示例账号生成的界面截图，不含真实个人数据。

## 当前功能

- 邮箱注册、密码登录、退出登录与七天登录会话；密码加盐散列存储。
- 普通、Plus、Pro 三档会员分类。新账号默认为普通会员，所有等级目前均可使用全部基础功能，付费升级和专属权益尚未开放。
- 创建、编辑、删除课程、考试与日常记录，支持标题、日期、开始时间、结束时间、地点及备注。
- 日期、开始和结束时间分别选填，允许全部留空。课程目前按单次安排记录，尚不自动按周重复。
- 日程列表、月历视图、按日期或类型筛选、搜索、完成标记，以及本周课程、待考科目、时间待定统计。
- 每个账号只能读取、修改和删除自己的记录；刷新或重启服务后数据仍保留。
- 主页会员翻转卡片，突出当前等级，翻转后展示权益和会员页入口。
- 右下角「留学小助手」聊天窗口，支持快捷提问、连续追问、历史记录和清空对话。本地模式可查询今日、本周、考试和时间待定事项。

## 数据与开发

数据默认保存在 `data/journal.sqlite3`，请备份整个数据库文件。不要将个人数据提交到代码仓库。可通过 `--db /path/to/journal.sqlite3` 指定数据库。

```text
macos/
  launcher.py      Mac 独立窗口与后台生命周期
  run.command      启动桌面客户端
  build.command    在 Mac 上打包 .app
desktop/
  index.html       电脑版页面，入口 /desktop/
  style.css        电脑版布局与窗口宽度适配
mobile/
  index.html       手机版页面，入口 /mobile/
  style.css        手机版布局
  preview.html     电脑上的手机预览，入口 /mobile-preview
  preview.css      手机预览外框样式
shared/
  base.css         两端共用的组件样式
  app.js           两端共用的账号、会员、日程与聊天逻辑
  startup.js       页面启动异常提示
  favicon.svg      应用图标
server.py          两端共用的 HTTP 接口、身份验证与数据库服务
chatbot.py         本地日程助手与可选 AI 接口
data/              两端共用的 SQLite 数据库
tests/             接口、助手与两端启动回归测试
```

需要修改电脑版页面时编辑 `desktop/`，修改手机版页面时编辑 `mobile/`。两端通过同一组 `/api/` 接口访问同一个数据库，使用相同账号即可查看自己的日程与聊天记录。`shared/` 中的修改会同时影响两端，避免核心功能重复维护。Mac 客户端复用电脑版界面；电脑和手机的页面仍可用于浏览器开发调试。

运行检查：

```bash
python3 -m unittest discover -s tests -v
node --check shared/app.js
node tests/test_startup.cjs
JOURNAL_TEST_CLIENT=mobile node tests/test_startup.cjs
```

## 聊天助手

登录后点击右下角「留学小助手」。默认使用本地关键词查询，无需密钥，也不会向外部模型发送数据。例如输入「今天有什么安排」「本周有哪些课程」「接下来有哪些考试」「哪些安排的时间还没定」。询问课程后可以追问「那明天呢」。本地模式不是通用语言模型，界面会明确显示当前模式；助手只查看日程，不会直接增删改记录。

聊天记录保存在同一个 `data/journal.sqlite3` 的 `chat_messages` 表中，按账号隔离。界面读取最近 100 条消息；清空会删除该账号的全部聊天记录，保留课程、考试和日常记录。请求失败可以重新发送，完成过的同一条请求不会重复保存。

若需要真正的通用 AI 对话，可配置服务器环境变量接入 Responses API [[3]](#ref-3)。在启动服务的同一个终端设置：

```bash
read -rsp '输入 API 密钥：' OPENAI_API_KEY
export OPENAI_API_KEY
export OPENAI_MODEL="你有权限调用的模型名称"
python3 server.py
```

两个变量均配置后才启用 AI 模式；未配置或只配置其中一个时仍使用本地助手。密钥仅由后端读取，不传给浏览器，不应写入源码或聊天消息。服务读取进程环境变量，不会自动加载 `.env` 文件。AI 调用可能产生所用服务的费用，当前实现不提供用户级消费额度控制。

AI 模式会发送本轮问题和最近最多 16 条符合当前日程授权状态的 AI 历史消息。日程摘要默认不发送；勾选「参考我的日程」才发送该账号最多 100 条记录的类型、标题、日期、时间、地点和完成状态，不发送备注或日常正文。历史本地查询结果不会自动送到模型；取消勾选后，先前勾选状态下的 AI 对话也不会作为历史发送。本地数据库中的历史记录仍然保留。个人日程查询以浏览器提供的当地日期为准。

模型接口使用后端标准库调用，并设置请求超时和错误提示。当前自动化检查通过模拟响应验证请求结构、隐私选项和失败恢复，未使用真实密钥进行在线模型验证。配置真实密钥后需验证所选模型是否支持该接口。

## 版本边界

此版本用于本地开发和功能验证，默认仅监听本机。尚未包含邮箱验证、密码找回、登录限流、付费支付、推送提醒、循环课表或跨设备同步服务。正式对外上线前需要部署生产服务、启用 HTTPS、设置 `JOURNAL_SECURE_COOKIE=1`，并补齐账号恢复与防滥用机制。会员等级由可信管理端配置，浏览器不能自行提权；当前没有管理后台。

本周课程按本机自然周（周一至周日）统计课程记录数；待考科目包含未完成且日期为今天及以后或日期待定的考试；时间待定统计未完成且缺少日期或开始时间的记录。日期和时间采用用户输入的当地时间，当前版本不做跨时区换算。

## References

<a id="ref-1"></a>[1] pywebview contributors, “API,” documentation, 2026 (accessed 2026-10-11). [[url]](https://pywebview.flowrl.com/api/)

<a id="ref-2"></a>[2] PyInstaller contributors, “Using PyInstaller,” documentation, 2026 (accessed 2026-10-11). [[url]](https://pyinstaller.org/en/stable/usage.html)

<a id="ref-3"></a>[3] OpenAI, “Text generation,” API documentation, 2026 (accessed 2026-10-09). [[url]](https://developers.openai.com/api/docs/guides/text)

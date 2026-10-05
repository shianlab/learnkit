# RikeDesk · 日课书桌框架

一个可以由 AI 快速改造的本地学习应用框架。准备自己的音频和文稿，生成课程库，即可得到支持听读、笔记、学习计划与复习的桌面应用。

**公开的是框架和自制示例，不是任何商业课程的下载站。** 没有账号、激活码和运行时云服务。源码采用 [MIT](LICENSE)，第三方字体与组件保留各自许可。

## 已有能力

- 音频播放、倍速、音量、队列、定时停止与断点继续；切换文稿或页面时持续播放。
- Markdown/TXT 阅读、中文全文搜索、主题与排版设置、文内查找、划线与书签。
- 课程笔记、独立笔记、摘录、标签、个人图片与 Markdown/PDF 导出。
- 学习计划、实际学习时间统计、间隔复习、备份与恢复、删除撤销。
- 不限制固定六季或课程数量；分组、课程数量与音频数量由实际资料生成。

当前是 **0.1.0 开发框架**，使用 Electron、React、TypeScript、SQLite。Windows x64 已验证；其他系统需要适配与实际测试。

## 先运行自制示例

需要 Node.js 24.13 或更高版本。终端打开项目目录：

```powershell
npm --prefix app ci
npm --prefix app run prepare:demo
npm --prefix app run dev
```

演示只在空白或已有演示课程库中生成，不会覆盖已导入的自定义课程库。示例包含两个分组、四门课程，覆盖音文配对、纯文稿和纯音频。测试音频由代码生成，是测试音而非课程讲解；没有附带原项目音频、文稿、肖像或学习记录。

## 换成自己的音频和文稿

将资料放进根目录 `course-input`，例如：

```text
course-input/
  基础/
    01-第一讲.md
    01-第一讲.mp3
    02-第二讲.txt
  进阶/
    01-第三讲.md
    01-第三讲.m4a
```

同一分组下，同名音频与文稿会配对；单独文稿和单独音频也可保留。也支持分开的 `音频`/`文稿` 或 `audio`/`texts` 子目录。名字不一致时，请给 AI 一份文件清单，让它填写明确的映射表，而不是猜测内容。

```powershell
# 先核对，不修改现有课程库
npm --prefix app run import:library -- --input ../course-input --dry-run
# 查看 build/import-report.json，修正同名冲突或填写映射表后，再生成课程库和搜索索引
npm --prefix app run import:library -- --input ../course-input
npm --prefix app run dev
```

自动配对不唯一时会停止，并保留现有课程库。导入方式、映射格式、ID 与已有笔记的关系见 [资料导入说明](docs/IMPORT.md)。

当前文稿导入支持 UTF-8 Markdown/TXT；音频支持 MP3/M4A/WAV/OGG/FLAC。PDF、Word、图片文稿需要先提取为 Markdown/TXT，未提供文件内容识别或语音转写。可选安装 ffprobe 以在导入时解析音频时长；没有它仍可播放，由播放器读取实际时长。

## 让 AI 帮你做自己的应用

把这个项目目录交给 AI，并使用 [AI 开发指南与可复制提示词](docs/AI_GUIDE.md)。优先改 `app/app.config.json` 中的应用名称、说明、作者、应用标识和课程库标识；具体代码结构见 [架构说明](docs/ARCHITECTURE.md)。

自己的应用应设置新的 `appId`；稳定课程库使用固定 `libraryId`。个人数据按应用与课程库分别存放，互不覆盖。课程 ID 和段落 ID 也应保持稳定。开始学习后重命名或移动输入文件，建议用映射表保留原 ID。

AI 负责整理映射、改配置、改界面和验证；软件运行本身不需要接入任何 AI API。

## 验证与分发

```powershell
npm --prefix app test
npm --prefix app run build
npm --prefix app run package
```

自动测试使用独立自制资料，覆盖 30 项导入、笔记、备份与恢复检查，不依赖或改写你当前的课程库。原生演示回归可在准备示例后运行 `node scripts/verify/smoke.mjs`；它另外需要 Playwright，见脚本使用的运行环境加载器。

打包生成 `build/program/RikeDesk-win32-x64`。将**整个文件夹**发给使用者，双击其中的 `RikeDesk.exe` 即可运行，无需开发环境；不能只发一个 EXE。该文件夹会包含你导入的课程和 Electron 运行库，不包含你的个人笔记。

Electron 打包器默认下载官方运行库；离线打包可放置对应版本 ZIP 到 `tools/electron`。框架不捆绑安装器；需要 Windows 安装器、自动更新或其他平台时，可在此基础上扩展。

课程导入目录、生成的课程库、开发依赖、个人备份及运行产物被 Git 忽略，开源仓库只保存框架代码、说明和自制文本示例。

## 当前边界

这是面向开发者与 AI 的框架，导入使用命令行和映射文件，尚未提供应用内拖拽导入。更换资料后先正常退出应用，再导入、重建索引并启动。课堂插图支持文稿引用的本地 PNG/JPEG/WebP；网络图片不会自动下载。

大型课程、长时间稳定性、多个应用同时运行及真实休眠需要在使用者环境验证。有关第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

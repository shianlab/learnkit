# 开发约定

先读 README.md、docs/ARCHITECTURE.md、docs/IMPORT.md 和 docs/AI_GUIDE.md。

这是通用本地学习框架；不要加入原项目商业课程、肖像或个人学习数据，不要固定课程数量、分组数量和课程 ID。

修改课程导入时保持明确配对、路径边界、稳定 ID 与失败保留旧库；新增课程不要自动删除学习记录。应用身份和课程库身份由 app/app.config.json 配置。

保留跨页面音频播放、编辑保存、数据库升级、备份与恢复。调用系统文件接口仅通过主进程受控 IPC；不关闭 sandbox、contextIsolation 或 CSP。

在空白副本运行 npm --prefix app run prepare:demo。日常运行 npm --prefix app test、npm --prefix app run build；自动测试使用独立资料，不需要更换当前课程库。涉及界面或播放时补充真实 Electron 窗口检查。使用独立验证数据目录，不读取或覆盖正常个人数据。

不提交 node_modules、dist、build、content-build、用户课程、账号凭据、个人备份和运行产物。测试未执行或没有对应环境时明确说明。

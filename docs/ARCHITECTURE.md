# 代码结构

- app/app.config.json：应用展示名称、说明、默认作者、应用身份与课程库身份。
- app/src/App.tsx → WorkspaceApp.tsx：主布局、跨页面状态、持续播放与阅读分离。
- app/src/Reader.tsx / Player.tsx：阅读、段落定位、音频、队列和续学。
- app/src/LibraryPage.tsx / SearchPage.tsx：动态分组和全文搜索。
- app/src/NoteWorkspace.tsx / StudyPage.tsx / ReviewPage.tsx：笔记、计划与复习。
- app/desktop/main.cjs / preload.cjs：Electron 主进程与受控 IPC，关闭前等待保存。
- app/desktop/library.cjs / search.cjs：受限本地资源协议、目录与搜索服务。
- app/desktop/database.cjs / learning-store.cjs：SQLite 个人数据与学习功能。
- app/desktop/backup.cjs / upgrade.cjs / export.cjs：备份、数据升级与导出。
- app/scripts/import-library.mjs：扫描、明确映射、稳定身份和课程库生成。
- app/scripts/build-search.cjs：SQLite FTS5 中文搜索索引。
- app/scripts/prepare-assets.mjs：生成原创通用书本图标；已有自定义图标保持原样。
- app/scripts/package.mjs：Windows x64 程序打包及课程资料复制。
- examples/course-input：自制文稿和明确映射；音频由 create-demo.mjs 生成。
- app/tests：导入、安全、数据库、备份及通用课程回归测试。

网页渲染器不能直接读系统文件。正文仅通过 jyrk 本地协议读允许目录，禁止远程网络；contextIsolation、sandbox 与 CSP 保留。

内部协议名称、备份扩展名和数据字段沿用原实现，避免没有必要的协议迁移；它们不是应用的展示品牌。

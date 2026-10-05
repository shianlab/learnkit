# 音频与文稿导入

## 自动配对

导入器递归读取输入目录，以分组路径和不含扩展名的文件名配对。忽略路径中的 audio/audios/text/texts/documents/音频/文稿/文字 容器目录；其他子目录成为分组。排序按名称中的数字自然排列。文件名保留编号，不做模糊匹配。

只有一份音频和一份正文时配对成功；只有其中一种时保留为纯音频或纯文稿。同名出现多份时停止导入，将候选写入 `build/import-report.json`。PDF、Word 等未支持文稿也会列入报告，请先转换。

## 明确映射

在输入目录旁或里面创建 courses.json：

```json
{
  "courses": [
    {
      "id": "course-intro",
      "title": "第一讲：入门",
      "group": "基础",
      "text": "文稿/第一讲.md",
      "audio": "音频/入门录音.mp3",
      "author": "课程作者",
      "date": "2026-01-01",
      "durationSeconds": 600
    },
    {"id": "course-summary", "title": "学习总结", "group": "基础", "text": "文稿/总结.txt"}
  ]
}
```

text/audio 可以省略一个；路径以 `--input` 目录为基准，必须位于目录内，不接受链接和越界路径。id 可用字母、数字、下划线和连字符，1–64 个字符，必须唯一。映射只导入列出的条目，不会默默把剩余资料并入课程。

```powershell
npm --prefix app run import:library -- --input ../course-input --mapping ../course-input/courses.json --dry-run
npm --prefix app run import:library -- --input ../course-input --mapping ../course-input/courses.json
```

## 稳定身份与资料更新

自动 ID 由固定 libraryId、分组与文件名生成。插入新文件不会因排序变化而给旧课程重新编号；重命名或移动文件会改变自动 ID，此时应在映射中保留原 ID。相同段落内容保留内容生成的段落 ID，增加其他段落不会导致全部书签重新编号；修改段落文字可能影响该段划线和锚点，更新前先备份个人记录。

导入成功后先在临时目录完成全部文件生成，再替换旧课程库；遇到配对冲突、路径越界或图片缺失时保留旧库。搜索索引随后重建，索引与课程版本不一致时程序拒绝加载，避免错误搜索。重新导入不会主动删除 Windows 用户目录下的笔记。

appId 区分应用，libraryId 区分课程库。继续原课程库使用相同标识；另一个课程集应更换 libraryId。备份以应用和课程库身份校验，因此同一课程库增补资料后仍可恢复之前的个人备份。

## 生成目录

```text
content-build/
  library/
    catalog.json
    resource-manifest.json
    texts/
    audio/
    images/
  resource-manifest.json
  search-v1.sqlite
```

catalog 保存课程目录、正文段落与对应资源；resource-manifest 保存逐文件 SHA256；SQLite 提供中文标题、正文和个人笔记搜索。所有生成资料默认忽略，不能把自己的课程或个人备份误提交到开源仓库。

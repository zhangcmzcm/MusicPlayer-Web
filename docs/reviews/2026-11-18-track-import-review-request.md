# 提交审核：MGMT-02 管理员批量导入

任务类型：业务切片。正式实质审核第 1 轮，最多 3 轮；此前 Codex 自验及只读辅助核对不计本轮。运行器为 Claude Code 2.1.325，实际模型及会话标识以新启动会话的初始化记录为准。

## 范围与基线

- 分支 main，代码实施基线 `a7fd1dd5c6ef7713ad5a41210ff6218e16ef41c0`；送审为该提交之后到启动审核时 HEAD 的完整 MGMT-02 变更。
- 已通过的[设计](../superpowers/specs/2026-11-18-track-batch-import-design.md)、[计划](../superpowers/plans/2026-11-18-track-batch-import.md)、[管理任务书](../tasks/song-management.md)是需求依据。
- 一页及完整批量流程：`/admin/tracks/import`、上传入口、跨页队列、手动恢复与关联导航。
- 不包含草稿编辑／发布／归档／删除、后端任务轮询、持久化队列及依赖升级。
- 首次审核反馈复核：不涉及。

## 需求、权限与声称行为

仅当前 ADMIN。匿名安全登录恢复、USER 首次／登录回跳沿既有守卫。后端 403 保留会话，当前 401 统一清理，旧 401 不影响新会话。使用单个 POST `/api/v1/track-imports`，FormData 只有 uploadId／file，浏览器生成 boundary，原文件同键重试。

上传区和队列同页；MP3／FLAC 每文件 200 MiB；先校验手动开始；逐首发送、运行／暂停可追加、未发送可移除、离页当前完成后暂停；发送与服务处理区分；元数据提示计成功；错误按批准矩阵恢复；会话对象／角色／revision／尝试归属隔离；返回恢复五字段，查看草稿重置 q／status／page。

全部声称行为、字段消费（含缺失／null／边界／非法形态）、谓词依据及权限／调度决策表、视觉确认、完整逐文件清单，见[功能文档](../features/track-import.md)。校验来源分为 API、批准产品、安全及客户端运行，没有待澄清的关键交付谓词。

API 原文只读引用[导入](../api/track/import-track.md)、[列表](../api/track/list-tracks.md)。共享 tracks 精确解析被最小提取并保留原列表回归。主题 `docs/design/theme.md` 和 `example/index.html` 只读，采用已批准 A 布局，未修改审核协议和契约。

## 实际自验

- npm ci：沙箱 EPERM 后正常权限重跑退出 0，依赖与锁文件未改。
- npm run check：退出 0，lint 零警告、格式通过、669 单测通过、构建成功。
- npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html：669 通过／0 失败／0 跳过／0 todo。
- npm run test:e2e：Chromium 133 通过／0 失败／0 跳过，0 重试／flaky／预期失败。MGMT-02 独有 21 项。
- 所有改动业务源码逐文件达到行 ≥80%、分支 ≥70%，表格与报告来源在功能文档；router/index.js 100% 行，0 分支不适用。
- 已查看 1440／320 截图，六种视口布局自动化通过。截图与报告保持忽略，不提交产物。未执行真实后端联调及其他浏览器，不把 mock 音频当真实媒体解析验证。
- 首轮 e2e 18 通过／1 失败（用户点提示后焦点断言位置错误），修正测试后定向 21 和全量 133 均通过；开发 lint 未用导入及格式失败已修正，完整重跑通过。

## 独立审核要求

先读根目录 AGENTS.md 与 CLAUDE.md，按 CLAUDE.md 清单逐项 A1—A7、B1—B8、C1—C9、D1—D9、E1—E10、F1—F4、G1—G6 独立检查，使用真实条目与适用性，不能把 Codex 自报替代独立验证。按协议执行 npm ci、npm run check、完整覆盖率命令和 npm run test:e2e。审核前后核对 Git 状态；构建／coverage／测试报告可生成，禁止修改源码、测试、配置、文档、契约或 Git 状态。不得运行格式修复、lint:fix、audit fix。

既有人工工作树为 ` M docs/api/track/list-tracks.md`、`?? docs/api/favorite/`（三个接口文档），启动审核时再次核对。它们不属于 MGMT-02 提交，也不允许清理／修改。实现基线到 HEAD 才是本次变更范围；引用时可读取当前契约，勿将人工维护行为误判为 Codex 越界。

输出 accepted／needs_revision／escalated，标明第 1 轮，阻断／非阻断问题用稳定编号、实际文件行和证据，说明验证失败、跳过、未执行及分支阈值。审核正文由调用方原样归档，审核方不要写入仓库文件。

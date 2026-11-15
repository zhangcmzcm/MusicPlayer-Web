# LIB-01 曲库主页首次实现审核请求

## 任务与边界

任务类型为业务切片。Git 实现基线为 `main / cde4739`，审核对象为 `cde4739..HEAD`。此前 `9714ed4` 是已确认的样式设计，`cde4739` 是人类批准的实施计划。实际送审 HEAD 由审核方执行 `git rev-parse HEAD` 记录。

交付 `/` 统一已发布曲库、鉴权封面、原始关键词搜索、排序、分页、请求生命周期与登录默认业务落点。播放、队列、歌词、收藏、个人中心和管理页分别属于任务书后续切片。生产导航随真实路由接入，当前只有音乐入口和会话用户名。

人类以“开始吧”批准当前会话实现。Codex 编写业务代码，辅助 Agent 只读核对接口、测试时序和依赖信息。此前定向自测和辅助检查均为实现过程，本请求为第 1 轮实质 Claude 审核，最多三轮。

## 需求、权限与声称行为

- USER 与 ADMIN 均通过当前会话浏览 `status=PUBLISHED`，当前登录身份决定导航权限。
- 匿名主页访问保留安全回跳，登录成功默认进入曲库。已有三种认证、身份选择、注册预填、密码重置预填保持原流程。
- URL 恢复已提交搜索、排序和分页。关键词保留首尾空白及 Unicode 码点语义，过滤与页大小变化回第 1 页。
- Long ID、时长及统计保持精度。合法 null、空页和超大统计可展示，异常展示字段安全降级。
- 加载、空、错误、429 倒计时及手动重试可见，限流期间清空关键词可浏览。
- 封面经已知鉴权 API 获取 Blob，失败使用缺省图，取消、切换和卸载释放资源。
- 当前 401 清理当前会话，旧 Token 或旧 revision 的 401 保留新会话。查询和会话过期响应无法覆盖当前数据。
- 手机合并歌曲元数据，长歌名截断并保留时长列，搜索展开可键盘操作。真实侧栏目标存在时提供手机左抽屉。

## 校验、字段与组合证据

完整谓词清单、API／产品／安全／客户端依据、相关字段缺失／null／边界／非法形态及关键组合决策表位于功能说明的对应章节。请逐项对照实现，核对声称与实际是否一致。[功能说明](../features/library.md)

接口依据为人类提供的 [GET tracks](../api/track/list-tracks.md) 与 [GET cover](../api/track/get-track-cover.md)，既有认证与会话处理继续引用 [登录文档](../features/login.md)。前端通过统一 src/api 实例访问业务接口。

视觉复用 `docs/design/theme.md`、`example/index.html` 的配色与气质，以及人类确认的 [整体样式设计](../superpowers/specs/2026-11-15-library-style-design.md) 和 [实施计划](../superpowers/plans/2026-11-15-library-homepage.md)。五种尺寸均有真实浏览器检查，代表截图已人工核对。

## 实际验证

环境为 Windows、Node v22.19.0、npm 10.9.3、Playwright Chromium。业务请求全部 mock。实际命令、最终数量、逐文件完整覆盖率、失败修复经过和已知联调边界记录于 [功能说明的测试章节](../features/library.md#测试视觉检查和验证)。

已运行 `npm ci`、`npm run check`、`npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html` 与 `npm run test:e2e`。覆盖率报告位于忽略的 `coverage/coverage-summary.json` 和 `coverage/index.html`，逐文件门槛均为行 80%／分支 70%。各命令日志位于忽略的 `.superpowers/library-*-run.txt`。审核方按 CLAUDE.md 独立运行必要命令并记录实际结果。

## 完整变更文件

### API、查询与资源生命周期

- `package.json`、`package-lock.json` 增加精确锁定的 lossless-json 4.3.3。
- `src/api/tracks.js`、`src/api/tracks.spec.js` 实现列表、精确数值和二进制封面错误转换。
- `src/utils/trackList.js`、`src/utils/trackList.spec.js` 提供查询、序列化与时长格式化。
- `src/utils/errors.js` 增加稳定 code 的安全文案，既有 errors.spec.js 继续提供回归。
- `src/test/factories.js` 增加标准页与原始数值 token fixtures。
- `src/composables/useTrackList.js`、`src/composables/useTrackList.spec.js` 管理请求、限流和过期结果。
- `src/components/library/TrackCover.vue`、`src/components/library/TrackCover.spec.js` 管理鉴权资源及 Object URL。
- `src/api/http.js`、`src/api/http.spec.js` 接入 Token 与 revision 双匹配。
- `src/main.js`、`src/main.spec.js` 注入会话 revision 并验证真实启动及失效回跳。

### 页面与导航

- `src/components/layout/BusinessLayout.vue`、`src/components/layout/BusinessLayout.spec.js` 提供真实导航、身份筛选及手机侧栏。
- `src/components/library/LibraryToolbar.vue`、`src/components/library/LibraryToolbar.spec.js` 提供搜索、排序和页大小。
- `src/components/library/TrackTable.vue`、`src/components/library/TrackTable.spec.js` 提供列表状态、信息、分页和手机布局。
- `src/views/library/LibraryView.vue`、`src/views/library/LibraryView.spec.js` 编排 URL 与页面状态。
- `src/router/index.js`、`src/router/index.spec.js` 接入受保护主页并保留认证父场景与 404。
- `src/router/guards.spec.js`、`src/utils/redirect.spec.js` 更新真实根路由的安全回跳验证。
- `src/views/login/LoginView.vue`、`src/views/login/LoginView.spec.js` 接入成功默认导航与失败恢复。

### 浏览器与文档

- `e2e/fixtures.js` 增加精确默认空页与原始图片／JSON 响应支持。
- `e2e/login.spec.js` 将成功断言接入真实曲库与当前会话身份，保留原认证请求断言。
- `e2e/library.spec.js` 新增曲库主流程、资源、会话与五尺寸检查。
- `docs/features/library.md` 记录行为、依据、逐文件覆盖率与验证结果。
- `docs/tasks/library-homepage.md` 更新 LIB-01 的真实进度。
- `docs/superpowers/plans/2026-11-15-library-homepage.md` 更新各步骤、实际失败和修复记录。
- 本审核请求记录范围、基线与材料入口。

### 原有人类工作区文件

下列文件在实现基线前已存在于工作区，保持原归属。Codex 只读消费，提交对象排除这些文件。

- ` M docs/api/track/list-tracks.md` 为人类提供的搜索契约更新。
- `?? docs/api/favorite/favorite-track.md`。
- `?? docs/api/favorite/list-favorites.md`。
- `?? docs/api/favorite/unfavorite-track.md`。

请同时检查 Git 状态、基线后已提交内容及未跟踪文件，区分上述人类文件与本切片新增材料。AGENTS.md、CLAUDE.md、主题、视觉样例与 API 契约均保持只读。

## 审核反馈复核与处置

首次提交，不涉及。请按 CLAUDE.md 完整模板输出结论、实际独立验证、逐项清单、稳定问题编号和证据。

## 当前审核进度

本请求保留首次送审范围。实际第 3 轮审核已 accepted，前两轮执行事实与原报告见[轮次记录](2026-11-15-library-review-round-2.md)，本轮范围、反馈三个判断与恢复验证方式见[反馈复核](2026-11-15-library-review-response.md)。Codex 最新自验为 484 单测、93 e2e 全部通过，逐文件覆盖率及实际命令已更新至功能说明。

最终独立结论、实际命令与逐项反馈关闭记录见[第 3 轮原始报告](2026-11-15-library-review-round-3.md)，审核代码版本为 `97bc0e014fab5cd8749747a2bb88b08bfe1cbee2`。

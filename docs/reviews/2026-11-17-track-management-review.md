# MGMT-01 独立审核归档

2026-11-17 使用 Claude Code 2.1.325 与用户既有 mimo-v2.6-pro 配置进行第 1 轮实质审核，结论为 accepted。审核会话标识为 `eeecece9-3b58-4d5e-8ce5-2ff5e7bdc711`，实际耗时约 12 分 28 秒。

送审范围为 `e819a1f1b18c55a45f72b2dd209d2b27400a924d..f5b863122cb113de4e33b2a7b1c65ce13f6f2fcf` 的 22 份文件，原始 stream-json 及原始 Markdown 保存在本地忽略目录 `.superpowers/`。以下保留完整报告内容，仅作 Markdown 排版规范化。

Codex 复核结果为阻断项和非阻断建议均无。审核说明的空页口径与人类已批准计划任务 3 一致，totalElements=0 保留统计、请求页与既有分页恢复；page>0 且总数>0 提供专用回到第一页。当前业务源码在 accepted 后完成归档。

---

全部核查完成。无 skip/only，提交信息与计划一致。以下为完整审核报告。

---

## Verdict: accepted

审核任务：MGMT-01 管理员歌曲列表，业务切片（`/admin/tracks` 管理读取：ADMIN 真实侧栏、全部／单状态列表、搜索、排序、分页、URL 恢复、错误恢复、会话保护；不含批量导入、编辑、发布、归档、删除，即 MGMT-02 至 MGMT-06）
审核轮次：**第 1 轮实质审核**（本轮已逐行检查实现与测试正确性，计实质轮次）
Git 基线：`main` / 实施基线 `e819a1f1b18c55a45f72b2dd209d2b27400a924d` → 送审终点 `f5b863122cb113de4e33b2a7b1c65ce13f6f2fcf`（5 个提交：5687656、971e56b、412b15d、bfb3488、f5b8631），working tree 另含人类契约输入

### 范围检查

- 结果：**通过**
- 预期范围与排除项：单一 MGMT-01 管理读取切片；排除 MGMT-02..06 的导入、编辑、发布、归档、删除；排除契约、主题、样例、审核协议改动；保留任务开始前的人类工作区文件
- 实际变更文件（含 untracked）：`git diff --name-status e819a1f..HEAD` 共 **22 份**，与申报一致：`docs/features/track-management.md`(A)、`docs/superpowers/plans/2026-11-17-track-management-list.md`(M)、`docs/tasks/song-management.md`(M)、`e2e/library.spec.js`(M)、`e2e/track-management.spec.js`(A)、`src/api/tracks.js`(M)、`src/api/tracks.spec.js`(M)、`src/components/library/TrackTable.spec.js`(M)、`src/components/library/TrackTable.vue`(M)、`src/composables/useTrackList.js`(M)、`src/composables/useTrackList.spec.js`(M)、`src/router/guards.js`(M)、`src/router/guards.spec.js`(M)、`src/router/index.js`(M)、`src/router/index.spec.js`(M)、`src/utils/errors.js`(M)、`src/utils/errors.spec.js`(M)、`src/utils/trackList.js`(M)、`src/utils/trackList.spec.js`(M)、`src/views/login/LoginView.spec.js`(M)、`src/views/management/TrackManagementView.spec.js`(A)、`src/views/management/TrackManagementView.vue`(A)。工作区人类所有输入（非实现变更，未误判越界）：已修改 `docs/api/track/list-tracks.md`（人类新增 q 搜索与限流契约内容，经 `git diff` 核实为契约更新）、未跟踪 `docs/api/favorite/favorite-track.md`、`list-favorites.md`、`unfavorite-track.md`。`git diff --cached` 为空。
- 越界改动：无。共享文件改动均核对为切片必要：`TrackTable.vue` 紧凑断点 1100px 与序号单行样式由新增侧栏挤压中等宽度所致（计划任务 3 明确，e2e 1024px 覆盖曲库关联回归）；`guards.js`、`useTrackList.js`、`errors.js` 为最小接口扩展（`from` 参数、可选 `fetchPage`、一条本地文案）；`e2e/library.spec.js` 仅调整 ADMIN 管理入口关联断言并补 USER 隐藏。提交信息均中文且与计划登记一致。
- 需求/权限/契约来源：`docs/superpowers/specs/2026-11-16-song-management-list-design.md`（人类已通过）、`docs/superpowers/plans/2026-11-17-track-management-list.md`（人类已通过）、`docs/tasks/song-management.md`、`docs/api/track/list-tracks.md`（工作区人类版本）、`docs/api/track/get-track-cover.md`、AGENTS.md 第五、六节与第十二节决策。

### 独立验证

- 环境：Node v22.19.0、npm 10.9.3（符合 `engines` 与 `.nvmrc`）；Windows 11；Playwright Chromium（既有安装）；`playwright.config.js` 核实 retries=0、workers=2、webServer `npm run dev` @127.0.0.1:4173，与计划一致
- 实际命令及退出结果（逐项独立执行，未用管道截尾掩盖退出码）：
  - `npm ci` → **退出 0**，added 308 packages、audited 309，报告 6 个既有 moderate advisories（与申报一致；未运行 `npm audit fix`）。我方首次执行即成功，Codex 自报的沙箱 `Exit handler never called` 未在我环境复现，不影响结论
  - `npm run check` → **退出 0**（`lint --max-warnings 0` 零警告、`format:check` 通过、`test:unit` 通过、`build` 通过；Vite 仅既有全量 Element Plus >500kB 提示，构建产物含 `TrackManagementView` 独立 chunk，路由懒加载生效）
  - `npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html` → **退出 0**
  - `npm run test:e2e` → **退出 0**
- Vitest：**通过 546 / 失败 0 / 跳过 0 / todo 0**，31 个测试文件（check 与 coverage 两次运行一致）
- Playwright：**通过 112 / 失败 0 / 跳过 0**（管理用例 19 条、registration 等既有用例全部通过）
- 重试/flaky/预期失败：**均为 0**（配置 retries=0，运行器无 flaky/expected-failure 输出）
- 覆盖率：报告来源为本轮自跑的 `coverage/coverage-summary.json`（HTML 于 `coverage/index.html`）。逐个改动业务逻辑源码文件完整文件口径：

| 文件                                         | 行              | 分支                   | 达标（≥80%/≥70%）                           |
| -------------------------------------------- | --------------- | ---------------------- | ------------------------------------------- |
| src/api/tracks.js                            | 96.55%（56/58） | 84.61%（66/78）        | 是                                          |
| src/utils/trackList.js                       | 100%（47/47）   | 100%（53/53）          | 是                                          |
| src/utils/errors.js                          | 100%（12/12）   | 90.90%（10/11）        | 是                                          |
| src/composables/useTrackList.js              | 100%（54/54）   | 96.87%（31/32）        | 是                                          |
| src/components/library/TrackTable.vue        | 100%（52/52）   | 100%（85/85）          | 是                                          |
| src/views/management/TrackManagementView.vue | 98.11%（52/53） | 89.36%（42/47）        | 是                                          |
| src/router/guards.js                         | 100%（10/10）   | 100%（14/14）          | 是                                          |
| src/router/index.js                          | 100%（12/12）   | 不适用（0 可执行分支） | 是（真实路由挂载由 index.spec 与 e2e 验证） |

逐文件数值与 Codex 申报**完全一致**；全仓行 97.76%、分支 93.47% 仅作补充。无覆盖率豁免需要。

- 失败与跳过明细：无
- 验证前后 Git 状态：**一致**。验证前与 npm ci／check／coverage／e2e 后均为 ` M docs/api/track/list-tracks.md` + 3 个未跟踪收藏契约，HEAD 保持 f5b8631，无源文件或锁文件被改写；`dist/`、`coverage/`、`test-results/` 等产物均在忽略目录。

### 审查清单

**A1–A7**

- A1 **通过**：单一 MGMT-01 管理读取切片，路由 `/admin/tracks`，边界与设计/计划一致，MGMT-02..06 未夹带（无导入/编辑/发布/归档/删除入口、无假入口）。
- A2 **通过**：22 份变更逐项核对与申报一致（含 staged 空、untracked 判别），均为切片所需；5 个提交对应计划任务 1–5。
- A3 **通过**：无无关重构/格式化/依赖升级；共享改动（TrackTable 断点与序号样式、guards、useTrackList、errors）逐项核对必要性与回归影响，见范围检查。
- A4 **通过**：`GET /api/v1/tracks` 请求仅含 `page`、`size`、`sort`、`status`（单状态严格大写三值，全部省略）、`q`（非空原值）——与列表契约"查询参数"一致；封面 `GET /api/v1/tracks/{id}/cover` 按契约鉴权读取；无发明字段（见字段对照表）。
- A5 **通过**：始终携带 `page`/`size`/`sort`，无全量拉取；深分页 `page×size≤10000`、下一页需 `hasNext` 且乘积合规（TrackTable.vue:27-31）；相同五字段提交合并为手动刷新（TrackManagementView.vue:50-57）；本切片无写入，404/409 仅走统一映射与重试（文档如实说明）。
- A6 **通过**：角色来自 `auth.session.user.role`（TrackManagementView.vue:25）；管理客户端流程要求当前会话 ADMIN，共享接口 USER 读取范围由后端限定、曲库固定 PUBLISHED（tracks.js:113-115），与契约权限矩阵及设计第 3 节一致；Token/会话沿用 sessionStorage + revision 已确认决策，无自创刷新。
- A7 **通过**：校验依据四类均有出处（见门卫对照）；请求校验与响应消费分离——响应接受契约允许的缺失/null/边界（albumName、durationMs、cover 合法 null；未知字段忽略），仅对影响安全与本次操作的关键结构（id、status、分页回显）整体拒绝，展示异常降级不否决合法结果；本地 `INVALID_MANAGEMENT_QUERY`/`INVALID_RESPONSE` 只表达客户端失败，不冒充后端码。

**B1–B8**

- B1 **通过**：纯 JS、Vue 3、`<script setup>`，无 TS/Options API（全部新增/修改源码核实）。
- B2 **通过**：TrackManagementView 编排路由与私有交互；LibraryToolbar、TrackTable 为纯展示组件，仅 props/emit，无数据获取。
- B3 **通过**：本切片无新增 store，按设计第 6 节"页面私有查询和页数据由页面流程持有"；会话状态统一经 auth store；异步经 useTrackList 的 pending/error。
- B4 **通过**：业务请求经 `src/api/http.js` 统一实例（`VITE_API_BASE_URL`，无硬编码域名）；封面经同实例附加 Bearer（tracks.spec 断言 `Authorization` 头），未向对象存储直连或在 URL 放 Token（与封面契约一致）。
- B5 **通过**：路由懒加载（`() => import(...)`，构建产物独立 chunk 佐证）；`createAuthGuard` 统一认证/角色守卫，守卫不取业务数据；`/:pathMatch(.*)*` 404 兜底保留。
- B6 **通过**：`v-for` 以 `option.value` 为 key（TrackManagementView.vue:139），表格 `row-key="id"`；模板无复杂业务表达式（均抽 computed/方法）；事件语义 `search-submitted`/`sort-changed`/`page-changed` 等明确。
- B7 **通过**：请求序号 + AbortSignal + 会话对象 + revision 四重归属（useTrackList.js:47-51），两种完成顺序的乱序测试、卸载取消、换会话、同 Token 新 revision 均有断言（useTrackList.spec.js:42-134），e2e 复核旧会话迟到 401 不清新会话。
- B8 **通过**：无 TODO/FIXME/console.log/死路由/假入口/生产假数据（grep 核查源码与 e2e 无残留）；新增导出均有消费方；测试 fixtures 仅在测试内。

**C1–C9**

- C1 **通过**：`ProblemDetail` 统一转 `ApiError{code,status,detail,retryAfter}`（http.js:30-77），UI 经 `getErrorMessage` 按稳定 code 映射；未知码有 status 级安全兜底 + `reportError` 合规日志（http.js:64-65）；业务代码不消费 message 文本。
- C2 **通过**：当前受保护会话 401 仅在 sessionToken 与 revision 均匹配时清理并跳登录（http.js:66-74），redirect 为安全站内路径（e2e 断言 `redirect=.*admin`）；旧会话迟到 401 不清新会话（useTrackList.spec、e2e `should_discard_old_management_401_after_same_token_new_session`）；公开登录 401 走既有认证流程不动；403 显示权限反馈保留会话（e2e 断言 sessionStorage 仍为 ADMIN）；无导航循环（角色拒绝落点 library 无 roles）。
- C3 **通过**：网络/超时/503/429 有专门反馈与重试（e2e `should_retry_management_network/service_failure`、`should_clear_limited_search_without_losing_status`）；主动取消静默（`CANCELLED` 不报网络故障，useTrackList.spec:223-229）；404/409 走统一映射与重试路径（本读取切片无写入冲突，文档如实说明）。
- C4 **通过**：加载/空/错误三态齐全（TrackTable.vue:87-112）；pending 合并重复刷新（retry 合并，useTrackList.spec:182-194）；后台查询不禁用整页输入；无吞错/假成功。
- C5 **通过**：页码表单规则 1—floor(10000/size)+1 与契约边界一致（TrackTable.vue:44-63）；搜索规则与契约词数/码点一致；无擅自增加的限制。
- C6 **通过**：本切片无破坏性/状态流转操作（属 MGMT-04..06），不适用。
- C7 **通过**：createdAt 仅作排序消费不展示；id 全程精确十进制字符串，仅 BigInt 格式化与比较，无精度损失（最大 Long 用例覆盖）。
- C8 **通过**：沿用嫩叶绿主题变量、scoped CSS、Element Plus 全量引入、白色连续列表；状态标签浅绿/墨绿语义色属设计第 4 节"中文标签与语义颜色"已确认范围；1100px/720px 断点与序号宽度为计划明确项；无未经确认的视觉方向变更。
- C9 **通过**：拒绝分支可追溯（见门卫对照）；导航抛错只显示安全文案，e2e 断言不泄漏 "private navigation failure"、403 detail 不泄漏 "private database path"；无无依据业务限制。

**D1–D9**

- D1 **通过**：Token 存储 sessionStorage、revision 归属沿已确认决策，无新增刷新机制；注销/换会话清理正确（既有 store + 本切片 composable 归属测试）。
- D2 **通过**：身份/角色仅取自会话；URL 只承载查询条件，资源 id 取自响应并由后端鉴权；403 后不显示受限数据（列表整体替换为反馈）。
- D3 **通过**：文档明确"后端负责实际授权，客户端按当前会话提供菜单与导航体验"，未将前端守卫宣称为授权；无解码 JWT 当证据。
- D4 **通过**：无硬编码域名/Token/密钥；仅 `VITE_API_BASE_URL` 公开配置；无新增环境变量。
- D5 **通过**：未提交 `.env`/凭据；e2e 的 `sample-password` 为测试夹具占位；文档无真实秘密。
- D6 **通过**：无 `v-html`；q 以文本插值 + `white-space: pre-wrap` 展示；redirect 由既有 `resolveSafeRedirect` 限制站内（guards.spec 保留 evil.test 等回归）；错误文案均为映射后安全文案。
- D7 **通过**：搜索为显式 Enter/按钮提交 + IME 保护 + 429 冷却禁用（状态/排序/页大小/重试），清空关键词始终可恢复；按交互选择性节流符合规则；后端限流结果正确呈现（倒计时 + 手动恢复）。
- D8 **通过**：无上传（MGMT-02）；不适用。
- D9 **通过**：封面按精确 id 构造已知业务地址、经业务 HTTP 附加 Bearer、Blob 显示（tracks.spec 断言 URL/头/类型白名单）；未擅改上传/资源协议；对象 URL/监听器清理为既有 TrackCover 生命周期，1100px matchMedia 监听器在 onScopeDispose 移除（TrackTable.vue:23）。契约"短于 Content-Length 视为失败"由浏览器网络层拒绝截断传输并有空 Blob 兜底检查（tracks.js:162），属 LIB-01 既有实现，本切片复用无回归。

**E1–E10**

- E1 **通过**：含运行逻辑，31 份 Vitest 覆盖行为，无空测试。
- E2 **通过**：成功、非法查询、401（当前/旧会话）、403、响应异常、429、5xx/网络、边界（100/101 码点、5/6 词、100×100/101×100、最大 Long）逐一覆盖；404/409 说明不适用（无对象读取/写入）并保留统一映射回归。
- E3 **通过**：三态、防重复刷新合并、冷却、乱序/取消/卸载均有断言（见 B7/C3/C4 证据）。
- E4 **通过**：`e2e/track-management.spec.js` 19 条 mock e2e 覆盖完整用户流程（真实登录身份选择→曲库→管理→全部/单态/搜索/排序/翻页/刷新/历史）及权限、错误、资源、六尺寸。
- E5 **通过**：HTTP 全部经 `page.route` mock（`mockApi` + `defaultLibraryPage: false` 显式响应业务请求），无真实业务网络；数据自建（trackPage/trackPageText 工厂 + 固定断言）；选择器用角色/可访问名称（`getByRole('radiogroup', { name: '歌曲状态' })` 等），仅必要的状态徽标用样式类做视觉断言；webServer 与配置一致。
- E6 **通过**：grep 全仓 spec 无 `.skip`/`.only`/`.todo`；无删断言/快照掩盖（本切片无快照）。
- E7 **通过**：安装、check、覆盖率、e2e 均独立执行，真实结果如上；覆盖率重跑与单测分开记账。
- E8 **通过**：逐文件完整口径 8 份业务源码全部达标（表格见独立验证），无批准例外；router/index.js 零分支单列不适用。
- E9 **通过**：可选≠可空区分到位——`status` 响应缺失（真删 JSON 字段）/null/未知/小写/越界与请求侧 null/数组/空串/ALL/小写/未知分列用例（tracks.spec.js:77-98、trackList.spec.js:45-53）；合法 null（albumName/durationMs/cover）与非法形态（title:42、artistName:null、duration "abc"）降级分列（tracks.spec.js:187-240）。
- E10 **通过**：数据形态映射到用例（功能文档表格与实现/测试一致，本报告字段表交叉核实）；仅关联字段覆盖关键组合（单状态×响应越界、429×q/状态、角色×来源），未穷举处（如 page/size 回显不匹配的防御分支、totalPages 非法与 totalElements 同路径）在覆盖率与文档中如实体现，不以满值 fixtures 冒充边界覆盖（工厂默认值问题已改用真实删字段方式）。

**F1–F4**

- F1 **通过**：`docs/features/track-management.md` 存在，含目标/边界/排除项。
- F2 **通过**：列明 `GET /api/v1/tracks`、`GET /api/v1/tracks/{id}/cover` 并引用契约文档，未擅改契约、未复制大段响应示例。
- F3 **通过**：加载/空/错误/冲突交互、Vitest 用例、e2e 适用性、已知限制（真实联调与其他浏览器未执行）、待澄清（MGMT-03 version 前置）均记录，与实现核对一致。
- F4 **通过**：真实联调前置在任务书/功能文档记录（尚未执行如实声明）；文档中文、无秘密；设计/计划文档仅登记进度。

**G1–G6**

- G1 **通过**：Node/npm 符合 engines/.nvmrc，锁文件未动，`npm ci` 成功（308/309 与申报一致）。
- G2 **通过**：check 聚合 lint+format:check+test:unit+build 完整且实测退出 0；覆盖率与 e2e 另行实测通过。
- G3 **通过**：公开配置仅 `VITE_*`；构建/代理策略未动；业务代码不直连生产域名。
- G4 **通过**：新增依赖为零（package.json/lock 在基线区间无变更）；base/分包/sourcemap 未动。
- G5 **通过**：未提交 `dist/`、`node_modules/`、报告、截图（截图写入 playwright `test-results` 忽略目录）；未改 `.gitignore`。
- G6 **通过**：无 `console.log` 残留（源码 grep 干净；e2e 中 `[music-web]` warn 为既有 logger 经 console.warn 的合规脱敏输出）；无本机绝对路径或未说明人工步骤。

### 门卫与契约对照

- 门卫代码清单：
  - `src/router/guards.js:5-19` — 认证守卫 + 角色守卫 + 来源恢复落点
  - `src/utils/trackList.js:36-44`（q 校验）、`46-72`（page/size/sort 解析与边界）、`84-106`（管理 status 解析/序列化）
  - `src/api/tracks.js:15-28`（Long 精确解析）、`53-59`（响应 status 三态与范围匹配）、`94-102`（关键结构与分页回显校验）、`138-145`（封面 id 客户端预校验）
  - `src/composables/useTrackList.js:24-70`（请求序号/信号/会话对象/revision 归属、429 冷却门）
  - `src/api/http.js:30-77`（ProblemDetail 转换、429 Retry-After 严格解析、401 会话边界）
  - `src/components/library/TrackTable.vue:26-63`（下一页乘积上限、页码范围规则）
- 拒绝/降级分支依据：
  - q/status/page/size/sort 请求拒绝 → **API 契约**（list-tracks.md"查询参数/关键词匹配"）+ **产品规则**（设计第 5、7 节；status 全部省略语义）；文件：trackList.js:36-106
  - 响应 id/status/分页结构拒绝（`INVALID_RESPONSE`）→ **API 契约**（"成功响应"字段表）+ **客户端运行规则**（无法安全继续操作的关键异常）；tracks.js:53-110
  - title/artistName/albumName/durationMs/cover 展示降级 → **产品规则**（设计第 7 节展示恢复 + LIB-01 降级规则），不否决整页；tracks.js:49-77
  - USER 角色拒绝落点（首达/登录回跳→曲库；有效业务来源→取消导航）→ **产品规则**（设计第 3 节进入条件表，2026-11-17 人类确认）；guards.js:12-16
  - 401 清理会话/迟到 401 忽略 → **安全规则**（AGENTS 第五节 401 会话边界）；http.js:66-74、useTrackList.js:47-51
  - 取消/过期响应忽略、冷却手动恢复 → **客户端运行规则**（AGENTS 第四节 C3/生命周期）；useTrackList.js:56-69
  - `INVALID_MANAGEMENT_QUERY`/`CLIENT_ERROR` 本地码 → **客户端运行规则**（设计第 7 节"查询错误使用本地客户端错误表达"），文案独立于后端码；errors.js:2
  - 缺失依据的分支：无
- 字段行为对照表（本次新增/修改且影响行为）：

| 字段/判断                                        | 契约规则                                              | 客户端用途                                                      | 缺失/null/边界/非法类型                                                           | 依据与用例                                                                    |
| ------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 请求 status                                      | 单值 DRAFT/PUBLISHED/ARCHIVED 严格大写，权限按角色    | 管理范围筛选；全部=省略                                         | URL 缺省→全部；null/数组/''/ALL/小写/未知→`INVALID_MANAGEMENT_QUERY`+恢复默认     | 契约查询参数+设计 §5/§7；trackList.spec:38-72、view.spec:159-178、e2e:271-295 |
| 请求 q                                           | 原始解码值 1—100 码点、White_Space 1—5 词、纯空白 400 | 搜索；空省略                                                    | 缺省→普通列表；null/数组/101 码点/6 词/纯空白→拒绝并恢复；原值含首尾空白透传      | 契约关键词匹配；trackList.spec:54-98、tracks.spec:43-76、e2e:94-96            |
| page/size                                        | 非负整数；size 1—100；page×size≤10000                 | 分页请求与显示                                                  | 缺省 0/20；'+100'/'0100' 合法；小数/负/数组/越界→恢复                             | 契约查询参数；trackList.spec:105-131                                          |
| sort                                             | 四字段×两方向，默认 id,desc                           | 排序（产品默认 createdAt,desc，始终显式发送，不依赖服务端默认） | 非法字段/方向/数组→恢复                                                           | 契约排序+任务书"最近加入"确认；trackList.spec:122-124                         |
| 响应 items[].status                              | 三态枚举                                              | 表格状态徽标与范围校验                                          | 全部查询接受三态混合；单状态必须匹配；缺失/null/未知/越界→整页 `INVALID_RESPONSE` | 契约响应+设计 §7；tracks.spec:22-98                                           |
| items[].id                                       | Long 1—9223372036854775807                            | 封面请求与 row key，精确字符串                                  | 缺失/字符串/小数/0/溢出→拒绝；等价科学计数/`.0` 记法→精确十进制                   | 列表+封面契约、资源安全；tracks.spec:54,144-229                               |
| title/artistName                                 | String                                                | 展示                                                            | 异常/空→'未命名歌曲'/'未知艺术家' 降级                                            | LIB-01 降级；tracks.spec:108-143,187-202                                      |
| albumName/durationMs/cover                       | 合法可空                                              | 展示/时长/鉴权封面                                              | null 合法（未标注/--:--/缺省图）；非法类型降级不拒页                              | 契约响应字段；tracks.spec:167-240、e2e:226-269                                |
| page/size 回显、totalElements/totalPages/hasNext | 回显请求值、非负 Long、Boolean                        | 分页控件与统计                                                  | 回显不匹配/负值/hasNext 非布尔→拒绝；空页保留统计                                 | 契约成功响应；tracks.spec:241-278                                             |
| 未知响应字段                                     | —                                                     | 忽略                                                            | 一律忽略（extra/newField 用例）                                                   | AGENTS 响应消费；tracks.spec:108-143,187-202                                  |

- 关键组合决策表：

| 条件                          | 预期                                                          | 用例                                                                            | 不可达组合                                            |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 匿名/会话过期 → /admin/tracks | 清理会话，登录+安全 redirect                                  | index.spec `should_resolve_initial_management_navigation_for_null`、e2e:350-359 | —                                                     |
| USER 首次直达/登录回跳        | 提示无权限，落曲库，仅发 PUBLISHED                            | guards.spec:18-36、LoginView.spec:69-85、e2e:144-200                            | —                                                     |
| USER 从有效业务页尝试管理     | 取消导航（return false），保留来源页                          | guards.spec（`{name:'library'}` 分支）                                          | —                                                     |
| ADMIN                         | 进入，全部省略 status/单态传值                                | tracks.spec:22-76、e2e:47-142                                                   | —                                                     |
| 页内角色变 USER               | queryRef=null、隐藏入口、旧请求取消                           | view.spec:145-158、useTrackList.spec:103-134                                    | USER 会话 + 管理读取同时成立（query 强制 null）不可达 |
| API 403                       | 权限反馈+返回曲库，会话保留                                   | view.spec:145-152、e2e:202-224                                                  | —                                                     |
| 当前会话 401                  | 统一清理回登录                                                | e2e:350-359                                                                     | —                                                     |
| 旧会话迟到 401/响应           | 忽略，新会话不受影响                                          | useTrackList.spec:103-134,195-208、e2e:361-398                                  | —                                                     |
| 429 + q 非空                  | 冷却禁筛选/翻页/重试，清空 q 保留 status 可浏览，到期手动恢复 | useTrackList.spec:73-102,230-257、e2e:297-324                                   | 冷却中 q 非空自动重发（设计要求手动恢复）不可达       |

- 数据形态覆盖：形态 → 用例映射如上两表（tracks.spec.js、trackList.spec.js、useTrackList.spec.js、TrackManagementView.spec.js、TrackTable.spec.js、guards.spec.js、index.spec.js、LoginView.spec.js、e2e/track-management.spec.js）；未覆盖形态：page/size 回显不匹配的防御分支、totalPages 独立非法形态（与 totalElements 同一 `longString` 拒绝路径），均属服务端不会产生的防御校验，已在覆盖率缺口与文档中体现，不影响交付。

### 上轮反馈复核

不涉及（首次实质审核）。

### 阻断项（Blockers）

- 无。

### 非阻断项（Non-blocking）

- 无。核对中确认的一处设计/计划措辞差异不影响结论：设计 §5"合法越界空页…提供回到第一页"在实现中按人类已批准的计划任务 3 细化为"page>0 且总数>0 的空页提供专用『回到第一页』按钮"（TrackTable.vue:33-42,106-110），totalElements=0 的空页走空态文案并保留页码输入/上一页恢复路径；计划与功能文档均已如实登记该口径，视为已确认范围。

### 已通过检查

- 22 份变更与申报逐一吻合，人类契约输入未被改动也未被误判越界；提交信息与计划登记一致。
- 四项验证命令独立实测通过：npm ci 308/309、check 退出 0（lint 零警告）、Vitest 546/0/0/0、e2e 112/0/0（retries=0）；逐文件覆盖率 8 份业务源码全部达标且与申报数值完全一致。
- 重点行为逐项核实：曲库固定 `status=PUBLISHED`（含 query 混入 status 仍固定，tracks.spec:99-107）；管理全部省略 status、单状态严格传值且响应必须匹配（tracks.js:53-59）；Long 精度（最大 Long、科学计数等价表示、BigInt 时长）；USER 首次/登录角色拒绝回曲库、有效业务来源取消导航（guards.js:12-16）；queryRef 角色变化为 null（TrackManagementView.vue:27）；429 清空 q 保留 status（e2e:297-324）；真实已发布显式 mock（e2e:121-142）；1024px 侧栏宽度含曲库回归与序号单行断言（e2e:420-530）。
- 无 skip/only/todo、无快照掩盖、无秘密、无调试残留、无新增依赖、无协议/契约擅改。

### Codex 下一步

1. 本切片可合并（最终合并由人类决定）。收到 `accepted` 后停止本任务修改，等待人类指派下一切片（MGMT-02 起仍按各自设计/计划推进）。

### 重新审核重点 / 需人类决定

- 无。后续如将"零总数空页是否也提供专用回到第一页按钮"视为设计 §5 原意的独立要求，可由人类在 MGMT-02+ 顺带确认，不阻断本切片。

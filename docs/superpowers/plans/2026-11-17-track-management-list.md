# MGMT-01 管理员歌曲列表实施计划

> 面向执行 Agent。按人类审阅后确认的方式逐任务实施，可使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 对应工作流。执行环境缺少对应技能时，按仓库协议采用已获准的等价流程。步骤使用复选框追踪，开发任务的自验与辅助核对归入本切片材料，Claude 对完整切片进行独立审核。

**目标**为当前 ADMIN 身份交付真实歌曲管理侧栏与可浏览、筛选、搜索、排序、分页及恢复的管理员歌曲列表。

**架构**扩展现有歌曲 API 和查询工具提供管理读取入口，复用精确 Long 转换与列表请求生命周期。管理页组合现有 LibraryToolbar、TrackTable 和状态筛选控件，URL 保存已提交条件。真实路由消费已有业务框架，权限守卫补齐首次直达及登录回跳的恢复落点。

**技术栈**沿用 Vue 3、纯 JavaScript、Vite、Pinia、Vue Router、Axios、Element Plus、lossless-json、Vitest 与 Playwright。

**设计依据**为人类已审阅通过的 [MGMT-01 设计](../specs/2026-11-16-song-management-list-design.md)与[管理任务书](../../tasks/song-management.md)，执行者先读两者及[列表](../../api/track/list-tracks.md)、[封面](../../api/track/get-track-cover.md)契约。

## 全局约束

- 实施规划基线为 `main / a768dce6c8a28fa2777e97f9c4beab50456f194d`，Node `>=22.19.0 <23`、npm `>=10 <11`，采用 `.js` 与 `<script setup>`。
- 本切片为 `/admin/tracks` 的管理读取流程。批量导入、编辑、发布、归档与删除分别归 MGMT-02 至 MGMT-06，各真实入口随对应功能交付注册。
- 管理范围按全部或单状态查询，当前会话角色来自 auth store。全部省略 status，单状态为 DRAFT／PUBLISHED／ARCHIVED。
- 初始条件为 q 空、全部状态、page=0、size=20、sort=createdAt,desc。搜索原始值 1—100 Unicode 码点、1—5 词，size 1—100，page × size ≤ 10000。
- Long ID、时长及总数保留精度，原始 JSON 经已有无损解析后转成既有页模型。普通曲库的 PUBLISHED 范围有独立回归断言。
- 复用 sessionStorage、Token 与 revision 的会话归属规则、Element Plus 全量引入、原生 scoped CSS 和已有鉴权封面。
- 采用当前检出，保留原有人类列表契约更新和三份未跟踪收藏契约的归属。API、主题与视觉样例为只读依赖，提交按明确文件列表选择。
- 逐个新增或修改的业务逻辑文件核对完整文件行覆盖率至少 80%、分支至少 70%，零可执行分支单列适用性。
- 业务 HTTP 使用 mock，Playwright 固定 port 4173、workers=2、retries=0。使用真实 Teleport 目标，采用现有 defer 挂载方式。

## Review Focus

1. 管理全部／单状态与普通曲库的请求混用可能造成范围错误，两个入口分别约束请求与响应状态。归属任务 1。
2. 状态数组、null、空值与手工 URL 的 Unicode／深分页边界应进入可恢复错误，原曲库继续按其查询模型消费 status。归属任务 1、3。
3. 快速切换状态、同 Token 新会话及 429 清空查询时，旧响应不能覆盖当前状态，普通列表保留当前管理筛选。归属任务 2、3。
4. USER 首次直达或登录回跳管理页时安全进入曲库，从有效业务页尝试管理导航时保持原页，避免反复进入登录成功恢复流程。归属任务 4、5。
5. 管理的已发布查询会匹配认证测试的默认空页，新增侧栏还会改变已有 ADMIN 断言及可用宽度，需要真实路由、显式 mock 和窄屏检查。归属任务 4、5。

## 文件与接口地图

| 文件                                                                                               | 本次职责                                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/utils/trackList.js`、`src/utils/trackList.spec.js`                                            | 增加管理默认查询、状态选项、状态文案、管理解析与序列化，复用当前关键词／分页／排序规则 |
| `src/api/tracks.js`、`src/api/tracks.spec.js`                                                      | 增加管理读取入口，两个列表入口共用模块内请求和无损转换链，响应按本次范围校验           |
| `src/utils/errors.js`、`src/utils/errors.spec.js`                                                  | 增加本地管理查询错误文案                                                               |
| `src/composables/useTrackList.js`、`src/composables/useTrackList.spec.js`                          | 增加可选 fetchPage 注入，复用取消、乱序、会话和冷却逻辑                                |
| `src/components/library/TrackTable.vue`、`src/components/library/TrackTable.spec.js`               | 增加可选状态显示及空态文案，验证紧凑排版与既有分页                                     |
| `src/views/management/TrackManagementView.vue`、`src/views/management/TrackManagementView.spec.js` | 新建管理页面，编排 URL、状态选择、现有 Toolbar／Table、权限反馈与焦点                  |
| `src/router/index.js`、`src/router/index.spec.js`                                                  | 接入真实管理路由及侧栏元信息                                                           |
| `src/router/guards.js`、`src/router/guards.spec.js`                                                | 用来源路由区分角色拒绝的取消与曲库落点                                                 |
| `src/views/login/LoginView.spec.js`                                                                | 验证真实角色守卫下的 ADMIN／USER 登录回跳                                              |
| `e2e/library.spec.js`                                                                              | 更新 ADMIN 管理入口的关联断言，覆盖 USER 隐藏                                          |
| `e2e/track-management.spec.js`                                                                     | 新建管理主流程、权限、错误、资源与各尺寸检查                                           |
| `docs/features/track-management.md`                                                                | 本切片行为、字段与决策表、实际验证、逐文件覆盖率及送审材料                             |
| 本计划、管理任务书                                                                                 | 登记实际进度、失败修复与审核结论                                                       |

既有 LibraryToolbar、TrackCover、BusinessLayout 和 e2e/mockApi 按现有接口使用，其相关 spec 纳入回归命令。当前的 trackPage／trackPageText 足以组合管理 fixtures，测试内构造匹配 items 与统计的固定数据。

### 统一接口

- `ManagementQuery` 为 `{ q: string, page: number, size: number, sort: string, status?: string }`。status 缺省表示全部，三个有效值使用严格大写。状态选择控件的 ALL 只用于本地选项，提交查询时转换为 status 缺省。
- `DEFAULT_MANAGEMENT_QUERY` 取既有四字段默认值，`TRACK_STATUS_OPTIONS` 提供三个状态及“草稿／已发布／已归档”标签，`formatTrackStatus(value)` 返回标签，异常展示值返回“未知状态”。
- `parseManagementQuery(routeQuery) → { query, error }`，返回有效管理查询或本地 INVALID_MANAGEMENT_QUERY。`toManagementQuery(query) → 路由查询对象`，省略默认值及全部状态。
- `listManagementTracks(query, { signal } = {}) → Promise<TrackPage>`。TrackPage 沿用现有模型，id／durationMs／totalElements／totalPages 为精确十进制字符串，durationMs 可为 null。
- `useTrackList(queryRef, { fetchPage = listTracks } = {})` 返回现有 `{ page, pending, error, retryRemaining, retry }`。fetchPage 接受 `(query, { signal })` 并返回 TrackPage 的 Promise。
- TrackTable 增加 `showStatus: boolean = false`、`emptyText: string = ''`，原有 props 和 page-changed／retry／reset-page 事件继续服务两种页面。

## 任务 1 管理查询与精确 API 消费

**文件**修改 trackList、tracks、errors 及各自 spec，路径见文件地图。

**接口**产出统一接口中的管理查询、状态文案和 listManagementTracks，消费既有 parseLibraryQuery、toLibraryQuery、validateTrackSearch、HTTP、Long 私有解析及测试 factories。

- [ ] 核对 node --version、npm --version 与现有 API／查询测试可运行，依赖缺失时先 npm ci 恢复。环境阻断与新增功能红测分别记录。
- [ ] 在 tracks.spec 导入新 API、管理默认查询及现有 trackPage，再写全部状态红测，使用现有 respond 与 trackPageText。

```js
it('should_request_all_management_states_without_status', async () => {
  let request
  const items = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].map(
    (status, index) => trackPage({ id: String(index + 1), status }).items[0],
  )
  http.defaults.adapter = async (config) => {
    request = config
    return respond(trackPageText({ items, totalElements: '3' }), config)
  }
  const page = await listManagementTracks(DEFAULT_MANAGEMENT_QUERY)
  expect(request.params).toEqual({ page: 0, size: 20, sort: 'createdAt,desc' })
  expect(page.items.map((item) => item.status)).toEqual([
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED',
  ])
})
```

- [ ] 在 trackList.spec 写 `should_parse_and_serialize_management_status`，断言默认等于 DEFAULT_MANAGEMENT_QUERY，`{ status: 'DRAFT', q: ' 林间 ', page: '01' }` 往返保留 q 原值和 DRAFT，并将页码消费为 1。
- [ ] 执行 `npm run test:unit -- src/api/tracks.spec.js src/utils/trackList.spec.js src/utils/errors.spec.js`，预期新增导出缺失或断言失败，记录实际红测。
- [ ] 在 trackList.js 实现默认查询、三个状态选项、formatTrackStatus、parseManagementQuery 与 toManagementQuery。管理解析先复用原四字段规则，再消费 status。管理失败统一映射为“歌曲管理查询条件无效，请恢复默认条件。”。
- [ ] 在 trackList.spec 写状态标签参数化断言，三个状态返回对应中文，null、undefined 与未知值返回“未知状态”。
- [ ] 在 errors.spec 为 INVALID_MANAGEMENT_QUERY 写独立的精确文案断言，期望“歌曲管理查询条件无效，请恢复默认条件。”。
- [ ] 在 tracks.js 提取模块内私有 `fetchTrackPage(query, selectedStatus, { signal } = {})`，复用现有请求与转换链。listTracks 固定传 PUBLISHED，listManagementTracks 传管理 status。normalizeTrack 按三个合法状态与 selectedStatus 校验，selectedStatus 缺省接受三态。
- [ ] 增加 `should_keep_library_scope_published_when_query_contains_status`，传入额外 DRAFT 仍断言普通曲库请求 PUBLISHED。参数化管理三态请求、单状态响应越界、未知／null／缺失状态，全部查询接受三态混合页。
- [ ] 增加 `should_reject_invalid_management_status`，覆盖数组、null、空字符串、ALL、未知值与小写。复用并保留原曲库忽略 status 的断言，管理查询补 100／101 个补充平面字符、Unicode 空白、重复词、5／6 词、正号与前导零、100×100 及 101×100 边界。
- [ ] 管理 API 增加最大 Long ID、等价整数表示、合法 null、展示缺失降级、未知字段、合法空页及二进制封面相关回归。保留所有已有 API 断言。
- [ ] 复跑本任务三份 spec，确认全部通过，执行 lint 与本任务文件格式检查。
- [ ] 提交本任务相关文件，提交信息为“feat: 接入管理员歌曲列表查询”。

## 任务 2 复用列表生命周期与管理状态切换

**文件**修改 `src/composables/useTrackList.js` 及 spec。

**接口**消费任务 1 的 ManagementQuery／listManagementTracks 模型，产出带可选 fetchPage 的 useTrackList。测试辅助 `createFlow(initial = { ...DEFAULT_LIBRARY_QUERY }, options)` 将 options 传入 useTrackList。

- [ ] 写 `should_use_injected_management_loader`，为当前 ADMIN 会话提供 spy fetchPage，断言收到管理查询和 AbortSignal，返回 DRAFT 页后 page 正确，默认 listTracks spy 调用数为 0。
- [ ] 执行 `npm run test:unit -- src/composables/useTrackList.spec.js` 观察注入断言失败。
- [ ] 实现可选第二参数并用 fetchPage 执行请求，复用当前请求序号、取消信号、会话对象／revision、500ms 冷却时钟与作用域清理。
- [ ] 写 `should_ignore_late_management_status_result`，构造 DRAFT 请求晚于 ARCHIVED 完成，断言旧信号已取消，最终页属于 ARCHIVED。反向完成顺序时旧请求结束仍保留新请求的 pending。
- [ ] 写 `should_keep_management_status_when_clearing_limited_search`，429 Retry-After=2 后切状态且 q 非空时请求数不增加，清空 q 后请求携带当前 status，2 秒到期后等待手动操作。
- [ ] 增加同 Token 新会话、换会话、queryRef=null、卸载及重复刷新的管理注入场景，断言旧结果失效、资源释放与真实错误反馈。同 Token 新会话用例 mock 认证 API 后经 auth store 的 authenticate 建立会话，业务认证请求保持 mock。
- [ ] 运行 composable 全部用例及原 API／TrackCover／HTTP／main 关联回归，确认当前默认调用与管理注入均通过。
- [ ] 提交“feat: 支持管理列表读取与会话保护”。

## 任务 3 组合管理页面与状态展示

**文件**新增 `src/views/management/TrackManagementView.vue` 与 spec，修改 TrackTable.vue 及 spec。

**接口**页面消费 parseManagementQuery、toManagementQuery、DEFAULT_MANAGEMENT_QUERY、TRACK_STATUS_OPTIONS，调用 `useTrackList(queryRef, { fetchPage: listManagementTracks })`。状态筛选使用 Element Plus，搜索、排序、页大小使用现有 LibraryToolbar，歌曲与分页使用扩展 TrackTable。

- [ ] 在 TrackTable.spec 写状态红测，复用现有 table helper。

```js
it('should_show_management_status_when_requested', async () => {
  const wrapper = table({
    showStatus: true,
    page: trackPage({ status: 'DRAFT' }),
  })
  await flushPromises()
  expect(wrapper.text()).toContain('草稿')
})
```

- [ ] 新页面 spec 写 `should_submit_status_and_reset_page`，初始 `/admin/tracks?page=2`，选择“已归档”后断言路由查询为 `{ status: 'ARCHIVED' }`，传入 composable 的查询 page=0、status=ARCHIVED。
- [ ] 执行新增页面与 TrackTable spec，记录缺失组件或状态断言的实际红测。
- [ ] 实现 TrackTable 的 showStatus／emptyText。宽屏增加状态列，紧凑模式将状态放歌曲信息单元格，保留完整文本。全部无歌曲为“暂无歌曲”，单状态为“当前状态暂无歌曲”，搜索无结果与合法空页沿用已有优先级。
- [ ] 将表格紧凑信息断点设为 1100px，手机细节仍按现有 720px 样式，验证新增侧栏后的中等宽度。状态展示由 showStatus 控制，使用有明确文字的浅绿／墨绿语义样式。
- [ ] 实现管理页标题、统计、状态选择与现有查询组件。状态使用 aria-label 为“歌曲状态”的 Element Plus RadioGroup，change 事件将本地 ALL 转换为 status 缺省。已提交 q 非空且冷却大于 0 时禁用状态选择，搜索草稿仍可编辑和清空。状态、关键词、排序与页大小变化回第 1 页，五个字段共同判断相同查询刷新。
- [ ] 实现路由参数恢复、查询错误与导航失败反馈。当前会话满足 ADMIN 时给 composable 有效 queryRef，角色变化时传 null 并隐藏管理资料。角色拒绝或 API 403 时显示安全反馈与真实曲库入口。
- [ ] 页面测试创建真实 #business-search 目标并 attachTo document.body，清理目标，采用真实 Teleport。断言初始标题焦点、异步结果后焦点、三态标签、URL 往返、清空保留状态、非法查询恢复、403、换角色与导航抛错。
- [ ] 表格测试覆盖 showStatus=false 的既有列、三个状态标签、紧凑状态与时长、空文案、搜索和空页优先级。总数为 0 时使用全部／单状态／搜索空文案，page>0 且仍有匹配歌曲的空页提供专用回到第一页，均保留请求页和统计。原分页／资源／长文本断言纳入回归。
- [ ] 执行 `npm run test:unit -- src/views/management/TrackManagementView.spec.js src/components/library/TrackTable.spec.js src/components/library/LibraryToolbar.spec.js src/views/library/LibraryView.spec.js`，通过后提交“feat: 实现管理员歌曲列表与状态筛选”。

## 任务 4 真实管理路由、侧栏和角色恢复

**文件**修改 router/index、guards 及各自 spec、LoginView.spec.js、e2e/library.spec.js。

**接口**真实路由 `/admin/tracks`，名称 track-management，组件懒加载，以子路径 `admin/tracks` 接入 BusinessLayout 的 children。meta 显式声明 requiresAuth=true、roles=['ADMIN']、navigation={section:'sidebar',label:'歌曲管理',order:20}。角色守卫接受 `(to, from)`，普通拒绝返回 false，首次导航或来源为 login 的角色拒绝返回 `{ name: 'library' }`。

- [ ] 在 guards.spec 写首次导航红测，复用 authentication，使用 Vue Router 的 START_LOCATION。

```js
it('should_recover_initial_wrong_role_to_library', () => {
  vi.spyOn(ElMessage, 'error').mockImplementation(() => {})
  const guard = createAuthGuard({
    isAuthenticated: true,
    session: authentication('USER'),
  })
  expect(
    guard({ meta: { requiresAuth: true, roles: ['ADMIN'] } }, START_LOCATION),
  ).toEqual({ name: 'library' })
})
```

- [ ] 在真实 router spec 增加 ADMIN 进入管理、USER 初次直达恢复曲库、匿名带 redirect 进入登录的断言。执行 router 两份 spec，记录路由缺失及旧拒绝行为的红测。
- [ ] 在 BusinessLayout 的受保护 children 中接入真实管理路由，导航元信息放在可实际进入的管理路由记录上，使用现有布局生成侧栏与手机抽屉。
- [ ] 扩展角色守卫来源判断，from.matched 为空或 from.name 为 login 时使用曲库落点。已有有效业务来源保持取消导航及无权限提示，原直接调用 guard(to) 的拒绝语义有回归覆盖。
- [ ] LoginView.spec 加入管理目标及真实 createAuthGuard，测试 ADMIN 登录回跳到管理，USER 登录回跳进入曲库并保留会话。原安全 redirect、普通守卫拒绝、抛错恢复与认证方式断言完整运行。
- [ ] 真实路由测试挂载业务框架，mock 列表读取，断言 ADMIN 管理链接可见、USER 隐藏、手机抽屉导航后关闭，普通曲库入口仍真实可用。
- [ ] 将已有 library e2e 的 ADMIN 管理链接数量 0 断言改为可见，补 USER 隐藏断言。保留原 Long、封面、null 与请求参数断言。
- [ ] 执行路由、LoginView、useLogin、BusinessLayout、LibraryView、main 的定向单测与原 library／login e2e，确认导航和认证关联回归通过。
- [ ] 提交“feat: 接入管理员侧栏与权限恢复”。

## 任务 5 主流程、完整验证和审核材料

**文件**新增 `e2e/track-management.spec.js`、`docs/features/track-management.md`，更新本计划与管理任务书的实际状态。

**接口**浏览器使用真实页面和既有 mockApi。管理用例固定 `defaultLibraryPage: false`，handler 按 method／path／查询明确响应业务请求，使用现有 trackPage／trackPageText 生成原始 Long 数字。

- [ ] 写管理主流程，mock 认证先返回角色选择再返回 ADMIN，完成登录→曲库→歌曲管理→全部→单状态→搜索→排序→翻页→刷新／历史。断言全部请求省略 status、单态严格传值、q 保留首尾空白、Bearer 头与可见数据一致。
- [ ] 写 `should_render_published_management_results_from_explicit_mock`，在管理页选择 PUBLISHED、page=0、size=20、createdAt,desc、空 q 时提供明确非空页，断言已发布歌曲可见及 handler 确实收到请求。
- [ ] 写权限浏览器用例，覆盖 USER 直达、ADMIN 选择 USER 身份后的回跳、API 403 及返回曲库。显式响应曲库 PUBLISHED 请求，断言角色拒绝后管理资料和管理范围读取均未出现。
- [ ] 补合法 null、最大 Long ID 的鉴权封面及精确统计、合法空页、429 保留状态清空、网络／503 重试、当前与旧会话 401。旧响应到达拦截器的保护同时引用现有 HTTP adapter 回归。
- [ ] 在 1366×768、1440×900、1920×1080、320×740、390×844 检查管理列表和真实侧栏，增加 1024px 下 ADMIN 管理页与普通曲库带侧栏的检查。断言状态、时长、长文本、搜索错误与分页可达，文档／主区／表格内部无横向溢出，人工查看代表截图。
- [ ] 执行 `npm run test:e2e -- e2e/track-management.spec.js`，修复确认成立的问题并重跑，记录每次实际失败与最终结果。
- [ ] 核对浏览器环境，缺失时执行 `npx playwright install chromium`，测试运行器未启动用例记为未执行／环境阻断。
- [ ] 顺序执行 `npm ci`、`npm run check`、`npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html`、`npm run test:e2e`，记录各命令真实退出状态、通过／失败／跳过／todo／重试与 flaky。浏览器缺失时执行 `npx playwright install chromium` 并重新验证。
- [ ] 从 json-summary 逐文件核对 tracks.js、trackList.js、errors.js、useTrackList.js、TrackTable.vue、TrackManagementView.vue、guards.js 的完整文件覆盖率，router/index.js 的声明与零分支适用性单列，保留真实路由证据。
- [ ] 完成功能文档，包含边界、接口引用、角色矩阵、字段缺失／null／边界／非法类型、请求与响应判断依据、状态恢复、真实测试结果、逐文件覆盖率、视觉检查、真实后端与其他浏览器的验证状态及完整变更清单。
- [ ] 检查三个文档状态及直接链接，逐文件核对工作区归属，提交“docs: 补齐管理员歌曲列表验证材料”。
- [ ] 按 AGENTS.md 提交完整切片审核，记录基线、实际提交区间、运行器版本与模型、轮次及验证前后 Git 状态。审核命令的运行能力沿已有授权配置，开始检查实现正确性即计实质轮次，同任务最多三轮。
- [ ] 按稳定问题编号复核事实、分级与方向，修复确认成立的阻断或举证请求复核，重新验证。accepted 后归档实际结论，等待人类指派下一切片。

## 计划自检与执行交接

- 设计第 1—3 节对应任务 1、4、5，布局与查询对应任务 1、3、5，单元职责与字段消费对应任务 1、2、3，状态恢复与验证对应全部任务。
- 五项 Review Focus 均有归属任务及具体验收断言，管理全部与单状态、普通曲库、首次角色拒绝、真实 mock 及侧栏尺寸均有明确回归。
- 接口名称、status 缺省、回调签名、返回页模型、props 与事件在任务间一致。代码步骤给出决定与边界，方法体由实施者按测试完成。
- 当前交付为计划文档，开发步骤均待执行。计划文件采用链接、格式、契约与范围检查，业务测试结果由实际实施记录。
- 请人类审阅本计划并确认执行方式，推荐当前会话原生实现，因为各任务共享既有 API、查询和表格接口，适合连续完成后对完整切片做独立审核。

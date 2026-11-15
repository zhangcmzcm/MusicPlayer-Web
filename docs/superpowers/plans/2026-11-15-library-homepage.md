# LIB-01 曲库主页实施计划

> 面向执行 Agent。按人类确认的执行方式逐项完成复选步骤，Codex 负责实现，Claude 按仓库协议独立审核。人类已批准当前会话实现，由 Codex 编写并完成验证。

**目标**为已认证用户交付可浏览、搜索、排序和分页的统一已发布曲库，并接入站点主页及登录默认落点。

**架构**采用受保护的业务布局承载顶部导航、搜索入口和页面内容。API 模块消费歌曲与鉴权封面，页面私有查询及异步状态进入 composable，展示组件使用 props 和事件协作。当前可用路由决定导航内容，播放、收藏和账户功能沿任务书各自接入。

**技术栈**沿用 Vue 3、纯 JavaScript、Vite、Vue Router、Pinia、Axios、Element Plus、Vitest 和 Playwright。

**设计依据**为[曲库样式设计](../specs/2026-11-15-library-style-design.md)、[曲库任务书](../../tasks/library-homepage.md)及[列表契约](../../api/track/list-tracks.md)、[封面契约](../../api/track/get-track-cover.md)。

## 全局约束

- 基线为 `main / 9714ed4`。列表契约的搜索更新和收藏契约来自当前工作区，实施前核对有效版本与文件归属。
- 使用 Node `>=22.19.0 <23`、npm `>=10 <11`，源码采用 `.js` 和 `<script setup>`。
- 沿用 sessionStorage、Element Plus 全量引入、原生 scoped CSS 和既有会话守卫。
- 统一主页始终请求 `status=PUBLISHED`。管理能力仅属于本次 `ADMIN` 登录身份，菜单与路由消费现有会话的 `auth.session.user.role`。
- 导航从已交付路由的元信息生成。歌曲管理路由接入时同时声明 `requiresAuth`、`roles: ['ADMIN']` 和导航元信息，复用现有角色守卫。
- 普通 HTTP 经现有 `http` 实例，封面通过携带 Authorization 的已知业务接口获取。封面请求地址由歌曲 ID 构造。
- 每个改动业务逻辑文件核对完整文件行覆盖率至少 80%、分支覆盖率至少 70%。验证、状态矩阵和审核材料遵守 AGENTS.md。
- PLAY-01 负责底部播放与全屏展开，PLAY-02 负责队列及模式，PLAY-03 负责歌词，FAV 与 AUTH、MGMT 任务各自承接对应功能。LIB-01 的可用导航和控件随当前交付能力呈现。

## 供审阅的本切片交互决定

已确认的样式决定直接复用。以下具体交互作为本计划的实施方案供人类审阅。

| 项目           | 实施方案                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| 入口           | 站点 `/` 为受保护的 `library` 路由，匿名访问先登录，登录成功优先安全回跳，默认进入曲库                    |
| 查询状态       | URL 保存 `q`、`page`、`size`、`sort`，浏览器前进、后退和刷新恢复已提交条件                                |
| 搜索触发       | Enter 或搜索按钮提交，清空关键词恢复普通列表，输入过程保留为表单草稿                                      |
| 相同查询       | 再次提交相同条件为手动刷新，当前相同请求 pending 时合并重复操作                                           |
| 初始查询       | `page=0`、`size=20`、`sort=createdAt,desc`，排序文案为“最近加入”                                          |
| 排序与页大小   | 排序支持契约中的四字段与双方向，页大小接受 1—100，改变排序、页大小或关键词后从第 1 页读取                 |
| 分页           | 使用 Element Plus 的上一页、下一页和页码输入，显示真实总数与总页数，页码输入受 `page × size ≤ 10000` 约束 |
| 合法空页       | 保留请求页与真实统计，显示“当前页暂无歌曲”和“回到第一页”操作                                              |
| 无真实侧栏菜单 | 内容区使用可用宽度，手机菜单入口随实际侧栏内容呈现                                                        |
| 搜索限流       | 使用服务端 Retry-After 倒计时恢复手动搜索，普通列表清空操作可用                                           |

## Review Focus

1. 超过 JavaScript 安全整数范围的歌曲 ID、时长和统计数保持精度，封面请求使用准确 ID。归属任务 1。
2. 补充平面字符、Unicode 空白、首尾空白和重复词按契约计数，搜索限流期间清空查询仍可浏览。归属任务 1、2。
3. 快速查询、卸载、换会话和相同 Token 的新 revision 下，旧结果及旧 401 按会话归属处理，旧 Blob URL 及时释放。归属任务 2。
4. 深分页边界和并发删除后的合法空页保持真实统计及可恢复操作。归属任务 1、3。
5. 图片的二进制错误响应与无正文 401 正确转换，登录三种方式和身份选择在默认落点改变后继续完成。归属任务 1、2、4、5。

## 文件与接口地图

| 文件                                                           | 职责与输出                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/tracks.js` 及 spec                                    | `listTracks(query, { signal } = {}) → Promise<TrackPage>`，`getTrackCover(trackId, { signal } = {}) → Promise<Blob>`                                                   |
| `src/utils/trackList.js` 及 spec                               | `validateTrackSearch(raw) → string \| null`，`parseLibraryQuery(routeQuery) → { query, error }`，`toLibraryQuery(query) → 路由查询对象`，`formatDuration(ms) → string` |
| `src/composables/useTrackList.js` 及 spec                      | `useTrackList(queryRef) → { page, pending, error, retryRemaining, retry }`，返回值除 retry 外均为 ref／computed                                                        |
| `src/components/library/TrackCover.vue` 及 spec                | 资源组件，接收 `trackId: string`、`enabled: boolean`、`alt: string`，负责鉴权读取、缺省图及资源生命周期                                                                |
| `src/components/library/LibraryToolbar.vue` 及 spec            | 搜索、排序和页大小，消费 `query`、`pending`、`retryRemaining`，发出 `search-submitted(raw)`、`sort-changed(sort)`、`size-changed(size)`                                |
| `src/components/library/TrackTable.vue` 及 spec                | 消费 `page`、`query`、`pending`、`error`，展示歌曲和分页，发出 `page-changed(zeroBasedPage)`、`retry`、`reset-page`                                                    |
| `src/components/layout/BusinessLayout.vue` 及 spec             | 实际路由导航、手机侧栏与主页面 RouterView，消费当前会话角色和路由元信息                                                                                                |
| `src/views/library/LibraryView.vue` 及 spec                    | 编排 URL 查询、表单事件、列表状态和标题焦点                                                                                                                            |
| `src/api/http.js`、`src/main.js` 及 spec                       | 为现有 401 处理接入 auth store 的会话 revision                                                                                                                         |
| `src/router/index.js`、`src/views/login/LoginView.vue` 及 spec | 真实曲库路由及登录默认导航，保留认证场景的两个表单子路由                                                                                                               |
| `src/utils/redirect.spec.js`、`src/router/guards.spec.js`      | 更新根地址成为真实受保护业务路由后的回跳与匿名断言                                                                                                                     |
| `src/test/factories.js`                                        | 增加被 API、composable 和 e2e 消费的 `trackPage(overrides = {})`、`trackPageText(overrides = {})` fixtures                                                             |
| `e2e/fixtures.js`、`e2e/login.spec.js`、`e2e/library.spec.js`  | 原始 JSON／图片 mock、登录关联回归与曲库完整流程                                                                                                                       |
| `package.json`、`package-lock.json`                            | 在实施阶段锁定必要的无损 JSON 解析依赖                                                                                                                                 |
| `docs/features/library.md`、本计划、曲库任务书                 | 实际交付、测试与覆盖率、自检及审核记录                                                                                                                                 |

`LibraryQuery` 固定为 `{ q: string, page: number, size: number, sort: string }`。parseLibraryQuery 返回 `{ query: LibraryQuery | null, error: ApiError | null }`，路由参数错误使用本地 `INVALID_LIBRARY_QUERY`，文案为“曲库查询条件无效，请恢复默认条件。”。`queryRef` 在路由参数错误时取 null，错误由页面展示。

`TrackPage` 保留协议字段，`id`、`durationMs`、`totalElements`、`totalPages` 在业务模型中使用精确十进制字符串，durationMs 也可为 null。page、size 使用安全整数，hasNext 使用 boolean。`Track` 的 title、artistName、albumName、status、cover 按下表消费。

### 数字解析依赖

计划使用 `lossless-json@4.3.3` 处理原始 JSON 中的 Long，安装命令为 `npm install --save-exact lossless-json@4.3.3`。该依赖用于曲库响应消费，API 适配器完成领域转换。其发布版本和字符串保留式数字解析能力已核对作者资料。[版本记录](https://github.com/josdejong/lossless-json/releases/tag/v4.3.3)与[作者说明](https://github.com/josdejong/lossless-json)

`tracks.js` 对该请求覆盖 Axios 的响应转换，原始文本先经 `parse`，错误 JSON 在公共错误拦截前也获得可读 code。私有 Long 转换使用 `splitNumber` 的符号、有效数字和指数恢复精确整数，检查整数性和对应 Long 范围后输出十进制字符串。指数形式与等价的小数形式同样测试，转换前核对范围以约束展开长度。[数字拆分接口](https://raw.githubusercontent.com/josdejong/lossless-json/v4.3.3/src/utils.ts)

### 字段消费与校验依据

| 字段／条件                   | 消费策略与边界                                                                                    | 依据                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| 请求 q                       | 空字符串省略；非空原样计 1—100 码点，以 Unicode White_Space 拆成 1—5 词，保留首尾空白与重复词计数 | 列表契约查询参数、关键词匹配     |
| page、size、sort             | page 非负、size 1—100、乘积至 10000，单一合法字段与 asc／desc                                     | 列表契约查询参数                 |
| URL 数组或非法值             | 显示客户端查询错误并提供恢复默认操作，使用支持字段形成业务请求                                    | 客户端导航与恢复规则             |
| id                           | 完整正整数 Long，关键 ID 异常时返回本地 INVALID_RESPONSE                                          | 列表字段、封面路径与资源操作安全 |
| title、artistName、albumName | 合法字符串按原值展示，空值用展示文案。albumName 的 null 合法，缺失或非法展示类型作安全降级        | 列表成功响应、客户端展示恢复     |
| durationMs                   | 接受合法 Long 与 null，精确格式化为分钟与秒，缺失或非法形态显示未知时长                           | 列表字段、客户端展示恢复         |
| cover                        | null 显示缺省封面。有封面时按歌曲 ID 请求已知封面地址，图片缺失或解码失败安全回退                 | 封面契约、客户端资源生命周期     |
| status                       | 本次请求 PUBLISHED，响应应处于对应查询范围，异常范围按 INVALID_RESPONSE 反馈                      | 统一主页产品决定、列表授权筛选   |
| 分页元数据                   | 必需类型和非负范围正确，保留 Long 精度。合法越界空页按真实总数显示                                | 列表成功响应                     |
| 无关未知字段                 | 忽略新增字段，消费判断集中于当前用途                                                              | 项目响应消费规则                 |

## 任务 1 查询模型、精确 API 消费与图片错误转换

**文件**为新增 `src/api/tracks.js`、`src/utils/trackList.js` 及同目录 spec，修改 `src/test/factories.js`、`src/utils/errors.js` 及 spec、package 两文件。

**接口**采用文件地图的 listTracks、getTrackCover 和查询工具。fixtures 的 trackPage 返回标准业务模型，trackPageText 返回包含原始数值 token 的 JSON 文本，默认一首歌曲、page=0、size=20、总数与总页数为 1，覆盖参数可替换 id、可空字段和分页值。

- [x] 写失败用例，覆盖最大 Long ID 经真实 Axios adapter 的响应转换后保持完整，并保持 q 原样和 status 固定。

```js
it('should_preserve_long_ids_and_send_published_scope', async () => {
  let request
  http.defaults.adapter = async (config) => {
    request = config
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: trackPageText({ id: '9223372036854775807' }),
    }
  }
  const result = await listTracks({
    q: ' 周杰伦 晴天 ',
    page: 0,
    size: 20,
    sort: 'createdAt,desc',
  })
  expect(result.items[0].id).toBe('9223372036854775807')
  expect(request.params).toEqual({
    q: ' 周杰伦 晴天 ',
    page: 0,
    size: 20,
    sort: 'createdAt,desc',
    status: 'PUBLISHED',
  })
})
```

- [x] 用 `npm run test:unit -- src/api/tracks.spec.js src/utils/trackList.spec.js` 观察缺失模块或未满足断言的红测，记录实际失败。
- [x] 在同一任务补齐查询用例。100 个补充平面字符合法，101 个报长度错误，纯 Unicode 空白报关键词错误，5 词合法、6 词报词数错误，重复词计数。`100×100` 合法，`101×100` 和 `501×20` 报查询错误，空 q 形成普通列表。
- [x] 实现查询接口与 formatter。duration 为 null 显示 `--:--`，`245000` 显示 `4:05`，最大 Long 按精确整数除法格式化。日期字段仅参与排序。
- [x] 安装锁定依赖，实现原始文本转换及 Long 消费，覆盖最大 ID、等价指数／小数数值、非法关键 ID、合法 null、缺失展示字段、未知新增字段、空页与超大统计值。
- [x] 实现 getTrackCover。成功读取 arraybuffer 后形成 Blob，二进制 ProblemDetail 先解码再交给公共错误处理。覆盖 JSON code、无正文 401、404、502、503、取消和中断，成功 MIME 支持 JPEG／PNG／WebP。短传输依浏览器读取失败处理，模拟中断后显示缺省封面。
- [x] 执行本任务两个定向 spec 及 `src/utils/errors.spec.js`，确认通过后提交该任务相关文件，提交信息采用“feat: 接入曲库查询与鉴权封面”。

## 任务 2 列表请求、会话边界和封面资源生命周期

**文件**为新增 `useTrackList.js`、`TrackCover.vue` 及同目录 spec，修改 `http.js`、`main.js` 及对应 spec。

**接口**中 useTrackList 消费任务 1 的 LibraryQuery、listTracks 与 TrackPage。retry 手动重发当前有效查询，retryRemaining 为有效搜索限流的剩余秒数。TrackCover 消费 getTrackCover，成功数据转换为 Object URL。

`configureAuth` 增加 `getSessionRevision` 回调并为已有调用提供 0 默认值，main 注入现有 `auth.getSessionRevision`。受保护请求记录 token 和 revision，当前 401 同时匹配两者才调用现有退出回调。

- [x] 写真实 adapter 的同 Token／新 revision 失败用例，继续保留公开 401、当前 401 和新 Token 的既有测试。

```js
it('should_preserve_new_revision_when_old_401_uses_same_token', async () => {
  const gate = deferred()
  let revision = 1
  const session = authentication()
  const onUnauthorized = vi.fn()
  configureAuth({
    getSession: () => session,
    getSessionRevision: () => revision,
    onUnauthorized,
  })
  http.defaults.adapter = vi.fn(async (config) => {
    await gate.promise
    throw { config, response: { status: 401, data: { code: 'TOKEN_REVOKED' } } }
  })
  const pending = http.get('/tracks').catch((error) => error)
  await vi.waitFor(() => expect(http.defaults.adapter).toHaveBeenCalled())
  revision = 2
  gate.resolve()
  expect((await pending).status).toBe(401)
  expect(onUnauthorized).not.toHaveBeenCalled()
})
```

- [x] 运行 `npm run test:unit -- src/api/http.spec.js`，观察该新增用例红测，再接入 revision 保护并复跑。
- [x] 为 useTrackList 编写失败用例，利用现有 deferred 和 effectScope 构造 A 查询迟到、B 查询先完成。断言最终 page 属于 B，卸载后取消、旧会话结果忽略，queryRef 为 null 时进入可恢复客户端状态。
- [x] 实现查询请求序号、AbortController 和作用域清理。会话更替时按当前会话重新读取。429 倒计时仅使用有效 Retry-After，结束后恢复手动重试，清空 q 可请求普通列表。覆盖网络错误、超时、503 和取消静默。
- [x] 为 TrackCover 写 Object URL 创建／释放用例。更换 ID、会话或卸载时取消旧读取，Object URL 只为当前有效响应创建，已创建的旧 URL 及时释放。无封面、对象 404、图片解码失败分别呈现缺省图。
- [x] 实现资源组件并运行 `npm run test:unit -- src/composables/useTrackList.spec.js src/components/library/TrackCover.spec.js src/api/http.spec.js src/main.spec.js`，通过后提交“feat: 完善曲库请求与封面生命周期”。

## 任务 3 曲库布局、导航与展示组件

**文件**为新增 BusinessLayout、LibraryToolbar、TrackTable、LibraryView 及同目录 spec。

**接口**由 LibraryView 将 URL 转成 queryRef，消费 useTrackList，再向 toolbar 和 table 传 props。表单和分页事件分别改变 URL 或显式刷新。BusinessLayout 从实际路由的 `meta.navigation = { section, label, order }` 构建导航，section 取 top／sidebar，角色依据 `meta.roles` 和当前会话。

- [x] 写表格失败用例，验证合法 null 的展示、当前页真实统计和深分页边界。

```js
it('should_recover_from_a_legal_empty_page', async () => {
  const wrapper = mount(TrackTable, {
    props: {
      page: trackPage({
        items: [],
        page: 2,
        totalElements: '1',
        totalPages: '1',
        hasNext: false,
      }),
      query: { q: '', page: 2, size: 20, sort: 'createdAt,desc' },
      pending: false,
      error: null,
    },
    global: { plugins: [ElementPlus] },
  })
  expect(wrapper.text()).toContain('当前页暂无歌曲')
  await wrapper.get('button[aria-label="回到第一页"]').trigger('click')
  expect(wrapper.emitted('reset-page')).toHaveLength(1)
})
```

- [x] 执行 `npm run test:unit -- src/components/library/TrackTable.spec.js` 观察红测，再实现 table 的加载、空、错误、重试与分页，显示精确总数。上一页在 page>0 时可用，下一页要求 hasNext 且 `(page+1)×size≤10000`。页码输入从 1 开始并转换为 0 基参数，上限为 `floor(10000/size)+1`，越界输入显示校验反馈。
- [x] toolbar 使用 Element Plus 表单验证原始 q，提供排序与页大小事件。覆盖 Enter、清空、相同查询刷新、限流恢复和 IME 输入期间提交控制，输入内容可以继续编辑。
- [x] 实现 LibraryView 的路由查询编排。搜索、排序和页大小提交回第 1 页，浏览器前后退恢复查询，非法导航参数呈现恢复默认入口。路由切换后设置页面标题焦点，异步数据到达时保留用户当前焦点。
- [x] 实现 BusinessLayout 的音乐入口与当前可用导航，消费实际路由元信息。隔离测试注册真实组件测试路由，分别断言 USER、ADMIN 的角色菜单，ADMIN 账户以 USER 身份的会话按 USER 菜单处理。
- [x] 复用确认稿的白色内容面、嫩叶绿层次、宋体标题、连续歌曲行和手机信息合并。桌面比例及手机侧栏依据实际菜单和可用内容布局，键盘焦点、抽屉关闭和减少动态具有明确样式。
- [x] 运行四个新增组件／页面 spec，通过后提交“feat: 实现曲库主页布局与查询交互”。

## 任务 4 真实路由、登录默认导航及关联回归

**文件**为修改 router/index.js、LoginView.vue、对应 spec、redirect.spec.js、guards.spec.js、main.spec.js、e2e/fixtures.js 与 e2e/login.spec.js。

**接口**在 `/` 增加受保护的 BusinessLayout 父路由和空子路径 `library`，复用既有 AuthScene 的 login、register 子路由。根地址由真实曲库子路由匹配，登录成功执行安全目标或 `{ name: 'library' }`。

- [x] 写真实 router 的匿名与已认证入口用例，保留认证、角色守卫与未知路由行为。

```js
it('should_open_library_after_authenticated_root_navigation', async () => {
  const auth = {
    isAuthenticated: true,
    session: authentication(),
    clearSession: vi.fn(),
  }
  const router = createAppRouter(auth)
  await router.push('/')
  expect(router.currentRoute.value.name).toBe('library')
  expect(router.currentRoute.value.meta.requiresAuth).toBe(true)
})
```

- [x] 执行 `npm run test:unit -- src/router/index.spec.js src/utils/redirect.spec.js src/router/guards.spec.js` 观察红测，完成根路由与安全根路径回跳断言。
- [x] LoginView 在登录完成后进入安全目标或曲库。导航失败时保留已建立的会话与真实“进入曲库”恢复操作，由新页面负责自己的焦点。为成功导航、守卫拒绝和导航抛错各补测试。
- [x] 复跑 LoginView.spec 与 useLogin.spec，保留认证流程内部 `flow.step=success`、敏感字段清理、注册／重置的登录预填和身份选择。
- [x] mockApi 扩展为 `mockApi(page, handler, { defaultLibraryPage = true } = {})`。认证测试在调用 handler 前，为精确匹配的默认曲库 GET 提供空页，避免既有 postDataJSON 处理器消费 GET。曲库 e2e 使用 false 和自定义响应。
- [x] mockApi 响应支持 `rawBody` 和 `contentType`，既有 body 仍经 JSON.stringify。默认空页仅匹配 GET、PUBLISHED、page=0、size=20、createdAt,desc 及空 q，其他请求继续由 handler 明确处理。
- [x] 登录 e2e 的成功可见结果调整为真实曲库标题与地址，身份断言核对当前会话。认证参数、公开接口 Bearer 边界、防重复、前导零和管理员 USER／ADMIN 身份行为继续保留。
- [x] main.spec 在应用启动前安装 adapter，显式 mock 新增的首页读取。运行本任务定向单元和 `npm run test:e2e -- e2e/login.spec.js e2e/registration.spec.js e2e/password-reset.spec.js`，通过后提交“feat: 接入曲库默认路由与登录落点”。

## 任务 5 主流程、完整验证和功能文档

**文件**为新增 `e2e/library.spec.js`、`docs/features/library.md`，更新本计划和曲库任务书的真实执行状态。

**接口**使用真实应用入口、任务 4 的 mockApi 选项、任务 1 fixtures 和当前 sessionStorage 会话格式，业务网络完全由 mock 控制。

- [x] 写曲库主流程，同文件 beforeEach 使用 mockApi 和下述 false 选项安装 login、tracks、cover 的独立响应。先完成登录，再搜索、排序和翻页，断言请求参数与用户可见歌曲变化。

```js
test('should_browse_search_and_restore_library_query', async ({ page }) => {
  // 本文件的 mock handler 为 login、tracks 和 cover 分别返回自建响应。
  await page.goto('/login')
  await fillPassword(page)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '曲库', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('textbox', { name: '搜索音乐', exact: true })
    .fill('林间')
  await page
    .getByRole('textbox', { name: '搜索音乐', exact: true })
    .press('Enter')
  await expect(page).toHaveURL(/q=/)
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('textbox', { name: '搜索音乐', exact: true }),
  ).toHaveValue('林间')
})
```

- [x] 在同文件明确设置 defaultLibraryPage=false 的 handler，逐项核对 Authorization、固定 PUBLISHED、原始 q、排序及分页参数。补充无封面、图片失败、空页、合法 null、429、网络失败重试、401 与旧会话迟到 401 用例。
- [x] 在 1366×768、1440×900、1920×1080、320×740、390×844 检查列表、长歌名、错误、分页和真实可用导航，查看代表截图并记录纵向滚动与键盘可达性。
- [x] 先运行 `npm run test:e2e -- e2e/library.spec.js`，再修复确认成立的问题并重跑，记录实际失败和修正。
- [x] 顺序执行 `npm ci`、`npm run check`、`npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html`、`npm run test:e2e`。必要浏览器安装使用 `npx playwright install chromium`。
- [x] 逐文件核对 API、工具、composable、资源／展示组件、布局、页面、http、main、LoginView 的完整文件覆盖率。router 的纯声明适用性单列并给出真实导航证据。
- [x] 功能文档记录权限、字段行为、导航与请求决策、合法 null、资源释放、依赖名称版本、真实命令和测试数量、覆盖率来源、视觉检查与未验证环境。
- [x] 检查 Git 文件归属和文档链接，提交“docs: 补齐曲库功能说明与验证材料”，按 AGENTS.md 模板提交该切片首次实现审核。各开发任务的局部检查与 Codex 自检作为提交材料，实质审核轮次按 Claude 对完整切片的审核计数。

## 计划自检与当前状态

- 本计划覆盖 LIB-01 和 AUTH-07 的默认落点，样式设计中的播放、队列、歌词与账户／管理功能由任务书对应编号承接。
- API、查询模型、fixtures、composable 和页面间的名称及返回字段按文件地图统一。新增源码均有同目录 spec。
- 五项 Review Focus 分别落入任务 1—5 的具体测试。整体错误处理继续消费稳定 code，图片错误在公共拦截前完成格式转换。
- `getSessionRevision` 的现有调用兼容性、相同 Token 的新会话保护、默认登录 GET 对既有 mock 的影响均有明确回归位置。
- 任务 1—5 的实现、文档与自验已完成，反馈处理与自验已完成，等待第 3 轮独立审核核实。

## 实际执行记录

- 人类以“开始吧”授权采用推荐的当前会话实现方式，实际代码基线为 cde4739，原 9714ed4 为样式设计提交。
- 任务 1 首次定向红测为两个模块缺失，2 个测试文件失败，测试用例尚未开始。
- 依赖安装在沙箱内遇到 registry DNS 的 ENOTFOUND，获准在沙箱外重试后成功，新增 lossless-json 4.3.3。安装审计报告 6 项中危，309 个包。
- 任务 1 首轮实现运行 72 条用例，71 通过、1 失败。畸形成功 JSON 在响应转换抛错时被公共层映射为网络错误，改为由领域响应校验产生 INVALID_RESPONSE。
- 定向复跑 72 通过、0 失败、0 跳过，npm run lint 退出 0、零警告。

- 任务 2 红测复现相同 Token 的新会话被旧 401 清理，22 条通过、1 条失败，两个新模块尚未创建。实现 revision 比较、请求取消和资源释放后，定向 46 条全部通过，lint 零警告。
- 任务 3 首次红测为四个组件文件缺失，4 个测试文件失败，用例尚未开始。

- 任务 3 首轮 19 条用例为 12 通过、7 失败，并出现 Element Plus Select 的递归更新。定位为 VTU 全局 Teleport stub 反复销毁选项造成，测试改用真实 Teleport 目标。表单校验反馈使用等待断言。复跑 19 通过、0 失败、0 未处理错误，lint 零警告。

- 任务 4 路由红测 1 通过、2 失败，确认旧根地址仍进入登录。真实启动进一步发现 Teleport 目标与父布局同轮挂载的时序问题，使用 defer 修复。定向 96 条单测及认证关联 78 条 e2e 全部通过。
- 任务 5 曲库 e2e 首轮 14 通过、1 失败，排序输入框被组件文字覆盖导致定位超时，改用真实键盘操作后 15 通过。人工截图发现 320px 长歌名挤出时长，改固定表格布局并新增内部溢出断言，复跑 15 通过。
- 完整覆盖率初跑 471 通过，每个改动业务文件达到行 80%／分支 70%。npm run check 首轮在计划文件格式检查失败，统一格式后重新执行。

- 最终 npm ci 沙箱外按锁文件成功安装，Node v22.19.0／npm 10.9.3。npm run check 退出 0，lint 零警告、格式通过、471 条单测通过、生产构建成功。构建保留全量 Element Plus 下的既有大包提示。覆盖率复跑 471 通过，逐文件全部达标。完整 Playwright 93 通过、0 失败、0 跳过、0 重试／flaky／预期失败，新增曲库用例无未处理页面异常。
- 文档本地链接检查 57 个目标全部存在，初次完整实现审核材料位于 docs/reviews/2026-11-15-library-review-request.md。

- 审核计数按实际执行，第 1 轮已读业务源码后被 Codex 中断，第 2 轮完整静态报告原文位于 docs/reviews/2026-11-15-library-review-round-2.md，报告调用提示中的“第 1 轮”已在上下文纠正。结论 escalated，材料待填与运行器权限按 docs/reviews/2026-11-15-library-review-response.md 逐项复核。人类以“继续”恢复推进同一任务。
- 反馈处理后 npm ci、check、coverage、完整 e2e 均退出 0，484 单测、93 浏览器用例通过，无失败／跳过／todo／重试／flaky。API 非数字类型和带正号查询补 13 例，手机元数据补完整 title。第 3 轮恢复运行器必要验证能力，独立核实标准保持既有规则。

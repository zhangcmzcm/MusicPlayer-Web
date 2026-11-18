# MGMT-02 批量导入页实施计划

> 面向执行 Agent。使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 按任务实施，执行方式由人类审阅本计划时确认。对应技能缺失时按仓库协议采用已获准的等价流程。复选框记录实际进度，辅助核对属于自检，Claude 对完整 MGMT-02 切片独立审核。

**目标**为当前 ADMIN 身份交付 `/admin/tracks/import`，支持多文件入队、逐首导入、发送与处理反馈、同键恢复、离页暂停及会话清理。

**架构**导入 API 复用统一 HTTP 与共享 Long 解析，Pinia 持有原文件、幂等键和串行调度。页面组合文件选择与队列组件，使用现有查询工具保存返回条件，管理列表和业务框架提供真实入口及导航归属。

**技术栈**沿用 Vue 3、纯 JavaScript、Pinia、Vue Router、Axios、Element Plus、lossless-json、Vitest、Playwright。

**设计依据**为人类已通过的 [MGMT-02 设计](../specs/2026-11-18-track-batch-import-design.md)、[歌曲管理任务书](../../tasks/song-management.md)与只读[导入契约](../../api/track/import-track.md)。执行前读取三者及 AGENTS.md。

## 全局约束

- 计划基线为 `main / c1b4093162d635d421714e54a42cdff868ba2f16`。Node `>=22.19.0 <23`、npm `>=10 <11`，文件使用 `.js` 与 `<script setup>`。
- 本切片为批量导入及必要管理入口，编辑、发布、归档和删除分别归 MGMT-03 至 MGMT-06。
- POST `/api/v1/track-imports` 的 FormData 只有 uploadId 和单个 file，MP3／FLAC 最大 200 MiB，即 209715200 字节，请求局部 timeout=600000ms。
- 每项重试沿用原 File、文件名与 uploadId，201 与同键 200 均以 READY、响应关联和可用精确歌曲 ID 确认成功，元数据提示属于成功。
- 同时一个请求。运行／暂停可追加，未发送项可移除，站内离页完成当前项后暂停，返回手动继续，刷新关闭丢失当前内存批次。
- 413／415／422 失败后继续。400 与标识冲突暂停后可手动推进等待项，403／429 保留原项手动重试，结果未知与503保留原键核对，核对取得明确结果后手动继续。
- 当前 ADMIN 会话来自 auth，原会话／角色／revision 失配时终止旧调度，当前 401 沿用统一失效流程，403 保留当前会话。
- 沿用 Element Plus 全量引入、原生 scoped CSS 和已确认嫩叶绿。文件输入使用 Element Plus 按钮配合原生 input／拖放，选入后释放控件引用。
- 沿当前检出实施。人类已有的列表契约修改和三份收藏契约保留其归属，API、主题、样例与审核协议只读，Git 按明确文件列表提交。
- 每个新增或修改的业务逻辑源码完整文件行覆盖率至少80%、分支至少70%，零分支说明适用性。业务网络使用 mock，浏览器固定4173、workers=2、retries=0。

## Review Focus

1. 原始 JSON Long、合法空封面与非空提示的200重放，可能被错误响应校验转成待确认并重复导入。任务1固定字段消费与数据形态断言。
2. 运行时追加／移除或重试后的迟到进度，可能写错项目、重复计数或多发请求。任务2固定稳定项目与请求尝试归属。
3. 当前项未结束便离页、返回并追加，可能丢失结果或自动启动下一首。任务2、4、5固定暂停意图与跨页存活行为。
4. 同 Token 新会话、请求分发前换会话以及同对象 revision 失配，可能把旧文件发给新会话或留下忙碌状态。任务2用真实导入 API／HTTP 集成断言。
5. 文件控件重复选入和内部 File 引用、导航上下文与精确高亮，容易在真实页面往返后失效。任务3、4、5验证原生控件重置、五字段返回和手机抽屉。

## 文件与接口地图

下表每份业务文件的测试同目录，名称为同名 `*.spec.js`。例外和已有测试路径在对应任务中明确。

| 新增文件                                         | 职责                                   |
| ------------------------------------------------ | -------------------------------------- |
| `src/api/trackResponse.js`                       | 原有精确 JSON／Long 助手的最小共享模块 |
| `src/api/trackImports.js`                        | 单项导入传输与客户端结果模型           |
| `src/utils/trackImport.js`                       | 文件校验、体积、提示与进度转换         |
| `src/stores/trackImport.js`                      | 当前会话队列、串行调度及恢复           |
| `src/stores/trackImport.integration.spec.js`     | 真实API／HTTP与store之间的会话分发保护 |
| `src/components/management/ImportFilePicker.vue` | 多选、拖入和 File 输入清理             |
| `src/components/management/ImportQueue.vue`      | 队列、统计、进度、提示与操作           |
| `src/views/management/TrackImportView.vue`       | 导入页面、返回导航及离页暂停           |
| `e2e/track-import.spec.js`                       | 真实页面流程与multipart浏览器验证      |
| `docs/features/track-import.md`                  | 行为、契约依据、真实验证及审核材料     |

| 修改文件                                                | 职责                                   |
| ------------------------------------------------------- | -------------------------------------- |
| `src/api/tracks.js`                                     | 改为消费共享助手，保留列表／封面行为   |
| `src/api/tracks.spec.js`                                | 共享解析关联回归                       |
| `src/test/factories.js`                                 | 三种导入fixture，供API、store和e2e复用 |
| `src/utils/errors.js`、`src/utils/errors.spec.js`       | 集中导入错误文案                       |
| `src/utils/trackList.js`、`src/utils/trackList.spec.js` | 管理返回目标与草稿目标                 |
| `src/views/management/TrackManagementView.vue`及spec    | 真实上传入口                           |
| `src/components/layout/BusinessLayout.vue`及spec        | 统一管理高亮和返回上下文               |
| `src/router/index.js`及spec                             | 真实ADMIN导入路由                      |
| `src/views/login/LoginView.spec.js`                     | 导入安全回跳关联回归                   |
| 本计划、管理任务书                                      | 登记实施、验证和审核的实际状态         |

现有 HTTP、auth、守卫、管理列表、曲库和登录作为依赖执行回归。业务修改仅按发现的必要耦合进入本次清单。

### 统一模型与接口

- `trackResponse.js` 导出 `MAX_LONG`、`invalidResponse()`、`longString(value, minimum = 0n, maximum = MAX_LONG)`、`optionalLong(value)`、`parseTrackJson(data, headers, status)`，算法与当前 tracks.js 一致，MIN_LONG保持模块私有。
- `trackImport.js` 导出 `validateImportFile(file) → string|null`、`formatImportFileSize(bytes) → string`、`normalizeImportWarnings(value) → string[]`、`getImportProgress(event) → { percent: number|null, sent: boolean }`。
- `importTrack({ file, uploadId }, { signal, onProgress } = {}) → Promise<ImportResult>`。客户端 ImportResult 为 `{ uploadId, status: 'READY', importId: string|null, track: { id: string, title: string, artistName: string }, warnings: string[] }`，warnings为安全中文提示。
- fixtures 为 `importResponse(overrides = {})`（契约资料、数值字段在工厂内使用精确字符串）、`importResponseText(overrides = {})`（实际JSON数字token）和 `importResult(overrides = {})`（上述客户端结果模型）。三者默认歌曲ID为`'42'`，uploadId可显式覆盖。
- `useTrackImportStore()` 提供 `items`、`batchState`、`counts`、`active`、`blockerId`、`error`，动作 `addFiles(files)`、`removeItem(id)`、`start()`、`requestPause()`、`retryCurrent()`。会话清理为内部职责。
- ImportItem为`{ id, uploadId, file, fileName, size, state, progress, result, error, validationMessage, attempt }`。id为稳定客户端字符串，常规项与UUID一致，UUID生成失败使用稳定本地键并保留file；uploadId为实际请求UUID或未建立时的null。file为原File或结束释放后的null，attempt从0开始且仅在发送时递增。
- 文件state为`waiting / invalid / sending / processing / succeeded / failed / blocked / uncertain`。批次batchState为`idle / running / pausing / paused / completed`。counts按文件state统计`total、waiting、invalid、active、succeeded、failed、blocked、uncertain`。
- `managementReturnTarget(routeQuery, { drafts = false } = {}) → { name: 'track-management', query }`，放在现有trackList.js，复用管理解析／序列化。drafts=true时q清空、page=0、status=DRAFT，保留有效sort和size。

## 任务1 单项导入传输、精确解析与校验工具

**文件**新增trackResponse及spec、trackImports及spec、trackImport工具及spec；修改tracks及spec、errors及spec、factories，完整路径见文件地图。

**接口**产出统一模型中的共享解析、四个工具、importTrack和三个fixture。新spec建立与tracks.spec等价的局部`respond(data, config, headers = {}, status = 200)`及adapter恢复、configureAuth，认证用ADMIN fixture。

- [x] 核对Node/npm、package与依赖，依赖缺失时先恢复，记录真实环境状态。
- [x] 新增工具红测覆盖MP3／FLAC大小写、200MiB及加1字节、混合文件、0字节上限校验、空MIME与原名保留，内容有效性按后端结果反馈。使用小File并覆盖size属性模拟体积边界，文件内容验证用真实小File。
- [x] API spec写`should_send_one_file_with_import_budget`，importTrack尚未定义时按下面断言观察红测。

```js
const uploadId = '36bd81f4-2fa2-4d1c-a7c3-b6423690a3fa'
const file = new File(['audio-fixture'], 'song.mp3', { type: 'audio/mpeg' })
let request
http.defaults.adapter = async (config) => {
  request = config
  return respond(importResponseText({ uploadId }), config)
}
const result = await importTrack({ file, uploadId })
expect(request.url).toBe('/track-imports')
expect(request.timeout).toBe(600000)
expect([...request.data.keys()].sort()).toEqual(['file', 'uploadId'])
expect(request.data.get('file').name).toBe('song.mp3')
expect(result.track.id).toBe('42')
```

- [x] 执行`npm run test:unit -- src/api/trackImports.spec.js src/utils/trackImport.spec.js`，记录实际缺失模块／导出红测。
- [x] 提取trackResponse五个导出，tracks改为导入，原样保留Long范围、等价整数、非法JSON的成功／错误正文行为以及日志。共享模块spec直接覆盖其导出，原列表／封面回归继续执行。
- [x] 实现文件校验、体积格式化和提示转换。只按扩展名与209715200最大字节作本地文件规则，未知MIME原样保留。0B、1MiB显示`0 B`、`1.0 MiB`。九种提示按契约解释映射中文并去重，COVER_MISSING为“未找到内嵌封面。”，未知值为“另有导入提示，请核对歌曲信息。”，缺失或异常形态为“导入提示信息读取异常，请核对歌曲信息。”，空数组正常返回空列表。
- [x] 实现getImportProgress，仅用有效loaded与正total计算。缺少总量返回`{ percent: null, sent: false }`，实际未发完时整数百分比最高99，loaded达到total才给100与sent=true。测试999/1000、1000/1000、未知或异常总量。
- [x] 实现importTrack的FormData、signal、600000局部超时、进度回调与无损正文消费。仅200／201、READY、匹配uploadId和合法正Long track.id确认成功。importId异常降级null，歌名／艺术家降级沿原规则，warnings取规范化结果，cover与未用资产字段按用途消费。
- [x] API补200重放、最大Long及科学计数等价表示、cover=null与资产对象无url、非空提示、未知字段、缺失／null／非法关键字段、错误与信号用例。缺失与非法形态从最终小ID正文JSON.parse后delete或赋值再序列化，避免工厂回填默认值；Long边界直接使用原始数字正文。普通曲库保持PUBLISHED范围。FormData中File断言名称／类型／大小／内容，store层另断言原File引用。
- [x] errors增加IMPORT_CONFLICT、IMPORT_IN_PROGRESS、UPLOAD_TOO_LARGE、UNSUPPORTED_AUDIO_FORMAT、AUDIO_METADATA_INVALID、TRACK_IMPORT_RATE_LIMITED、MEDIA_IMPORT_STORE_UNAVAILABLE、MEDIA_OBJECT_CLEANUP_FAILED。逐码断言安全中文原因与恢复含义，保留已有VALIDATION_FAILED、403和媒体存储文案。IMPORT_IN_PROGRESS精确断言“歌曲仍在处理，请稍后重试核对结果。”。
- [x] adapter错误主动reject含config／response的对象，超时断言600000并模拟ECONNABORTED／ETIMEDOUT，取消用Signal或deferred。自定义adapter不会代办真实超时、HTTP状态判定或最终浏览器multipart头，浏览器头验证归任务5。
- [x] 运行`npm run test:unit -- src/api/trackResponse.spec.js src/api/trackImports.spec.js src/api/tracks.spec.js src/utils/trackImport.spec.js src/utils/errors.spec.js src/api/http.spec.js`，确认全部通过并记录实际数量。
- [x] 检查本任务文件格式与lint，修复本次相关问题。
- [x] 按本任务明确文件提交“feat: 接入歌曲导入传输与结果解析”。

## 任务2 会话内顺序队列、暂停与同键恢复

**文件**新增`src/stores/trackImport.js`、`src/stores/trackImport.spec.js`、`src/stores/trackImport.integration.spec.js`。

**接口**消费任务1的API、校验工具、ImportResult及auth，产出上述store模型。普通store spec mock importTrack和认证API，integration spec保留真实importTrack／HTTP并自建adapter。beforeEach建立新Pinia、ADMIN会话与确定的不同UUID序列，清理测试scope和HTTP配置。

- [x] 写`should_finish_the_current_item_before_pausing`红测，先addFiles两首、启动并暂停，首项deferred成功后断言只调用一次API、首项成功／File释放、次项waiting、batchState=paused。执行`npm run test:unit -- src/stores/trackImport.spec.js`并记录实际红测。

```js
const first = deferred()
importTrack.mockReturnValueOnce(first.promise)
const store = useTrackImportStore()
store.addFiles([new File(['a'], 'one.mp3'), new File(['b'], 'two.flac')])
const run = store.start()
await flushPromises()
store.requestPause()
first.resolve(importResult({ uploadId: importTrack.mock.calls[0][0].uploadId }))
await run
expect(importTrack).toHaveBeenCalledTimes(1)
expect(store.items.map((item) => item.state)).toEqual(['succeeded', 'waiting'])
expect(store.items[0].file).toBeNull()
expect(store.batchState).toBe('paused')
```

- [x] 实现addFiles，为每项建立稳定标识、原名与大小，逐项校验、保存有效原File并建立独立UUID。UUID失败保留File、稳定本地键和CLIENT_ERROR，等待手动恢复建立请求键。运行追加继续队尾，暂停追加保持暂停，完成后新增等待项回idle。
- [x] 实现removeItem，只移除attempt=0且尚未被当前请求持有的项，解除被移除的未发送阻断点。测试运行中移除下一项再追加，当前回包仍更新原项目，等待项选择以稳定标识进行。
- [x] 实现共用单项发送流程，持有原File、uploadId、请求尝试和AbortController；进度更新核对归属，sent后阶段保持processing，成功写结果并释放File。实现start的单一运行锁与按当前waiting项顺序推进，重复start合并或安全忽略。
- [x] 实现requestPause，活动请求继续，后续停止；无剩余待处理项且结果明确则completed。请求未结束便返回或追加仍保留pausing，手动start才恢复后续。
- [x] 按设计第6节区分文件失败继续、400／冲突暂停、403／429 blocked和其余未知结果uncertain。失败释放File，blocked／uncertain保留File与原键并设置blockerId；提示统计属于成功。401场景按真实HTTP回调清理会话的上下文验证。
- [x] 实现retryCurrent，只重试当前暂停点，保留原File／文件名／uploadId并增加尝试编号，保持单请求。得到成功或明确失败后保持paused，blocker解除后由start手动继续。UUID尚未建立时只补建该项键，重复重试和迟到进度不会多发或写错项。
- [x] 会话／角色使用同步watch清理，先使旧尝试失效再abort并释放引用。每次发送／进度／回包核对对象、角色、revision；revision单独变化后旧操作结束时同样清理运行状态。Pinia scope持有调度，页面卸载只请求暂停，store dispose执行资源清理。
- [x] 写`should_retry_the_original_file_and_upload_id_after_timeout`，首调TIMEOUT后断言uncertain、File保留、next未发送；手动retry返回同键200后成功只计一次，File释放、后续仍paused，start后才发下一首。捕获旧进度回调在新尝试中触发，断言新项进度与结果保持当前归属。
- [x] 参数化完整恢复表，断言413／415／422会继续，400／IMPORT_CONFLICT需要手动继续等待项，403／429先同键重试，IMPORT_IN_PROGRESS和三个503均uncertain。覆盖只含无效文件、空队列、全部完成后追加、成功非空warnings及所有File释放／保留分支。
- [x] integration spec写`should_abort_before_dispatch_when_the_session_changes`，用测试专属请求拦截器与deferred固定真实Axios的分发前时点，建立新会话后释放gate，断言旧signal取消且adapter未发送旧File，finally释放gate并eject。configureAuth读取真实auth.session／revision，当前401回调执行auth.clearSession。另测同Token新session、只变角色、当前401清理、旧401与迟到回包，以及session对象相同但revision变化后不会卡住active。
- [x] 运行`npm run test:unit -- src/stores/trackImport.spec.js src/stores/trackImport.integration.spec.js src/stores/auth.spec.js src/api/http.spec.js src/api/trackImports.spec.js`，确认全部通过并记录实际数量。
- [x] 按本任务明确文件提交“feat: 实现批量导入队列与会话恢复”。

## 任务3 文件选择与队列展示组件

**文件**新增`src/components/management/ImportFilePicker.vue`、`ImportQueue.vue`及各自spec。

**接口**FilePicker props为`disabled:boolean=false`，emit `files-selected(File[])`。Queue props为items、counts、batchState、active、blockerId、error，emit `start`、`pause-requested`、`retry-requested`、`item-removed(id)`、`drafts-requested`，完全通过props／emit工作。

- [x] Picker spec写`should_emit_selected_files_once_and_clear_the_native_input`，用DataTransfer建立两首File集合，经happy-dom的原生files setter赋入；先断言files有2项且value非空，触发change后断言只emit一次、集合顺序及原File身份正确、files为空且value清空。Queue spec写成功＋warnings红测，断言成功1、提示可展开且失败0。执行两份spec记录红测。
- [x] 实现原生`type=file multiple accept=".mp3,.flac"`输入，提供“选择音频文件”可访问名称和Element Plus“添加文件”按钮。复制File[]后emit并重置input.value；原生drop事件取全部文件交给store统一校验，键盘操作走同一选择入口，disabled同时阻断入口与迟到选择事件。
- [x] Picker补多选、混合有效／无效拖入、同文件再次选择、空选择不入队、disabled与原生引用清理断言。拖入的格式校验结果由store反馈，选择组件保持单次File集合事件。文件集合通过原生setter设置，保留value重置时释放files的真实行为。
- [x] 实现Queue的全部八种文件状态和五种批次状态文案，Element Plus展示进度／按钮，提示按安全字符串展开，文件行稳定key。按store的互斥统计展示各项，存在blocked时显示待重试；active或pausing期间防重复，attempt=0的未发送项可移除，blocked／uncertain提供重试当前项。
- [x] 按已确认A原型实现连续行、窄屏大小与状态合并、完整文件名和内存提示。队列操作栏在业务主区内以白底吸顶，窄屏按钮与长提示换行，内容纵向滚动。预览中的切换按钮和演示数据由测试fixtures承担，生产呈现真实props。成功结果存在时提供查看草稿。
- [x] Queue补不定量发送、100%后处理中、未知／读取异常提示、所有错误文案、暂停等待、全部完成、空态、各操作emit和键盘可达。File为null的已结束项继续显示名称、大小和结果。
- [x] 运行`npm run test:unit -- src/components/management/ImportFilePicker.spec.js src/components/management/ImportQueue.spec.js`，确认全部通过并记录实际数量。
- [x] 检查本任务文件格式与lint，修复本次相关问题。
- [x] 按本任务明确文件提交“feat: 实现批量导入文件选择与队列展示”。

## 任务4 真实页面、上传入口与管理导航

**文件**新增TrackImportView及spec；修改trackList及spec、TrackManagementView及spec、BusinessLayout及spec、router/index及spec、LoginView.spec，完整路径见地图。

**接口**产出managementReturnTarget、真实路由track-import。页面消费两个组件与store，onBeforeRouteLeave调用requestPause。管理入口传toManagementQuery(displayQuery)，路由meta为requiresAuth=true、roles=['ADMIN']、activeNavigation='track-management'。

- [x] trackList spec写以下目标红测，再写管理页“上传歌曲”携带五字段、真实路由存在与ADMIN元信息的红测，运行对应spec并记录导出／路由缺失。

```js
const query = {
  q: ' 林间 ',
  status: 'ARCHIVED',
  page: '2',
  size: '50',
  sort: 'title,asc',
}
expect(managementReturnTarget(query)).toEqual({
  name: 'track-management',
  query,
})
expect(managementReturnTarget(query, { drafts: true })).toEqual({
  name: 'track-management',
  query: { status: 'DRAFT', size: '50', sort: 'title,asc' },
})
expect(managementReturnTarget({ page: '-1' })).toEqual({
  name: 'track-management',
  query: {},
})
```

- [x] 实现managementReturnTarget，复用管理解析默认回退，drafts模式按接口约定覆盖四字段。扩展测试覆盖缺失、非法、原始关键词与合法整数规范化。
- [x] 以BusinessLayout子路径`admin/tracks/import`接入导入懒加载路由，管理页在当前ADMIN且可展示管理能力时提供上传按钮。扩展现有隔离路由测试，入口传已提交条件，非法来源回默认，USER隐藏。
- [x] BusinessLayout提取当前激活名称为`route.meta.activeNavigation || route.name`，侧栏／手机管理链接在导入页调用managementReturnTarget。高亮和aria-current对应同一真实管理菜单，普通曲库及顶部导航沿现有路由逻辑。布局spec的管理fixture使用真实名称track-management并新增归属它的导入fixture，补归属高亮、五字段链接、单一菜单项与手机选中关闭测试。
- [x] 实现TrackImportView，绑定addFiles／removeItem／start／requestPause／retryCurrent，标题挂载与路由切换聚焦，异步结果保留用户焦点。当前角色失去ADMIN时隐藏队列操作，返回按钮与查看草稿分别采用统一目标，导航失败提供安全反馈。
- [x] 页面spec使用真实Pinia和内存router。启动deferred后跳管理或曲库、返回导入再追加，断言旧store仍持有当前项、结束后暂停、返回不自动启动。覆盖直接进入、异常返回查询、侧栏／返回／草稿目标、焦点、无权限与导航拒绝／抛错。需要挂载原管理Toolbar的测试保留真实Teleport目标。
- [x] 真实路由／LoginView spec覆盖匿名完整redirect、ADMIN直达及登录回跳、USER首次与登录回跳进入曲库，以及有效业务来源的既有拒绝语义。
- [x] 运行`npm run test:unit -- src/utils/trackList.spec.js src/views/management/TrackImportView.spec.js src/views/management/TrackManagementView.spec.js src/components/layout/BusinessLayout.spec.js src/router/index.spec.js src/router/guards.spec.js src/views/login/LoginView.spec.js src/main.spec.js`，确认全部通过并记录实际数量。
- [x] 按本任务明确文件提交“feat: 接入批量导入页面与管理导航”。

## 任务5 浏览器流程、完整验证与审核材料

**文件**新增`e2e/track-import.spec.js`、`docs/features/track-import.md`，更新本计划与管理任务书。

**接口**浏览器使用真实页面与mockApi，固定`defaultLibraryPage:false`。handler明确处理GET列表、POST导入与需要的认证，FormData解析使用浏览器实际Content-Type及postDataBuffer，响应来自importResponseText。

- [x] 写管理员从带五字段的管理页进入、选择多个文件、手动开始、逐首结果与提示、追加、暂停、离页返回、手动继续、查看草稿的主流程。用实际按钮和键盘FileChooser选择文件，断言input的files已释放、Bearer、仅两个multipart字段、真实boundary、文件原名／类型／内容、不同新项UUID与单一在途请求。中间进度状态可用测试专属XHR progress事件经过真实onUploadProgress链路控制，响应保持mock。
- [x] 写`should_confirm_an_unknown_result_with_the_same_upload_id`，专属page.route在首项记录后abort，后续fallback给共用mock返回同键200与同歌曲ID。提取file part后比较重试字节和原名，断言成功统计一次、后续保持暂停直到手动继续。已发布默认空页mock维持关闭，恢复列表按真实参数响应。
- [x] 写本地格式／200MiB边界、413／415／422后下一项、限流／403与待确认恢复、当前401和同Token新会话旧请求用例。真实600000预算由API单测断言，浏览器用可重复网络中断验证未知结果恢复，区分各自证据。
- [x] 在1366×768、1440×900、1920×1080、1024×768、320×740、390×844检查空队列、长文件名、处理、错误、提示展开和主要操作可达，断言页面／主区／队列无横向溢出。人工查看代表截图，真实手机抽屉返回保留管理查询。
- [x] 执行`npm run test:e2e -- e2e/track-import.spec.js e2e/track-management.spec.js e2e/library.spec.js e2e/login.spec.js`，修复成立问题并重跑。浏览器缺失先`npx playwright install chromium`，运行器未启动记未执行／环境阻断。
- [x] 实际执行`npm ci`，记录退出结果，安装完成后再运行后续验证。
- [x] 实际执行`npm run check`，记录lint、格式、单测和构建的真实结果。
- [x] 实际执行`npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html`，记录通过／失败／跳过／todo与报告来源。
- [x] 实际执行`npm run test:e2e`，记录真实退出码、通过／失败／跳过／重试／flaky／预期失败。
- [x] 逐文件核对trackResponse.js、trackImports.js、tracks.js、trackImport工具与store、两个组件、TrackImportView、trackList.js、errors.js、BusinessLayout、TrackManagementView的完整覆盖率，router/index声明与零分支单列。测试和fixtures排除，任何未达阈值按协议处理。
- [x] 功能文档登记边界、真实入口、API引用、权限与状态表、字段／谓词依据、客户端结果模型、File与键保留／释放、验证数量和逐文件覆盖率、视觉证据、未执行联调／其他浏览器状态及完整变更清单。
- [x] 核对设计、计划、任务书的状态和链接，逐文件检查归属。
- [x] 提交“docs: 补齐批量导入功能与验证材料”。
- [ ] 提交完整MGMT-02给Claude独立审核，计数从本任务第1轮开始，最多3轮，记录实际运行器版本／模型、基线、提交区间和验证前后Git状态。
- [ ] 按稳定问题编号复核事实、分级与方向，修复成立阻断并验证后重提，按协议处理未解决争议。
- [ ] accepted后归档当前切片并等待人类下一项。

## 计划自检与执行交接

- 设计第1—4节对应任务1、3、4，第5—7节对应任务2及跨页页面测试，第8—9节对应任务1—4，第10—11节对应任务5和实际验证材料。
- 五项Review Focus均落实到所属任务的断言，原始Long、重放、关联、离页往返、同Token／revision、原生文件输入和导航均有明确验证入口。
- API、store、props／emit、状态名、工厂和返回目标在任务间使用统一模型。实现步骤给出接口、值与行为边界，方法体由执行者按测试完成。
- 人类已通过计划并指定当前会话主 Agent 实施。任务1—4已提交，任务5自验通过；669 条单测、133 条端到端、构建与逐文件覆盖率已核对，见功能文档。正式独立审核尚未开始，末尾审核与归档步骤保持待完成。
- 请人类审阅并确认执行方式。推荐当前会话由主Agent实施，各任务共享请求归属和队列模型，可连续验证后对完整切片做独立审核；也可选择子Agent分任务实施，逐任务辅助核对并在末尾提交完整审核。

## 实施记录

任务1提交 `9a6099b`，6 个定向测试文件 160 项通过；任务2提交 `ae8bb5d`，队列及真实 HTTP 集成 29 项通过；任务3提交 `29e6e84`，两组件 5 项通过；任务4提交 `d2cad00`，页面、导航、查询及登录相关 107 项通过。后续边界修正与完整自验见[功能文档](../../features/track-import.md)。代码由主 Agent 编写，两名辅助 Agent 仅做只读事实核对，非 Claude 正式审核。

# MGMT-01 管理员歌曲列表

## 目标、范围与入口

当前 ADMIN 身份从真实侧栏进入 `/admin/tracks`，浏览全部或单状态歌曲，使用顶部搜索、排序、页大小与分页，刷新和历史导航恢复已提交条件。路由名称为 `track-management`，懒加载于 BusinessLayout。普通曲库继续固定读取 PUBLISHED。

上传、草稿编辑、发布、归档和彻底删除依次归 MGMT-02 至 MGMT-06。当前页面提供管理读取，后续操作按各切片交付。草稿编辑的 version 读取契约由后端提供方补齐后接入。[管理任务书](../tasks/song-management.md)

## 契约与权限

| 请求                            | 用途                             | 依据                                        |
| ------------------------------- | -------------------------------- | ------------------------------------------- |
| GET `/api/v1/tracks`            | 全部或单状态管理列表、搜索与分页 | [列表契约](../api/track/list-tracks.md)     |
| GET `/api/v1/tracks/{id}/cover` | 当前 ADMIN 身份读取鉴权封面      | [封面契约](../api/track/get-track-cover.md) |

管理全部状态省略 status，单状态严格传 DRAFT、PUBLISHED 或 ARCHIVED。搜索非空时传原始 q，分页均有 page、size 和 sort。共享列表接口允许 USER 省略 status 读取已发布歌曲，客户端管理流程按已确认产品规则要求当前会话 ADMIN。

| 当前条件                       | 路由／读取行为                                         | 验证                               |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------- |
| 匿名或会话过期                 | 清理当前会话，进入登录并保存安全站内目标               | guards、真实路由与管理 e2e         |
| 当前 ADMIN                     | 显示侧栏，允许管理查询                                 | 路由挂载、页面与 e2e               |
| 当前 USER 首次直达或来自登录   | 无权限反馈后进入曲库，曲库请求 PUBLISHED               | guards、LoginView、管理 e2e        |
| 当前 USER 从有效业务页尝试管理 | 取消导航并保留来源页                                   | guards                             |
| 管理页内会话角色变成 USER      | queryRef 变为 null，隐藏管理数据和查询入口，旧请求取消 | 页面、composable                   |
| 业务接口 403                   | 显示权限反馈与返回曲库链接，保留会话                   | 页面与 e2e                         |
| 当前会话 401                   | 统一拦截器按 Token 与 revision 清理，回登录            | HTTP、main 与管理 e2e              |
| 旧会话迟到响应或取消           | 忽略旧结果，当前页面和会话保持当前归属                 | composable、HTTP adapter、管理 e2e |

权限依据为设计第 3 节与 AGENTS.md 第五节。后端负责实际授权，客户端按当前会话提供菜单与导航体验。

## 字段消费与判断依据

| 字段／判断                         | 合法形态与边界                                                          | 缺失、null、非法类型行为                                      | 依据与测试                                               |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| URL status                         | 缺省全部，或三个大写枚举                                                | 缺省接受，null、数组、空串、ALL、小写和未知值显示恢复默认条件 | 产品设计第 5、7 节、列表契约“查询参数”，trackList.spec   |
| q                                  | 默认空串，非空为 1—100 Unicode 码点与 1—5 个 Unicode 空白分词，原值传输 | 缺省为空，null／数组／空白词／超长／超词阻断并提供恢复        | 列表契约“查询参数”，trackList、Toolbar 与 e2e            |
| page／size                         | 默认 0／20，整数 page≥0，size 1—100，page×size≤10000，允许正号与前导零  | 缺省默认，null／数组／小数／越界进入查询恢复                  | 列表契约“查询参数”，trackList 与 TrackTable              |
| sort                               | createdAt、title、artistName、id 各 asc／desc                           | 缺省 createdAt,desc，非法字段、方向或数组拒绝                 | 列表契约“查询参数”，trackList                            |
| 响应 status                        | 全部范围允许三态混合，单状态须匹配选中状态                              | 缺失／null／未知枚举及单状态越界整体 INVALID_RESPONSE         | 契约三态与产品查询范围，tracks.spec                      |
| id                                 | 原始 JSON 正 Long，支持等价整数科学计数表示，最大 9223372036854775807   | 缺失／null／字符串／非整数／越界拒绝，转换为精确十进制字符串  | 列表与封面契约、资源请求安全，tracks.spec                |
| title／artistName                  | 字符串用于显示                                                          | 展示缺失、null、空或非法形态降级为未命名歌曲／未知艺术家      | 展示降级规则沿 LIB-01，tracks.spec                       |
| albumName／durationMs／cover       | 契约允许 null，时长精确字符串参与 BigInt 格式化，封面存在时鉴权加载     | 展示缺失和无关异常降级，专辑未标注、时长 --:--、叶形封面      | 契约“响应字段”及 LIB-01 降级，API／TrackCover／表格／e2e |
| page／size 回显                    | 必须与请求一致，页码为非负 int，size 1—100                              | 缺失／null／非法回显拒绝，避免错误页导航                      | 客户端分页一致性、契约响应，tracks.spec                  |
| totalElements／totalPages／hasNext | 非负 Long 精确字符串与布尔值，合法空页保留请求页和统计                  | 缺失／null／非法数值或类型拒绝                                | 契约统一分页，API／表格与 e2e                            |
| 未使用的新增响应字段               | 忽略                                                                    | 未参与当前操作的字段异常继续降级消费                          | AGENTS.md 第六节响应消费，tracks.spec                    |
| 当前请求归属                       | 请求序号、AbortSignal、会话对象和 revision 均匹配                       | queryRef 无效、卸载、换会话或旧响应时取消并忽略               | 客户端生命周期、useTrackList.spec                        |
| 搜索冷却                           | 429 的有效 Retry-After 使用已有拦截器解析                               | 缺失／非法等待信息沿既有安全反馈，手动恢复                    | 列表搜索限流契约、HTTP 与 composable                     |

响应元数据沿原无损 JSON 转换链。当前改动将该链用于管理读取，普通曲库固定范围的独立测试保留。封面地址按精确 id 构造，由同源业务 HTTP 附加 Token，返回 Blob 经既有 Object URL 生命周期显示。

## 查询、反馈与恢复

初始为全部状态、空搜索、page=0、size=20、createdAt,desc。URL 保存已提交条件，序列化省略默认值与全部状态。状态、关键词、排序、页大小变更均回第 1 页。五个字段均相同则手动刷新，pending 时合并重复刷新。搜索支持 Enter、按钮、清空与 IME 保护。

| 页面状态                           | 反馈与恢复                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------- |
| 加载                               | 显示正在读取曲库，旧数据清除，允许输入新条件                               |
| 全部范围无歌曲                     | 暂无歌曲，保留真实统计                                                     |
| 单状态无歌曲                       | 当前状态暂无歌曲，保留筛选                                                 |
| 搜索无结果                         | 没有找到相关歌曲，可更换或清空关键词                                       |
| page>0、总数>0 的合法空页          | 保留请求页、真实总数与总页数，提供回到第一页                               |
| URL 无效                           | 显示恢复默认条件，停止无效读取                                             |
| 搜索 429                           | 冷却限制关键词重试和筛选，清空 q 保留 status，可继续普通浏览，到期手动恢复 |
| 网络、超时、503                    | 显示集中安全文案并提供重试                                                 |
| 封面 404、502、503、传输或解码失败 | 既有叶形缺省图保留歌曲资料                                                 |
| 导航取消或抛错                     | 取消按来源导航语义处理，失败显示安全通用文案                               |

404、409 使用统一错误映射及重试路径，本切片的列表读取没有写入或状态流转冲突。封面 404 有专用降级回归。业务代码继续使用稳定 code，不消费原始 message／SQL／内部路径。

## 已确认视觉与交互

采用人类审阅通过的管理列表设计，复用嫩叶绿、白色连续列表、宋体标题、顶部搜索及真实侧栏／手机抽屉。状态使用全部、草稿、已发布、已归档四个 Element Plus 分段选项。状态文字区分三态，颜色提供辅助层次。新页面布局和权限恢复来自本切片确认。[管理设计](../superpowers/specs/2026-11-16-song-management-list-design.md)

TrackTable 紧凑断点为 1100px，手机细节继续使用 720px。紧凑信息在歌曲单元格中排列歌名、艺术家／专辑和状态，时长保留可见。页码与精确总数沿现有表格实现。页面挂载与查询导航后聚焦标题，异步数据到达保留用户焦点。序号采用单行紧凑间距，避免新增侧栏后的中等尺寸换行。

视觉参考为只读的 [主题](../design/theme.md)和 `example/index.html`。截图、构建和测试产物均在忽略目录中。

## 验证记录

实施前分批运行红测，查询／API／文案新增导出与文案缺失导致 35 失败、86 通过，注入生命周期红测 5 失败、11 通过，状态表格与缺失管理页红测 5 失败、5 通过，角色恢复与路由缺失红测 5 失败、18 通过。各阶段实现后相应定向测试通过。测试工厂默认值覆盖了显式 undefined 的初始用例，已改用移除原始 JSON 字段验证真实缺失。

定向验证已完成查询相关 121 条、生命周期及 API／封面／HTTP／main 104 条、管理页面与表格／Toolbar／曲库 27 条、权限与登录关联 101 条。原曲库与登录 e2e 66 条通过，管理 e2e 初次 19 条通过。截图检查发现 1024px 序号换行，已调整紧凑序号宽度与单行样式，并增加浏览器断言。

最终全量 Chromium 端到端为 112 通过、0 失败、0 跳过，配置 retries=0，实际重试、flaky、预期失败均为 0。新增管理用例 19 条，包含真实登录身份选择、全部／单态、已发布显式 mock、URL 历史、USER 深链和回跳、403／401、旧会话取消、429 清空、网络／503、Long 与鉴权封面、空页及六尺寸。修复后代表截图复核序号保持单行，状态和时长可读。

### 完整命令与逐文件覆盖率

- `npm ci` 沙箱首次失败，npm 报告 Exit handler never called。沙箱外重试退出 0，安装 308 包并审计 309 包。输出的 6 个 moderate advisories 属于现有锁定依赖，依赖文件与基线一致。
- `npm run check` 退出 0，ESLint 零警告、Prettier 通过、Vitest 31 份文件共 546 通过、0 失败、0 跳过、0 todo，生产构建通过。Vite 延续既有全量引入的大包提示。
- `npm run test:e2e` 退出 0，112 通过、0 失败、0 跳过、0 重试／flaky／预期失败。
- `npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html` 退出 0，546 通过、0 失败、0 跳过、0 todo。

文件级数据来自本轮 `coverage/coverage-summary.json`，HTML 报告位于 `coverage/index.html`。逐文件统计完整源码，行至少 80%、分支至少 70%，本次均达标。

| 本次业务源码                                 | 完整文件行      | 完整文件分支     | 适用性                        |
| -------------------------------------------- | --------------- | ---------------- | ----------------------------- |
| src/api/tracks.js                            | 96.55%（56/58） | 84.61%（66/78）  | API 与无损转换                |
| src/utils/trackList.js                       | 100%（47/47）   | 100%（53/53）    | 查询与格式化                  |
| src/utils/errors.js                          | 100%（12/12）   | 90.90%（10/11）  | 错误映射                      |
| src/composables/useTrackList.js              | 100%（54/54）   | 96.87%（31/32）  | 请求生命周期                  |
| src/components/library/TrackTable.vue        | 100%（52/52）   | 100%（85/85）    | 表格与分页                    |
| src/views/management/TrackManagementView.vue | 98.11%（52/53） | 89.36%（42/47）  | 页面编排                      |
| src/router/guards.js                         | 100%（10/10）   | 100%（14/14）    | 权限恢复                      |
| src/router/index.js                          | 100%（12/12）   | 不适用（0 分支） | 路由声明由真实挂载及 e2e 验证 |

测试、文档和产物排除于业务源码口径。未改动的 Toolbar、TrackCover、HTTP、BusinessLayout、main 与登录逻辑保留关联回归。全仓行 97.76%、分支 93.47%仅作为补充统计。

## 已知限制

真实后端联调与 Chromium 之外的浏览器验证尚未执行。本次沿用现代浏览器方向，截图覆盖 1366×768、1440×900、1920×1080、1024×768、320×740、390×844，并检查 1024px 下普通曲库带真实 ADMIN 侧栏的关联回归。新增依赖为零。

## Git 与审核材料

实施基线为 `main / e819a1f1b18c55a45f72b2dd209d2b27400a924d`。当前任务为单一 MGMT-01 管理读取切片，需求、权限、声称行为、校验依据和视觉决定由本文及已批准设计／计划提供。

本轮开始前已有列表契约修改与三份未跟踪收藏契约，归人类所有，作为只读输入保留。

首次提交的审核反馈复核与处置为不涉及。独立审核按当前 CLAUDE.md 清单执行，MGMT-01 第 1 轮提交完整切片，基线从实施前提交至本次验证材料提交。Claude Code 运行器版本为 2.1.325，采用用户既有配置的 mimo-v2.6-pro。原 LIB-01 审核计数属于已结束任务。

2026-11-17 Claude Code 第 1 轮实质审核给出 accepted，阻断项与非阻断建议均无。独立重跑四项验证，546 条单测与 112 条端到端全部通过，8 份源码文件的覆盖率与本表一致。审核前后 Git 状态保持人类输入原状。[完整审核报告](../reviews/2026-11-17-track-management-review.md)

送审终点为 `f5b863122cb113de4e33b2a7b1c65ce13f6f2fcf`，对应下表 22 份文件。accepted 后新增完整审核报告作为第 23 份归档文件，并同步任务书与计划的完成状态。

### 变更文件清单

| 文件                                                       | 用途                                     |
| ---------------------------------------------------------- | ---------------------------------------- |
| src/api/tracks.js                                          | 管理读取入口与共享转换链                 |
| src/api/tracks.spec.js                                     | 管理全部／单状态、普通曲库范围与响应回归 |
| src/utils/trackList.js                                     | 管理查询、序列化、状态文案               |
| src/utils/trackList.spec.js                                | 查询边界与状态枚举                       |
| src/utils/errors.js                                        | 管理查询错误文案                         |
| src/utils/errors.spec.js                                   | 精确文案断言                             |
| src/composables/useTrackList.js                            | 可选读取函数注入                         |
| src/composables/useTrackList.spec.js                       | 管理竞态、取消、冷却及会话测试           |
| src/components/library/TrackTable.vue                      | 可选状态与空文案、紧凑排版               |
| src/components/library/TrackTable.spec.js                  | 状态列、窄屏与空态优先级                 |
| src/views/management/TrackManagementView.vue               | 管理页面与查询编排                       |
| src/views/management/TrackManagementView.spec.js           | URL、焦点、角色、反馈与筛选              |
| src/router/index.js                                        | 真实管理路由与侧栏声明                   |
| src/router/index.spec.js                                   | 实际页面挂载、角色与抽屉                 |
| src/router/guards.js                                       | 首次／登录角色拒绝的安全落点             |
| src/router/guards.spec.js                                  | 角色恢复与原导航语义                     |
| src/views/login/LoginView.spec.js                          | 真实角色守卫下的登录回跳                 |
| e2e/library.spec.js                                        | 真实 ADMIN 入口与 USER 隐藏关联回归      |
| e2e/track-management.spec.js                               | 管理主流程、权限、资源、错误与六尺寸检查 |
| docs/features/track-management.md                          | 行为、依据、验证与审核材料               |
| docs/superpowers/plans/2026-11-17-track-management-list.md | 实际执行进度                             |
| docs/tasks/song-management.md                              | MGMT-01 当前状态                         |

新增审核归档文件为 `docs/reviews/2026-11-17-track-management-review.md`。

工作区人类所有文件为已修改 `docs/api/track/list-tracks.md` 与未跟踪 `docs/api/favorite/favorite-track.md`、`docs/api/favorite/list-favorites.md`、`docs/api/favorite/unfavorite-track.md`。这些输入沿用户原状保留，首次送审范围按本表 22 份文件核对，最终新增审核报告归档。

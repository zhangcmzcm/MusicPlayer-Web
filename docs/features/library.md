# LIB-01 曲库主页

## 目标与边界

已认证用户从 `/` 浏览统一已发布曲库，可搜索、排序、分页和读取鉴权封面。登录成功优先安全回跳，默认进入曲库。USER 与 ADMIN 主页均固定请求 `status=PUBLISHED`。

本次交付对应任务书 LIB-01 及 AUTH-07 的默认业务落点。播放栏与全屏播放器归 PLAY-01，队列及模式归 PLAY-02，歌词归 PLAY-03，收藏、个人中心和管理员管理页按任务书各自交付。当前导航由实际路由生成，侧栏有可用目标时显示。顶部用户名展示当前会话身份。[曲库任务书](../tasks/library-homepage.md)

## 路由、权限和视觉决定

- `/` 为 `library`，BusinessLayout 统一承载已认证业务页面。匿名访问通过现有守卫进入 `/login?redirect=/`，未知地址进入既有 404。
- 登录的三种方式、管理员身份选择、注册及重置密码预填沿用已有流程。成功导航由目标页面管理焦点，导航被守卫拒绝或抛错时保留会话，可点击“进入曲库”重试。
- 顶部“音乐”连接真实曲库。导航读取路由的 `meta.navigation`，角色读取 `auth.session.user.role`。后续管理路由声明 `roles: ['ADMIN']` 并复用现有角色守卫。当前生产路由只有曲库，测试通过隔离路由验证侧栏的 USER／ADMIN 菜单及手机抽屉。
- 复用人类确认的白色内容面、嫩叶绿层次、宋体标题、连续歌曲行、顶部搜索、手机元数据合并与抽屉方向。桌面播放器左右分栏及手机上下结构由后续播放切片沿用。
- 页面挂载和 URL 查询切换后聚焦标题。异步数据完成时保留当前焦点，避免迟到结果打断输入。手机搜索可展开与收起，已有全局减少动态规则继续生效。

视觉依据为 `docs/design/theme.md`、`example/index.html` 的配色与气质，以及人类确认的整体样式和实施计划。原型用于设计确认，生产页面使用真实契约数据。[样式设计](../superpowers/specs/2026-11-15-library-style-design.md)与[实施计划](../superpowers/plans/2026-11-15-library-homepage.md)

## 后端依赖

| 请求                            | 用途                             | 契约                                        |
| ------------------------------- | -------------------------------- | ------------------------------------------- |
| GET `/api/v1/tracks`            | 已发布歌曲、搜索、排序、精确分页 | [列表契约](../api/track/list-tracks.md)     |
| GET `/api/v1/tracks/{id}/cover` | Authorization 鉴权图片           | [封面契约](../api/track/get-track-cover.md) |

认证继续消费既有登录契约。封面地址由精确歌曲 ID 构造，图片元数据 URL 只作为响应展示信息消费。业务 Token 仅附加至统一业务 HTTP 实例。获取 Blob 后使用 Object URL 显示图片，资源切换、图片解码失败和卸载均释放旧 URL。

新增依赖 `lossless-json@4.3.3`，用于保留原始 JSON 中超过 JavaScript 安全整数范围的 Long。API 层输出精确十进制字符串，时长展示使用 BigInt 整数运算。package 与锁文件同步，其他依赖版本沿用现有项目。

## 查询与状态交互

URL 保存已提交的 `q`、`page`、`size` 和 `sort`。默认值为 `q=''`、`page=0`、`size=20`、`sort=createdAt,desc`，序列化省略默认值。前进、后退、刷新恢复查询，输入中的草稿保留在搜索表单中。

搜索以 Enter 或按钮提交，输入法组合期间阻止提交。关键词原样传输，清空关键词恢复普通列表。再次提交相同查询触发手动刷新，同一请求 pending 时合并重复操作。搜索、排序和页大小改变后回到第 1 页。页大小支持 1—100，排序提供契约四字段的双方向选项。

| 状态                               | 用户反馈与恢复                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| 加载                               | 显示正在读取曲库，清除旧页数据，搜索新条件仍可编辑和提交                                            |
| 普通空库                           | 显示曲库暂时没有歌曲及真实统计                                                                      |
| 搜索空结果                         | 显示没有找到相关歌曲及更换／清空关键词提示                                                          |
| 合法空页                           | 保留请求页、真实总数与总页数，提供回到第一页                                                        |
| URL 参数无效                       | 客户端提示与恢复默认条件按钮，停止该次 API 读取                                                     |
| 搜索 429                           | 使用有效 Retry-After 倒计时，限制携带关键词的重试和筛选，清空查询可浏览普通列表。到期后等待手动提交 |
| 网络、超时、503                    | 显示集中安全文案，提供手动重试                                                                      |
| 封面 404、502、503、传输或解码失败 | 显示叶形缺省封面，保留歌曲信息                                                                      |
| 当前受保护会话 401                 | 清理会话、安全进入登录，覆盖无正文二进制 401                                                        |
| 旧会话迟到结果／401                | 请求序号、取消信号、会话对象及 revision 共同阻止旧数据和退出操作                                    |
| 查询导航失败                       | 显示安全错误，保留当前 URL 与可操作页面                                                             |

上一页要求当前页大于 0，下一页同时要求 `hasNext` 和下一页乘积不超过 10000。页码从 1 开始，输入上限为 `floor(10000 / size) + 1`。总数和总页数按服务端精确字符串显示。

## 校验谓词与字段行为

| 字段或条件                | 依据类别与条款                       | 缺失、null、边界和非法形态处理                                                                                                        | 自动化依据                                                                      |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| q                         | API，列表“查询参数”“关键词匹配”      | 缺省／空字符串省略请求参数。非空原始值至多 100 Unicode 码点，White_Space 分隔后 1—5 词。纯空白、101 码点、6 词和数组拒绝              | trackList.spec 的搜索边界参数化用例、Toolbar 原始关键词提交、library e2e 主流程 |
| page／size                | API，列表“查询参数”                  | 缺省 0／20。单个整数字符串转安全整数，page 非负、size 1—100、乘积至多 10000。null／数组／溢出／小数拒绝。带符号和前导零的合法整数接受 | trackList.spec 查询参数表、TrackTable 深分页、library 合法空页                  |
| sort                      | API，列表“查询参数”                  | 缺省最近加入。仅 id／title／artistName／createdAt 及 asc／desc。空值、数组和未知字段拒绝                                              | trackList.spec、Toolbar 事件、library 排序与历史                                |
| URL 其他字段              | 客户端，导航与请求隔离               | 忽略当前页面无关参数，仅将支持字段发往业务 API，重复的已知参数形成数组并拒绝                                                          | trackList.spec 序列化用例                                                       |
| items                     | API，列表“成功响应”                  | 必需数组，空数组合法。缺失／null／非数组拒绝整页                                                                                      | tracks.spec 元数据参数化用例                                                    |
| id                        | API，列表 ID 与封面路径              | 必需正整数 Long 至 9223372036854775807，精确接受等价整数指数／小数写法。缺失、null、0、负数、非整数、超界和非法类型拒绝整页           | tracks.spec Long、非法 ID，library 精确封面路径                                 |
| title／artistName         | API 展示字段及客户端恢复             | 合法字符串原样展示。缺失、null、空字符串和非法类型分别降级为未命名歌曲／未知艺术家                                                    | tracks.spec 缺失或异常展示字段                                                  |
| albumName                 | API，可空展示字段及客户端恢复        | 合法字符串原样展示，合法 null 与异常缺失／类型均显示未标注专辑                                                                        | tracks.spec、TrackTable.spec、library nullable                                  |
| durationMs                | API，Long 或 null，客户端格式化      | 合法 null、缺失和非法形态显示未知时长。合法 Long 保持精度，负数显示未知，0 为 0:00，最大 Long 精确格式化                              | tracks.spec、trackList.spec 格式化、TrackTable.spec                             |
| cover                     | API，可空对象，客户端资源恢复        | null 或异常形态显示缺省图。对象存在时按歌曲 ID 请求图片。url／contentType／sizeBytes 不参与外部导航或授权，缺失元数据可安全展示降级   | tracks.spec、TrackCover.spec、library 图片用例                                  |
| status                    | 产品，统一已发布主页及 API 状态筛选  | 必须 PUBLISHED，与当前请求范围一致。缺失／null／其他状态拒绝整页                                                                      | tracks.spec 非预期分页或状态                                                    |
| page／size 响应           | API，回显查询页及页大小              | 必需整数，page 0—Integer.MAX_VALUE、size 1—100，必须等于本次请求。非法值拒绝                                                          | tracks.spec 元数据参数化用例                                                    |
| totalElements／totalPages | API，Long 统计                       | 必需非负 Long，最大值保留精度。缺失、null、负数和非法类型拒绝。越界页保留真实非零统计                                                 | tracks.spec 超大统计与空页、TrackTable.spec                                     |
| hasNext                   | API，Boolean                         | 必需 boolean，缺失、null 和字符串拒绝。深分页上限继续约束下一页操作                                                                   | tracks.spec、TrackTable.spec                                                    |
| 未知响应字段              | 项目响应消费规则                     | 忽略不影响当前用途的新增字段                                                                                                          | tracks.spec 展示降级                                                            |
| 封面路径参数              | API，封面“路径参数”                  | 精确十进制正 Long 字符串，非法类型、0、越界和非数字在发请求前拒绝                                                                     | tracks.spec protected cover API                                                 |
| 封面成功响应              | API，封面成功图片                    | 完整 200、JPEG／PNG／WebP、非空 Blob。类型、状态或空体异常使用本地 INVALID_RESPONSE，组件回退                                         | tracks.spec MIME／空图，TrackCover.spec 解码                                    |
| 二进制错误                | API，封面错误及客户端传输规则        | 先解码 JSON 再消费稳定 code。无正文／不可解析体保留状态兜底，当前 401 仍进入统一失效处理                                              | tracks.spec 二进制错误与无正文 401                                              |
| 受保护 401                | 安全，AGENTS 四.4／五.3              | 请求记录 Token 及会话 revision，两者仍匹配当前会话才清理。公开认证请求保持原错误流程                                                  | http.spec、main.spec、library 会话用例                                          |
| 请求有效性                | 客户端，请求生命周期                 | 新查询、换会话、资源切换及卸载取消旧请求。当前序号、信号、对象及 revision 匹配才写入                                                  | useTrackList.spec、TrackCover.spec                                              |
| 页码输入                  | API 深分页及产品 1 基页码            | 十进制整数且 1 至可请求上限，验证失败显示表单反馈并阻止导航                                                                           | TrackTable.spec、library 深分页                                                 |
| 登录后导航                | 安全，既有安全回跳规则与产品默认落点 | 使用已有 resolveSafeRedirect，认证页／站外／未知目的地拒绝并使用曲库。导航失败保留会话和重试操作                                      | redirect.spec、LoginView.spec                                                   |

本地 `INVALID_LIBRARY_QUERY`、`INVALID_RESPONSE`、`CLIENT_ERROR` 表达客户端导航、响应消费或运行失败。后端业务错误仍按稳定 code 映射，403、404、409、429 和 5xx 保留统一安全兜底。该切片仅执行读取，409 写入冲突和破坏性操作确认没有触发入口。

### 关键组合决策

| 条件                                        | 预期                                     | 证据                                             |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| 匿名进入曲库                                | 清理无效会话，进入登录并保留安全目标     | router/index.spec、guards.spec                   |
| USER／ADMIN／管理员以 USER 登录             | 统一请求 PUBLISHED，导航消费本次会话角色 | tracks.spec、BusinessLayout.spec、登录双角色 e2e |
| 当前 Token 相同且 revision 相同的受保护 401 | 清理当前会话，避免重复登录导航           | http.spec、main.spec                             |
| Token 改变或同 Token 的 revision 改变       | 旧 401 保留新会话                        | http.spec、library 同 Token 更新 e2e             |
| 旧查询晚于新查询完成                        | 页面显示新查询数据                       | useTrackList.spec 两种完成顺序                   |
| 同账户搜索冷却中且 q 非空                   | 提示倒计时、阻止搜索读取                 | useTrackList.spec、Toolbar.spec                  |
| 搜索冷却中且清空 q                          | 普通列表可读取，倒计时结束后手动搜索     | useTrackList.spec、library 429                   |
| page 超出真实总页数但乘积合法               | 真实空页及统计，可回第一页               | tracks.spec、TrackTable.spec、library 深分页     |
| hasNext=true 但下一页乘积越界               | 下一页禁用                               | TrackTable.spec                                  |
| 无实际侧栏目标                              | 内容使用可用宽度                         | BusinessLayout.spec、真实页面五尺寸检查          |

## 测试、视觉检查和验证

所有业务 HTTP 使用 mock。Vitest 测试涵盖 API 原始 JSON 转换、Long 与 null、搜索规则、请求竞态与取消、封面释放、列表状态、表单、分页、真实路由、导航失败恢复及原认证流程。完整用例位于与各业务源码同目录的 `*.spec.js`。

Playwright 新增 15 条曲库用例，覆盖真实登录到曲库、原始搜索、排序、分页、刷新与历史、Long 封面、图片缺失／解码／中断、合法空页、限流、错误重试、二进制 401、会话更新及五种屏幕尺寸。会话更新用例通过既有 Pinia authenticate 动作建立同 Token 的新 revision，真实浏览器请求取消与新封面加载均参与验证，HTTP 单测另行验证旧 401 到达拦截器的情形。认证关联回归共 78 条。

检查尺寸为 1366×768、1440×900、1920×1080、320×740、390×844。Playwright 对文档、main 和表格内部横向溢出、时长列可见、长歌名、省略、搜索错误反馈、分页纵向滚动与键盘操作进行断言。已人工查看桌面及 320px 代表截图，修复窄屏自动列宽挤出时长的问题。图片与报告输出到忽略的 test-results，源码仓库保留可重复生成步骤。

| 实际命令                                                                                                         | 结果                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| npm ci                                                                                                           | 沙箱内安装未完成，沙箱外按锁文件成功安装 308 包、审计 309 包，报告 6 项 moderate |
| npm run check                                                                                                    | 待最终验证记录                                                                   |
| npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html | 最终复跑 471 通过、0 失败、0 skipped、0 todo                                     |
| npm run test:e2e -- e2e/login.spec.js e2e/registration.spec.js e2e/password-reset.spec.js                        | 78 通过、0 失败、0 跳过                                                          |
| npm run test:e2e -- e2e/library.spec.js                                                                          | 首轮 14 通过、1 定位超时，改为排序键盘操作后 15 通过，窄屏布局修复后 15 通过     |
| npm run test:e2e                                                                                                 | 待最终验证记录                                                                   |

组件首轮递归更新来自全局 Teleport 测试替身与 Element Plus 的交互，改用真实目标后 19 条组件用例通过。真实启动测试进一步复现 Teleport 目标与父布局同轮挂载的时序问题，使用 Vue 支持的 defer 等待目标挂载。登录相关定向单测最终 96 条通过。过程中的失败与修复记录在实施计划中。

### 逐文件完整覆盖率

报告来自 `coverage/coverage-summary.json` 及 `coverage/index.html`，逐文件统计完整源码，达到行 80%、分支 70% 的门槛。测试、fixtures 和文档不纳入业务覆盖率。

| 文件                                      | 行     | 分支   |
| ----------------------------------------- | ------ | ------ |
| src/api/tracks.js                         | 90.56% | 79.45% |
| src/api/http.js                           | 90%    | 81.57% |
| src/utils/trackList.js                    | 100%   | 100%   |
| src/utils/errors.js                       | 100%   | 90.9%  |
| src/composables/useTrackList.js           | 100%   | 96.66% |
| src/components/library/TrackCover.vue     | 100%   | 79.16% |
| src/components/library/LibraryToolbar.vue | 89.13% | 89.79% |
| src/components/library/TrackTable.vue     | 100%   | 100%   |
| src/components/layout/BusinessLayout.vue  | 92.1%  | 100%   |
| src/views/library/LibraryView.vue         | 97.29% | 79.16% |
| src/views/login/LoginView.vue             | 100%   | 96.22% |
| src/main.js                               | 100%   | 100%   |
| src/router/index.js                       | 100%   | 100%   |

路由为声明与既有守卫接入，真实 router 单测及完整浏览器主流程提供替代交互证据，同时报告仍记录其实际文件覆盖率。main 含失效回调逻辑，已纳入完整覆盖率。

## 文件与审核材料

实现和测试的完整文件清单、Git 送审区间、独立审核结果与反馈处置记录见[本次审核请求](../reviews/2026-11-15-library-review-request.md)。开发时已有的人类列表契约修改与三份未跟踪收藏契约保持原归属，作为只读依赖。

## 已知限制与联调状态

自动化及视觉检查在 Chromium 完成。真实后端和其他浏览器尚未联调，后端查询与授权行为依据当前人类提供契约及 mock 验证。歌词来源、音频鉴权与 Range 验证等按后续任务各自确认。

真实联调可先按仓库 `.env.example` 配置开发代理目标，启动已就绪的后端及前端 `npm run dev`，使用测试账户完成登录，核对主页 PUBLISHED 查询、关键词首尾空白、分页、鉴权封面和会话失效。接口错误与存储失败仍通过可控 mock 重现，真实测试账户凭据由本地安全配置提供。

### 审核反馈复核与处置

首次提交，待独立 Claude 审核。

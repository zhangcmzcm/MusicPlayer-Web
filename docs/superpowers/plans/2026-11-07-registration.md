# 注册页与共享树叶翻面实施计划

> 执行方式沿用本对话 Codex 顺序实现、Claude 独立审核、人类最终确认。执行阶段逐项验证与提交，复选框只在实际完成后勾选。本机未提供 executing-plans 或 subagent-driven-development 技能，按本计划在当前对话顺序执行。

**目标** 交付可选邮箱的用户名注册、确认密码、登录注册双向链接、成功回登录预填，以及共享白叶翻面和手机顶部同行布局。

**架构** AuthScene 持续承载背景、叶片和公共标题，子路由各自编排表单。useRegistration 管理注册私有请求，Pinia 的认证流程 store 仅保存跨路由所需的内存交接与发码限流期限。注册成功以 201 为依据，不建立会话。

**技术栈** Vue 3 Composition API、JavaScript、Vue Router、Pinia、Axios、Element Plus 全量引入、scoped CSS、Vitest、Vue Test Utils、Playwright，复用现有锁定依赖。

**设计依据** [已通过第 1 轮审阅的注册设计](../specs/2026-11-07-registration-design.md)，基线为 `main / 847840c`。本文收录 accepted 报告两条非阻断意见的实施口径，设计原文保持该审核基线。

## 全局约束

- 用户名 3–20 位 ASCII 英文字母、数字或下划线；新注册密码 8–72 个 U+0020–U+007E 字符，禁止全空格，保留首尾空格。确认密码必须完全一致，仅本地校验。
- 用户名、密码、确认密码、邮箱始终显示。前三项标 `*`，邮箱选填。有邮箱内容才展开必填的 6 位数字验证码，清空或修改邮箱清除旧验证码。
- 无邮箱请求仅 username、password；有邮箱增加 email、code；发码 purpose 固定 REGISTER。公开请求使用 publicRequest，不携带业务 Bearer。
- 桌面登录和注册几何中心相对中线各偏移 12%，叶尖朝上，登录叶脉右倾、注册左倾。翻面参考约 2.6 秒，表单文字始终正向。
- 手机两页均为左侧“风与叶”、右侧页面主标题，隐藏标题上下的英文与副文案。保留原有三个小叶片和风线，手机居中小幅飘移翻面。
- 注册主标题“让喜欢，就此启程”，桌面副文案“从一片叶，遇见你的旋律。”；两页外侧竖排均用“一叶清新／一曲自在”，注册在左、登录在右。
- 手机一屏基线为 320×740、390×844 CSS 视口、默认字体、100% 缩放、软键盘收起，检查五字段、两行字段错误、两行常规接口反馈与一行发码通知并存及底部导航。
- 桌面验证 1366×768、1440×900、1920×1080。极矮屏、长恢复说明、软键盘和放大采用自然纵向滚动，错误与操作可达，无横向溢出。
- 注册成功自动回登录，用户名密码方式、用户名预填、密码留空、成功提示，一次性交接仅内存。安全 redirect 保留，认证路由不作为登录成功回跳目标。
- 无新增依赖、TS、假路由或假链接。人类维护的 API 契约、主题、example 与审核协议只读引用。
- 必须实际执行 npm ci、npm run check、npm run test:unit:coverage、npm run test:e2e，逐文件完整行覆盖率至少 80%、分支至少 70%。

## 审核反馈复核与处置

| 编号     | 问题、分级与方向复核                                                                                                                  | 本计划处置                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NOTE-001 | 成立，设计 §6 未显式列出 500。非阻断分级合理，原设计已覆盖无法确认的服务异常。注册契约未保证 500 时账户一定未创建，明确分类的方向合适 | 注册提交的全部 HTTP 5xx（包括 500 INTERNAL_ERROR、503）、NETWORK_ERROR、TIMEOUT 采用原安全错误加“注册结果暂未确认，可尝试登录核实”。发码阶段单独提示发送结果，不使用注册结果未知文案。任务 2 覆盖 |
| NOTE-002 | 成立，原设计只有两列竖排的位置。非阻断分级合理，属于实施前可补齐的展示文案                                                            | 人类已在本次对话确认注册侧沿用“一叶清新／一曲自在”。任务 3 验证内容及左右位置                                                                                                                     |

设计已 accepted，无阻断争议。上述记录随计划进入后续实现审核，不重开设计审核计数。

## 文件与接口地图

| 文件                                                                              | 本次职责                                                   |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| src/api/auth.js、auth.spec.js                                                     | 增加 registerUser、sendRegistrationCode，保留既有登录函数  |
| src/stores/authFlow.js、authFlow.spec.js（新增）                                  | 跨路由内存交接、按用途与邮箱隔离的发码期限、共享 IP 期限   |
| src/composables/useRegistration.js、useRegistration.spec.js（新增）               | 注册状态、校验规则、发码、结果未知、取消与敏感输入清理     |
| src/components/auth/RegisterForm.vue、RegisterForm.spec.js（新增）                | 五字段受控表单、条件展开、浮动标签、可访问错误及验证接口   |
| src/views/register/RegisterView.vue、RegisterView.spec.js（新增）                 | 反馈、成功回登录和场景标题接入                             |
| src/components/auth/AuthScene.vue、AuthScene.spec.js（新增测试）                  | 公共标题、品牌同行、注册稳定姿态、共享动画与装饰           |
| src/composables/useAuthSceneTransition.js、useAuthSceneTransition.spec.js（新增） | 路由目标与动画生命周期、减少动态和取消后的最终状态         |
| src/composables/authScene.js                                                      | 场景标题与聚焦接口的约定，沿用原注入 key                   |
| src/views/login/LoginView.vue、LoginView.spec.js                                  | 标题交给场景、内存成功提示和用户名预填                     |
| src/components/auth/LoginForm.vue、LoginForm.spec.js                              | 底部真实注册链接，保留原表单接口与浮动行为                 |
| src/composables/useLogin.js、useLogin.spec.js                                     | 接入跨页发码期限及成功预填，原登录和 Ticket 规则保持有效   |
| src/router/index.js、index.spec.js、src/utils/redirect.js                         | 注册子路由与认证回跳排除；安全回跳测试纳入现有 router 测试 |
| src/utils/errors.js、errors.spec.js                                               | 新增注册冲突和验证码稳定错误码的安全文案                   |
| e2e/registration.spec.js（新增）、e2e/login.spec.js、e2e/fixtures.js              | 注册主流程、容量、转场、限流及登录关联回归                 |
| docs/features/registration.md（新增）、docs/features/login.md、本计划             | 功能说明、确认来源、实测与完成记录                         |

LeafArtwork.vue 优先复用原 SVG 与外层变换，若实现卷曲确需修改轮廓，局限于该文件并纳入视觉及完整文件覆盖率检查。其余新增共享组件需能说明实际调用与必要性，不预先抽象整个认证表单系统。

## 重点回归风险

1. 改邮箱、清空邮箱后旧发码响应到达，应忽略旧反馈并清验证码，同时保留适用的限流期限，任务 1、2 测试。
2. 从注册切回登录或反复切换，不能绕过已知 IP 限流，REGISTER 与 LOGIN 邮箱期限又须隔离，任务 1、3 测试。
3. 用户修改密码后确认密码仍显示通过，或浏览器自动填充导致浮动标签覆盖，任务 2 验证重校验、真实标签与预填，任务 4 记录浏览器证据。
4. 导航已离开，旧请求或旧动画完成回调又覆盖新页面，任务 2、3 用延迟响应和取消场景验证最终路由、焦点与表单。
5. 320px 下标题同行与全五字段并存反馈超过容量，任务 2 先做几何验收；无法满足时按设计提交实测给人类裁定，不能通过删断言、截反馈绕过。

## 任务 1 建立公开注册调用与跨页内存状态

**接口** `registerUser(payload, { signal } = {}) -> Promise<void>`，以 201 确认成功，不消费成功体的资料字段；`sendRegistrationCode(email, { signal } = {}) -> Promise<{ purpose, expiresAt }>`，校验用途 REGISTER 与未来 UTC 截止时间，复用 isFutureInstant。

**共享接口** setup store `useAuthFlowStore()` 提供 `completeRegistration(username)`、`takeRegistrationSuccess() -> { username } | null`、`sendRemaining(purpose, email, now) -> number`、`recordSend(purpose, email, deadline)`、`recordLimit(purpose, email, error, now)`、`clearHandoff()`。邮箱期限按规范化邮箱和用途区分，IP_RATE_LIMIT 共享；未知 scope 沿用现有保守冷却策略。保存绝对期限，页面计时器仅刷新当前时间。

- [x] **步骤 1 写调用与 store 红测。** 验证无邮箱体仅两字段、有邮箱体保留 code 前导零，publicRequest 和 signal 正确；201 的资料字段缺失、null、未知扩展均不阻断成功，非 201 不返回假成功；REGISTER 发码用途错误、过期或非法时间拒绝，合法响应通过。
- [x] **步骤 2 补共享状态测试。** `should_consume_registration_success_only_once` 断言两次读取分别为 `{ username: 'listener' }` 与 null；`should_keep_purpose_limits_separate_and_share_ip_limit` 使用固定时间验证 REGISTER 邮箱冷却不阻断 LOGIN，IP 限流同时阻断两者；切换邮箱后原邮箱期限仍有效，Retry-After 为 0、缺失或非法值按既有语义处理。断言不写 storage、不改变 auth.session。
- [x] **步骤 3 运行定向测试并记录实际红绿结果。** 执行 `npm run test:unit -- src/api/auth.spec.js src/stores/authFlow.spec.js`，记录未实现接口导致的失败。
- [x] **步骤 4 最小实现。** 在 auth.js 增加两个公开调用与必要错误处理，新增 authFlow store。成功交接仅保存用户名，不保存密码、验证码或完整响应。限流期限在登录注册切换时保留，过期期限在访问或更新时清理，避免长期累积邮箱记录。注册失败不写成功交接。
- [x] **步骤 5 验证并提交。** 重跑步骤 3 至全绿，执行 `npm run lint`，显式添加本任务文件，提交 `feat: 添加公开注册调用与认证流程内存状态`。

## 任务 2 完成注册表单与手机容量验收

**接口** `useRegistration()` 返回 `form`（username、password、confirmPassword、email、code）、`rules`、`busy`、`sending`、`error`、`codeNotice`、`recoveryNotice`、`sendRemaining`、`submit(formComponent) -> Promise<{ username } | null>`、`sendCode(formComponent)`。成功返回提交时用户名，失败或取消返回 null，error 保留安全业务错误。

**表单接口** RegisterForm 接收 modelValue、rules、busy、sending、sendRemaining，发出 update:modelValue、submit、send-code；暴露 `validate() -> Promise<boolean>`、`validateEmail() -> Promise<boolean>`。确认密码重校验留在表单校验职责内。RegisterView 使用这两个接口，不直接调用 Axios。

**场景标题接口** 沿用 authSceneKey 的 scene.step，增加 `scene.heading = { title, eyebrow, intro, testId }` 和 `scene.focusHeading()`。AuthScene 统一渲染可聚焦标题与手机品牌同行，子页面提供内容，避免手机和桌面重复可访问标题。LoginView 移交现有标题内容、状态与聚焦调用，测试挂载真实场景验证。

- [x] **步骤 1 补齐校验与表单用例。** 用户名长度 2/3/20/21、非法字符；密码长度 7/8/72/73、全空格、非 ASCII、制表符、前后空格保留；确认密码不一致阻断并在原密码修改后重新校验。邮箱空、仅空白、非法、120/121 字符、合法但缺码、码为 012345 均按设计断言实际请求或阻断。
- [x] **步骤 2 写生命周期和错误红测。** 500/503/其他 5xx、断网、超时均在注册阶段显示原错误和结果未知提示；发码失败没有注册未知提示。覆盖各契约冲突、验证码错误和限流，取消静默。延迟发码后改邮箱、清邮箱、离开注册，旧响应不能恢复提示；提交和发码重复点击各只调用一次 API。用假时钟验证 60 秒发送冷却及 300 秒有效期提示到期。
- [x] **步骤 3 运行定向测试并记录实际红绿结果。** 执行 `npm run test:unit -- src/composables/useRegistration.spec.js src/components/auth/RegisterForm.spec.js src/views/register/RegisterView.spec.js src/views/login/LoginView.spec.js src/components/auth/AuthScene.spec.js`，确认断言失败原因后实现。
- [x] **步骤 4 完成实际注册路径。** 新增 useRegistration、RegisterForm、RegisterView，接入真正 `/register` 子路由；邮箱有内容才渲染验证码。复用 Element Plus 的 label/input 关联和错误 ID，必填星号同时有表单 required 语义。两个密码显隐按钮名称分别说明密码与确认密码，自动填充使用 username、new-password、email、one-time-code 语义。
- [x] **步骤 5 接入共享标题与稳定几何。** AuthScene 集中标题展示，桌面保留原标题组与位置，手机隐藏英文与副文案、品牌和主标题同行。注册稳定右侧白叶用外层翻转得到左倾叶脉，表单独立正向。紧凑间距和错误预留在注册组件内控制，保留输入可操作尺寸。修改 errors 映射，只展示安全稳定文案。
- [x] **步骤 6 前置浏览器容量门槛。** 新增注册容量 e2e，在 320×740、390×844、1366×768 验证实际五字段、逐字段两行错误、两行接口反馈加一行发码通知、按钮及返回登录文字。接口反馈由 mock 错误产生，字段错误由真实校验产生；若某组合需要强制填充容量，注入仅在测试 DOM 中，清楚标记并在刷新后消失。断言无横纵溢出、白叶不因展开和反馈伸缩，内容在实际 SVG 轮廓内。保存并查看截图，先解决容量再开展复杂翻面。
- [x] **步骤 7 验证并提交。** 执行步骤 3 命令、`npm run test:e2e -- e2e/registration.spec.js --grep capacity`、`npm run lint`。若容量门槛无法通过，记录测量并停在该门槛等待人类决定。通过后按实际文件显式提交 `feat: 实现可选邮箱注册与紧凑手机布局`。

## 任务 3 接入双向链接、成功交接与共享翻面

**转场接口** `useAuthSceneTransition({ route, leafRef, contentRef, poemRef })` 返回 `transitioning`、`settledPage`、`finishAtCurrentRoute()`。只消费 route.name 的 login/register 与已确认 scene.step；生命周期中注册并清理 media query、动画、事件监听。使用现有浏览器动画能力和 CSS，无新库。

**登录接口** `useLogin(auth)` 保留现有返回值，增加 `prefillRegisteredUsername(username)`，切至 USERNAME_PASSWORD 并清敏感输入、旧错误和票据；LoginView 消费一次性注册交接、展示成功 status。发码期限调用任务 1 store，保留原有登录冷却、Ticket、session 与错误语义。

- [x] **步骤 1 补齐导航与回跳用例。** 注册 201 后 auth.session 未建立，跳转 login、用户名预填、密码空、成功提示出现；刷新或再次进入不重放交接；普通去登录不预填。resolveSafeRedirect 拒绝 `/register`、`/login`、认证入口和其查询／编码形态，已存在安全目标继续可用，非法或未知目标丢弃。若当前无真实受保护业务路由，成功回跳测试使用内存 router 测试路由。
- [x] **步骤 2 补齐场景与转场用例。** 直接打开注册稳定右侧、打开登录稳定左侧；两页共用同一 AuthScene 和主叶节点。双向导航、历史返回、动画未完成再次导航、导航拒绝、场景卸载、减少动态设置中途变化后，最终姿态与当前路由一致，焦点在当前标题，离场输入不可聚焦。旧注册响应在取消后不生成成功交接。
- [x] **步骤 3 运行定向测试并记录实际红绿结果。** 执行 `npm run test:unit -- src/router/index.spec.js src/composables/useAuthSceneTransition.spec.js src/components/auth/AuthScene.spec.js src/composables/useLogin.spec.js src/views/login/LoginView.spec.js src/views/register/RegisterView.spec.js`。
- [x] **步骤 4 实现导航与交接。** LoginForm 增加可用 RouterLink 和安全 redirect 的受控目标 prop，RegisterView 提供返回登录链接。成功时写一次性交接并 replace 到登录，保留经过安全校验的 redirect。普通切换不持久化表单。更新 redirect 排除规则，不改全局 401 策略。
- [x] **步骤 5 完成动画。** 风线增强与内容淡出，白叶斜向飘移翻面、卷曲阴影、减速轻回摆、目标内容淡入，完整参考约 2.6 秒。注册与登录表单不接受叶片镜像变换。转场后允许交互，减少动态时直接稳定或短淡入。复用用户已确认样片的运动方向，自主微调已确认范围内的时序。
- [x] **步骤 6 处理取消与历史。** 动画完成回调核对当前路由和本轮动画编号；路由拒绝不提交错误姿态。卸载取消动画与请求并清交接，内存冷却期限按有效期保留。清除旧身份选择状态，不使已认证会话因注册导航被机械清除。注册返回失败时不丢失尚未消费的用户名交接。
- [x] **步骤 7 联合验证并提交。** 任务 1 至 3 单元测试通过；新增 mock e2e `should_register_without_email_and_return_to_username_login`、`should_register_with_email_and_preserve_leading_zero`、`should_keep_scene_during_navigation_and_history`、`should_share_ip_limit_across_auth_pages`，断言请求、URL、表单、节点身份与焦点。执行 `npm run test:e2e -- e2e/registration.spec.js` 和 lint，通过后提交 `feat: 接入登录注册导航与共享树叶翻面`。

## 任务 4 全面回归、视觉复核与审核交付

**接口** 使用现有 npm scripts 与 Playwright webServer 配置，继续由运行器启动 4173。测试中复用现有 fixtures，不访问真实业务后端。修改测试选择器时保留原行为断言，标题移出 LoginView 后仍需参与几何测量。

- [x] **步骤 1 补齐关联回归。** 将登录 e2e 标题选择器指向实际公共标题，保留三登录方式、管理员 USER/ADMIN、401 语义、会话恢复、IME、防重复与错误恢复断言。测试侧未来找回密码容量探针保留，已有注册文字探针改为断言真实 RouterLink，禁止向已有入口重复注入导航文本。
- [x] **步骤 2 检查完整视觉矩阵。** 补 1440×900、1920×1080 注册容量与两端浮动标签、密码显隐、真实标签点击。对白叶左右姿态用实际填充轮廓测几何中心相对视口中线 12% 落点，不能只用 SVG 容器 left 值证明。验证两页竖排内容和位置、小叶片真实可见、标题同行，以及长恢复文案与矮视口的整页可达。
- [x] **步骤 3 动态和浏览器实测。** 实际播放并查看完整双向动画，保存必要关键帧或视频，检查中途无文字镜像、背景闪烁和机械直线压扁。减少动态、快速历史导航、键盘焦点同步检查。记录浏览器自动填充、200% 实际缩放的已执行证据，物理手机软键盘无设备则如实记未验证。
- [x] **步骤 4 全量命令验证。** 顺序执行 `npm ci`、`npm run check`、`npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html`、`npm run test:e2e`。依赖或 Windows 文件占用按实际原因处理，记录命令、退出码、通过／失败／跳过／重试及构建提示，不能以未启动用例代替通过。
- [x] **步骤 5 逐文件核对覆盖率。** 对 auth.js、authFlow.js、useRegistration.js、RegisterForm.vue、RegisterView.vue、AuthScene.vue、useAuthSceneTransition.js、useLogin.js、LoginView.vue、LoginForm.vue、redirect.js、errors.js 及实际新增逻辑源文件列完整行／分支比例。router/index.js 等配置或纯声明逐文件给出排除理由与导航替代验证。任何业务文件未达 80%／70% 则补有效行为用例并重跑。
- [x] **步骤 6 完成功能文档。** registration.md 记录接口 Method+Path、公开权限、字段行为表、关键组合、错误与结果未知、生命周期、安全交接、视觉决定、实际测试及限制。login.md 仅更新关联变化；本计划记录实际完成项、截图与报告位置。
- [x] **步骤 7 自检并提交审核材料。** 执行 `git diff --check`、格式检查、链接存在检查和敏感信息检查，逐项按 AGENTS.md 第九节列变更、校验依据、实际验证、逐文件覆盖率、Git 基线和 NOTE-001/002 处置。显式提交本任务文件，提交 `docs: 记录注册流程与翻面验证`。等待 Claude 对实现切片独立审核，accepted 后由人类决定推送。

## 计划自审与当前状态

### 2026-11-08 首轮实现审核修订计划

沿用已确认设计与原任务授权，本轮由 Codex 在当前工作区执行，交付第二轮审核材料。

- [x] 核对 main/d703934、交接 PH-20261107-auth01-01 与首轮审核原文。
- [x] 在 AuthScene.spec.js 使用真实 Router 复现准备期后继导航、同路由 push/replace，保留明确拒绝导航用例。初次运行 2 通过、3 失败。
- [x] 修改 AuthScene.vue 的导航归属和失败恢复，useAuthSceneTransition.js 放行被取代的准备等待，由 Router 判断取消。重点检查迟到失败、明确拒绝、异常、卸载及减少动态。
- [x] NOTE-001 在 e2e/login.spec.js 加真实注册链接轮廓检查。NOTE-002 在 authFlow.js 读取时惰性忽略过期期限，并在写入动作清理过期项，authFlow.spec.js 验证倒计时及更新。
- [x] 全量回归复现验证码过渡提前清理，RegisterForm.vue 改为等待实际动画完成并留一帧分发事件，保留 180ms CSS 时长。RegisterForm.spec.js 增加真实 Transition 的完成／取消用例，浏览器原有事件与几何断言连续 3 次通过。
- [x] 执行 npm ci、check、完整文件覆盖率和全量 e2e，更新 registration.md 的四项复核与第二轮审核材料。最终 Vitest 297 条、Playwright 66 条全部通过，逐文件覆盖率达标。PROJECT_STATE.md 单列为交接记录，本轮 11 文件为未提交工作区增量，待第二轮独立审核。

已对照设计 §1–8 检查任务覆盖。NOTE-001/002 在任务 2、3 各有明确实现及验证，容量门槛前置于任务 2。共享接口名称、返回值和任务间依赖一致，五项重点风险均有归属用例。

计划已获人类确认并执行。复选框表示对应交付及最终验证完成，具体命令、顺序差异和失败修正见下方执行记录。实现尚待 Claude 独立审核。

### 实际执行记录

- 任务 1 提交为 `2201666`，公开调用和共享状态红测后 32 条通过。useRegistration 缺失模块的红测也已运行；部分表单、场景和动画用例在初版实现后补齐，执行顺序未完全采用逐项先红后绿，不伪称这些用例都观察过初始红测。
- 任务 2 的手机容量先于完整翻面实现验证。320／390 手机及 1366 桌面初次失败后，通过标题和叶片调整达到一屏。任务 2、3 共用场景代码，合并为 `9e8b9cd`，保持提交中依赖完整。最后的验证码展开与异常兜底为 `4401b3b`。
- 截图复核额外发现两行错误与下一浮动标签贴近，补 12px 安全间隔，通过压缩顶部及辅助说明留白容纳。五视口均检查两行字段错误、两行原错误及发码通知、真实导航、叶片稳定和 SVG 轮廓包含，错误与下一标签至少相隔 2px。
- 验证码展开改为独立 Transition，180ms 高度／透明度过渡保留 220ms 清理窗口，离场字段 inert。新增浏览器 transitionrun／transitionend 及起止高度断言，曾真实失败后修复，主叶尺寸全程稳定。
- npm ci 最终退出 0，307 包、7 项中危审计提示。npm run check 退出 0，18 文件 288 条测试通过，构建成功。覆盖率命令 288 通过、0 失败／跳过／todo，逐个业务文件达到 80%／70%。完整 Playwright 为 63 通过、0 失败／跳过／重试，原 51 条登录行为回归保留。
- 原生自动填充事件 1 次，失焦标签相对输入上边框 0px；真实 200% 缩放为 672×401 CSS 视口、页面高 759px，完整五字段底部链接可通过键盘访问；双向翻面完整播放、录制并查看关键帧。物理手机软键盘、Firefox／Safari 和真实后端未执行。
- [注册功能文档](../../features/registration.md)包含字段表、关键组合、实际文件清单、失败过程、逐文件覆盖率和验收产物位置。[登录功能文档](../../features/login.md)仅同步当前关联变化。
- 业务源码后未升级依赖或改写人类 API、主题、样例和审核协议。源码及文档按指定文件提交，待 Claude 对实现独立审核，推送由人类决定。

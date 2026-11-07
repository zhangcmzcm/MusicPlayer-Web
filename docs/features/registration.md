# 注册与共享树叶翻面

## 1. 目标、边界与基线

AUTH-01 提供用户名注册，邮箱选填，提供确认密码、REGISTER 邮箱发码、登录注册双向链接和共享白叶翻面。手机登录和注册顶部均为品牌与主标题同行，保留浮动标签、三个装饰叶片和背景风线。

找回密码、资料、再次验证、邮箱变更、歌曲列表、全局 401 重构及依赖升级属于其他切片。找回密码入口随完整业务接入。

设计基线为 `847840c` 的[注册设计](../superpowers/specs/2026-11-07-registration-design.md)，设计审阅 accepted，第 1/3 轮。实施按[注册计划](../superpowers/plans/2026-11-07-registration.md)推进，实现切片待独立审核。

## 2. 路由、接口与权限

登录 `/login`、注册 `/register` 为持续存在的 AuthScene 下的懒加载子路由。直接访问任一路由显示稳定姿态，导航及浏览器历史切换共用同一主叶节点。

| 接口                         | 用途与契约                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------- |
| POST /api/v1/auth/register   | 公开注册，201 创建完成，角色固定 USER，见[注册用户](../api/auth/register-user.md) |
| POST /api/v1/email/send-code | purpose 为 REGISTER 的公开邮箱发码，见[发送验证码](../api/email/send-code.md)     |

请求均经 src/api/auth.js 和统一 http 封装，publicRequest 禁止注入业务 Bearer。成功响应不包含登录会话，注册流程不创建或提升会话权限。已有登录密码、管理员 Ticket 与 sessionStorage 规则沿用原协议。

## 3. 字段与校验依据

| 字段与本次用途                            | 空、边界及非法输入行为                                                                       | 依据与测试                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| username，提交用户名、成功后预填          | 空或非法字符拒绝，3–20 位 ASCII 字母数字下划线，2/3/20/21 边界验证                           | 注册契约请求字段；useRegistration.spec.js                      |
| password，原样提交                        | 8–72 个 U+0020–U+007E 字符，禁止全空格，拒绝中文、emoji、控制字符，保留首尾空格              | 注册契约密码说明；useRegistration.spec.js                      |
| confirmPassword，本地一致校验             | 必填且完全一致，原密码改变后重校验，提交体省略                                               | 人类明确选择增加确认密码；RegisterForm.spec.js                 |
| email，选填发码与注册                     | 空字符串省略 email/code；有内容则合法邮箱且规范化后最多 120 字符，纯空白不视为未填写         | 注册及发码契约；useRegistration.spec.js、RegisterView.spec.js  |
| code，邮箱非空时的注册码                  | 必须是 6 位数字字符串，保留前导零；修改或清空邮箱清除旧码；无邮箱省略                        | 注册契约条件必填；单元及注册主流程 e2e                         |
| 发码响应 purpose、expiresAt               | 必须匹配 REGISTER 且为合法未来 UTC Instant；缺失、null、错误用途、过期时间拒绝并安全提示     | 当前操作需要用途及截止时间；auth.spec.js，复用 isFutureInstant |
| 注册成功体 id、email、userRole、createdAt | 当前流程不消费，允许缺失、null 和未知扩展，不对这些展示资料做认证级校验；以 201 确认创建完成 | 注册成功响应与设计 §3.3；auth.spec.js                          |
| Retry-After、scope                        | 复用统一安全秒数解析，缺失／非法值不猜解封时间；邮箱期限按用途及规范化邮箱隔离，IP 期限共享  | 发码限流契约及现有 http 规则；authFlow.spec.js、跨页限流 e2e   |

界面表单字段由客户端初始化为字符串，Element Plus 输入输出字符串。API 请求校验通过后仅组装本次所需字段；后端契约中的 email/code 合法 null 等价未提供路径，界面选择省略字段。

两个密码输入各有具名按钮，可通过键盘切换显隐。实际 label 与输入唯一 ID 关联，字段错误具有独立 ID、role alert 和 aria-describedby。必填字段有星号与 aria-required，邮箱标“选填”。密码框使用 new-password 自动填充语义，验证码使用 one-time-code。

## 4. 关键组合与状态

| 条件                           | 可见结果与操作                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| 邮箱为空                       | 四字段，验证码收起，显示未绑定邮箱暂不支持自助找回的说明；仅提交 username/password                  |
| 邮箱有内容但非法               | 五字段，发送或提交前显示字段错误，不能以空白绕过配套验证码要求                                      |
| 邮箱有效、有有效码             | 可提交全部业务字段；发送仅验证邮箱，不能因其他注册字段未填而阻断发码                                |
| 修改／清空邮箱                 | 清码及旧发码反馈，取消旧请求并隔离其响应；按用途／邮箱保存的冷却及 IP 限流继续生效                  |
| 发码中或注册提交中             | 可见加载，禁止重复操作及表单编辑；导航离开可取消客户端等待                                          |
| 发码成功                       | 显示发送通知、60 秒发送冷却；通知有效期采用响应截止时间，验证码有效期不延长发码冷却                 |
| 邮箱／IP 限流                  | 按 scope 与 Retry-After 记录绝对期限；跨登录注册切换保留 IP 限流，REGISTER 邮箱限制不机械套给 LOGIN |
| 注册 201                       | 清密码与验证码，内存交接用户名，自动回登录并预填用户名密码方式，显示注册成功提示                    |
| 自动回登录被拒绝或发生路由错误 | 保留成功交接、成功提示与真实登录链接，禁用已完成注册表单，避免重复创建请求                          |
| 普通切换／刷新                 | 不保存密码、验证码或注册表单；一次性成功交接消费后清除，刷新为正常登录页                            |

安全 redirect 经 resolveSafeRedirect 校验后在双向链接中传递。login、register、认证入口重定向、未知路由和原有外站／编码非法路径均不作为登录成功回跳目标。真实业务目标在成功登录后处理。当前无默认歌曲列表路由，沿用登录既有成功落点。

## 5. 错误、恢复与生命周期

按稳定 code 映射用户名／邮箱冲突、并发账户冲突、验证码无效／已消费／错误次数达到限制，以及字段校验、限流和服务异常。界面不渲染后端原始 detail、message、字段错误或异常堆栈。发码通知可以与注册错误并存。

注册提交的全部 5xx，包括 500 INTERNAL_ERROR、503，以及断网、超时或异常成功响应，显示原安全错误和“注册结果暂未确认，可尝试登录核实”。发码阶段使用“发送结果暂未确认，请留意邮箱，并在允许发送后重试。”，不混用账户创建结果提示。客户端意外异常转换为 CLIENT_ERROR，日志仅记录统一白名单元数据。

这些提示不推断账号一定未创建或验证码一定可复用。数据库提交成功后 Redis 标记失败不会撤销用户，取消浏览器请求也无法回滚服务端行为。操作均由用户恢复，不自动重发或重放注册。

AbortController、请求序号与组件作用域隔离迟到响应，邮箱变更和卸载后不覆盖新反馈。页面清理计时器和敏感输入；跨页所需的冷却期限放在无持久化 Pinia authFlow store，过期项在访问时清理。成功交接仅内存，离开认证场景清除，不进入 URL、storage 或日志。

## 6. 构图、翻面与已确认决定

- 沿用[主题规范](../design/theme.md)与[样例](../../example/index.html)的嫩叶绿、白叶、细叶脉和字体气质。两者作为参考，不作逐像素模板。
- 登录实际叶形中心在中线左侧约 12%，注册在右侧约 12%；叶尖朝上、叶脉翻面后左倾。两页外侧竖排均用“一叶清新／一曲自在”，注册位于左侧，依据本次人类确认及设计审核 NOTE-002。
- AuthScene 统一渲染唯一主标题，手机“风与叶”与主标题同行，隐藏英文及副文案；桌面注册标题“让喜欢，就此启程”，副文案“从一片叶，遇见你的旋律。”。
- 注册桌面叶片按视口增高，手机主叶宽 950px、高 1400px、顶部 -350px；手机登录主叶宽 950px、高 1180px、顶部 -300px。叶片几何取决于视口及页面类型，邮箱展开和错误反馈不改变其尺寸。
- 输入与按钮维持 46px，字段错误保留 42px，注册相邻字段及登录两字段间增加 12px，防止两行错误与下一浮动标签重叠。注册手机表单起点 64px、底部 12px，反馈区最小 64px，辅助说明按实际内容自然占高。
- 手机完整五字段、每字段两行错误、两行常规接口反馈和一行发码通知，加真实登录链接，须在 320×740、390×844 一屏可见。长恢复说明、极矮屏、放大及软键盘展开采用自然滚动。容量文本仅由测试 DOM 注入，产品没有探针开关。
- 风线增强及旧文字淡出约 180ms，叶片飘移、斜向侧身与翻面约 2240ms，目标文字淡入约 180ms，总节奏约 2.6 秒。侧身保留可见宽度、轻微倾斜与阴影变化，表单和文字独立于叶片变换。
- 转场时表单区域 inert，离场内容不可聚焦。目标稳定后聚焦当前标题；直接打开路由显示稳定姿态，前进后退复用主叶。减少动态停用空间运动和背景循环；转场中开启时继续目标导航并稳定呈现。
- 验证码字段保留独立 180ms CSS 过渡，等实际动画完成并留一帧结束事件分发后清理样式，离场立即 inert。
- 导航被其他导航取代时，旧失败钩子不得取消新转场；明确拒绝或路由异常恢复当前路由姿态，卸载清除动画和监听。
- 准备等待被新导航接替时放行旧守卫，由 Router 判定 cancelled。场景以导航目标对象记录当前归属，迟到的旧失败或异常不复位新转场；duplicated 绕过守卫但替换待决目标，因此立即恢复当前页。后继导航只改变当前页 query 时同样结束旧准备状态。
- 三个装饰叶片节点保留，注册手机边缘采用淡绿填充，避开输入和焦点，防止白叶遮挡后不可见。

## 7. 测试与审核材料

Vitest 包括公开请求体与响应消费、内存交接、用途及 IP 限流、字段边界、确认密码重校验、旧邮箱码清理、请求取消与迟到响应、网络和服务异常、注册成功回登录、路由失败恢复、共享标题、动画清理和安全回跳。原有登录与管理员流程回归继续执行。

Playwright 使用 mock HTTP，覆盖无邮箱注册、有邮箱码注册、前导零、成功预填与刷新清交接、跨页 IP 限流、完整容量及错误与标签间距、可访问显隐按钮、共享节点与历史导航、减少动态和实际 SVG 叶形落点。原有 51 条登录测试保留，公共标题选择器及真实注册链接断言随实现更新。

注册设计的 NOTE-001 已明确为注册 5xx 结果未知处理，NOTE-002 的竖排文字已由人类确认。实现审核使用本任务独立轮次，Codex 自验不替代 Claude accepted。

## 8. 已知限制

- 业务请求自动化均为 mock，尚未进行真实 SMTP、Redis 和数据库注册联调。
- Playwright 当前仅 Chromium，Firefox、Safari 和物理手机软键盘未执行；响应式与压缩视口不能代表实机验收。
- 构建继续使用 Element Plus 全量引入，既有主分块体积提示保留。依赖安全升级属于独立任务。
- 当前邮箱发送接口采用既有 15 秒客户端超时，超时提示按结果未知处理。邮件是否送达以后端实际处理与邮箱为准。

## 9. 2026-11-07 实际验证

环境为 Node v22.19.0、npm 10.9.3。实现提交为 `2201666`、`9e8b9cd`、`4401b3b`，审核对照基线为 `main / 381ddf1`。文档随后独立提交，最终 HEAD 由提交审核材料列出。

| 实际命令                                                                                                                                       | 最终结果                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| npm ci --proxy=http://127.0.0.1:7897 --https-proxy=http://127.0.0.1:7897 --fetch-retries=1 --fetch-retry-mintimeout=1000 --fetch-timeout=20000 | 退出 0，307 包，锁文件一致，审计报告 7 项中危及既有 deprecated 提示                           |
| npm run check                                                                                                                                  | 退出 0，lint 零警告、格式通过，18 文件 288 测试通过，构建成功                                 |
| npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html                               | 退出 0，288 通过、0 失败、0 跳过、0 todo                                                      |
| npm run test:e2e                                                                                                                               | 退出 0，63 通过、0 失败、0 跳过，2 workers、0 retries，无 flaky 或预期失败                    |
| node .superpowers/registration-autofill-check.cjs                                                                                              | 退出 0，原生自动填充事件 1 次，输入匹配 :-webkit-autofill，模型含值，失焦标签中心距上边框 0px |
| node .superpowers/registration-zoom-check.cjs                                                                                                  | 退出 0，真实浏览器 getZoom 为 1／2，完整五字段下底部链接可通过键盘访问，页面无横向溢出        |
| node .superpowers/registration-motion-check.cjs                                                                                                | 退出 0，双向完整播放并录制，每方向 5 张关键帧，1440×900，已查看正反向关键帧                   |

报告来源为 `coverage/coverage-summary.json`、`coverage/index.html`、`playwright-report/index.html`。全部实际改动业务逻辑文件的完整文件覆盖率如下。

| 文件                                      | 行覆盖率 | 分支覆盖率                                            |
| ----------------------------------------- | -------- | ----------------------------------------------------- |
| src/api/auth.js                           | 94.73%   | 96.15%                                                |
| src/stores/authFlow.js                    | 100%     | 100%                                                  |
| src/components/auth/AuthScene.vue         | 100%     | 93.33%                                                |
| src/components/auth/LoginForm.vue         | 96.49%   | 88.67%                                                |
| src/components/auth/RegisterForm.vue      | 89.58%   | 89.13%                                                |
| src/composables/useAuthSceneTransition.js | 100%     | 87.5%                                                 |
| src/composables/useLogin.js               | 96%      | 88.11%                                                |
| src/composables/useRegistration.js        | 100%     | 97.1%                                                 |
| src/utils/errors.js                       | 100%     | 90.9%                                                 |
| src/utils/redirect.js                     | 100%     | 100%                                                  |
| src/views/login/LoginView.vue             | 100%     | 97.22%                                                |
| src/views/register/RegisterView.vue       | 100%     | 100%                                                  |
| src/router/index.js                       | 100%     | 不适用，0 个可执行分支，路由声明以真实导航和 e2e 验证 |

业务逻辑文件均达到行 80%／分支 70%，无需例外申请。测试和文档不计入业务源码覆盖率。全仓行 97.51%（705/723）、分支 92.29%（527/571）仅作补充。RegisterForm 的 DOM 过渡准备方法通过浏览器完整展开／收起断言验证，未以 e2e 数据冒充单元覆盖率。

验证码区使用稳定的独立 Transition，实际高度／透明度过渡为 180ms，显式保留 220ms 清理窗口，离场字段 inert。浏览器用例记录 transitionrun／transitionend、起止高度及主叶不变，防止只有淡入但高度跳变，或样式提前清理。独立过渡替代初版 TransitionGroup，归因以浏览器观测为准。

缩放实测在 100% 时为 1344×802 CSS 视口、DPR 1，在 200% 时为 672×401、DPR 2、visualViewport.scale 1，页面高 759px，可滚动且底部链接获得焦点。使用浏览器 tabs.setZoom／getZoom，没有用 CSS zoom 或 deviceScaleFactor 冒充。

临时脚本、视频、截图均位于被忽略的 `.superpowers/` 或测试产物目录，未作为产品依赖或提交内容。视频为 `.superpowers/registration-motion.webm`，容量截图位于 `test-results/registration-should-fit-registration-capacity-<宽度>-chromium/registration-capacity.png`。浏览器轮廓断言使用实际 path 与屏幕变换，错误块与下一浮动标签的间隔至少 2px。

### 执行过程中的失败与修正

- API 红测为 10 失败／17 通过，另有 store 文件缺失导致套件无法导入，补齐实现后 32 条通过。useRegistration 初始红测为模块缺失，随后校验和请求测试通过。其余部分组件、场景与动画测试在初版实现后补齐，未声称全部逐项先红后绿。
- 第一次完整单元运行 13 失败／234 通过，原因是旧 LoginView 测试 fixture 没有 register 路由，且标题已转入共享场景。改为真实场景挂载和完整测试路由后，原 13 条继续通过。确认密码错误文字的初次组件断言 1 失败／2 通过，改为等待真实 Element Plus 校验呈现后通过。
- 初次注册浏览器 3 失败／1 通过，发现手机按钮超出叶形、桌面高度溢出；修正叶片几何、标题换行和顶部留白。首次全量 55 条中 3 失败／52 通过，发现 390px 登录错误超出白叶，已修正手机主叶几何。
- 新增注册联调 10 条中 2 失败／8 通过，一项为减少动态设置变化取消待完成导航，已改为继续目标导航；另一项为确认密码为空时显隐图标尚未出现，测试按真实可见条件填值后验证键盘操作。
- 截图复核发现两行错误贴近下一浮动标签，增加 12px 字段安全间隔并调整其他留白，补充真实间隔断言。随后 1440px 轮廓检查 1 失败／4 通过，修正注册叶片随视口增高的规则后，五视口均通过。
- 新增验证码高度过渡用例曾连续失败，观察到 transitionrun 而缺少 transitionend，样式被提前清理。独立 Transition 与 220ms 清理窗口使 180ms CSS 过渡完整结束，保留起止事件与几何断言后，最终全量 63 条通过。
- 最初在沙箱内运行浏览器时，本地套接字报访问权限错误，用例未启动，记环境阻断。终止该等待后按工具审批在沙箱外运行，最终完整测试已实际执行，未将环境阻断计作 skipped。

实现过程中的所有失败均已回归，最终无失败、跳过、重试或 todo。物理手机软键盘、Firefox／Safari 和真实后端联调仍为本节所列未验证项。

## 10. 实际变更清单与审核状态

- API 与共享内存状态共 4 文件，src/api/auth.js、auth.spec.js、src/stores/authFlow.js、authFlow.spec.js。
- 认证场景及表单共 6 文件，src/components/auth/AuthScene.vue、AuthScene.spec.js、LoginForm.vue、RegisterForm.vue、RegisterForm.spec.js，以及 src/composables/useAuthSceneTransition.js；对应动画测试为同目录 useAuthSceneTransition.spec.js。
- 注册与登录私有流程共 3 文件，src/composables/useRegistration.js、useRegistration.spec.js、useLogin.js。
- 视图共 4 文件，src/views/register/RegisterView.vue、RegisterView.spec.js、src/views/login/LoginView.vue、LoginView.spec.js。
- 路由与安全错误共 4 文件，src/router/index.js、src/utils/redirect.js、redirect.spec.js、errors.js。
- 浏览器测试共 2 文件，e2e/login.spec.js、e2e/registration.spec.js。
- 文档共 3 文件，docs/features/registration.md、docs/features/login.md、docs/superpowers/plans/2026-11-07-registration.md。

以上为 27 文件。初版注册与动画共用 AuthScene，任务 2、3 的运行代码合并提交，避免拆出缺失依赖的中间版本；最后的异常与展开修正独立提交。现有 authScene.js 注入 key、LoginForm.spec.js 和 e2e/fixtures.js 已足够复用，实际未修改。

首次实现审核为 needs_revision，本轮提交第 2 轮实现审核。设计 accepted 与实现审核分别计数。设计 NOTE-001 的 500 分类与 NOTE-002 的竖排文案已落实。实现首轮反馈及本轮证据见下节。

## 11. 2026-11-08 第二轮实现审核材料

任务类型为业务切片，继续 AUTH-01 注册与共享树叶翻面。路由为 /login、/register。本轮修订首轮导航竞态、两项非阻断建议及验证码过渡关联回归，范围外功能见第 1 节。

### 版本与恢复核对

已核对交接编号 PH-20261107-auth01-01、main/d703934daf0d4fb8fd4a4a6288dd0a92f442541b、首轮审核原文及现行 AGENTS.md。恢复前工作区仅未跟踪 PROJECT_STATE.md。首轮完整报告保存于本机忽略目录 `.superpowers/handoff/PH-20261107-auth01-01/claude-review-round-1.txt`，跨机器复核需携带该副本。

本轮审核增量为 d703934 后的工作区改动，完整实现仍以 381ddf1 为对照基线。PROJECT_STATE.md 单列为用户要求恢复的交接材料。第二轮实质审核由 Claude 开始检查实现时计入，目前为提交待审。

本轮全量回归还复现同一注册切片的验证码过渡提前清理，因此关联增加 RegisterForm.vue 与 RegisterForm.spec.js。原断言与 180ms CSS 时长继续使用，改以元素实际 Animation.finished 完成时机清理，属于验证过程中发现的关联修复。

### 需求、权限与视觉

需求、公开注册权限及接口见第 2–5 节。视觉复用已确认注册设计 §4–5、theme.md 与 example/index.html 的配色气质，本轮复用原布局、动效与焦点规则。修复沿用原生浏览器动画和现有依赖。

### 审核反馈复核与处置

| 问题编号／原分级 | 问题是否成立与证据                                                                                         | 分级是否合理及依据                                                   | 修改方向是否合适                                                                            | 处置／替代方案                                                                                     | 验证与待复核事项                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| BLOCK-001        | 成立。真实 Router 在准备期再次 push 注册目标，原版后继导航被丢弃，首个失败也非 cancelled。新增用例初次失败 | 认可阻断。直接影响设计 §5.2 与第 6 节的导航取代行为                  | 认可放行旧 prepare 与隔离旧回调方向。单独无条件复位会再次干扰新转场                         | 已实现放行旧等待、beforeEach 记录导航对象归属、失败及 onError 按对象身份复位，并在卸载清钩子       | AuthScene.spec 后继导航、旧异步守卫迟到拒绝／抛错、当前导航异常／明确拒绝；浏览器检查实际最终路由与可操作状态。提请 Claude 核实关闭 |
| BLOCK-002        | 成立。同路由 push、replace 两个新增用例在原版均残留 scene-transitioning                                    | 认可阻断。触发后表单不可见不可操作，当前 UI 缺少触发点已按原审核记录 | 认可对无承接导航的失败恢复。Router 源码确认重复导航先替换 pendingLocation 且跳过 beforeEach | duplicated 钩子恢复当前路由，记录其导航归属以隔离旧回调。当前页仅 query 改变的后继导航也清理旧准备 | 真实 Router 的 push／replace 及 query 后继用例，浏览器两种重复导航检查 opacity、inert、焦点和输入。提请 Claude 核实关闭             |
| NOTE-001         | 成立。登录轮廓选择器原先缺少真实注册链接                                                                   | 认可非阻断。容量测试已含链接，补充后两侧轮廓口径一致                 | 认可，小范围补充选择器即可                                                                  | 已将 .account-navigation-space a 纳入 leafOverflow                                                 | 原登录所有视口及三登录方式的轮廓回归继续执行                                                                                        |
| NOTE-002         | 成立。sendRemaining 在 computed 读取期间删除响应式 Map 项                                                  | 认可非阻断。原功能可运行，问题在读取副作用                           | 采用惰性忽略过期项，并在 recordSend 写入时按 Date.now 清理过期项，保留内存容量回收          | 已实现读取纯计算及写入清理。既有合成时间测试改用固定系统时钟，使写入与读取一致                     | 新用例验证读取其他时间点不更改已有 computed 依赖、过期归零及下一次写入；既有用途、邮箱与 IP 隔离回归                                |

阻断项当前均为已实现修复、待审核方核实，Codex 自验不构成 accepted。

### 校验谓词与关键组合

本轮修改依据属于客户端运行规则，来源为设计 §5.2、第 6 节和 AGENTS.md 第六节生命周期规则。业务字段对照沿用第 3 节，本轮新增输入为内部 Router 导航对象与失败形态，使用对象身份而非 URL 文本判断归属。缺失失败对象表示导航成功，aborted／cancelled 表示导航失败，duplicated 表示重复导航；普通异常由 onError 处理。对象由 Router 提供，非法外部字段形态不进入这些钩子。

| 组合或判断                    | 行为与依据                                              | 自动化证据                                                                                        |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 新准备取代旧等待              | 放行旧等待，由 Router 的 pendingLocation 判断 cancelled | AuthScene.spec should_complete_successor_navigation_during_preparation                            |
| 旧失败／异常 × 新导航准备中   | 目标对象不同，忽略旧回调                                | AuthScene.spec should_ignore_late_reject／throw_from_replaced_navigation                          |
| 当前导航明确拒绝／异常        | 恢复当前路由、解除 inert 并聚焦标题                     | AuthScene.spec should_restore_interaction_after_navigation_is_rejected／current_navigation_throws |
| 重复 push／replace × 旧准备中 | 重复导航取代旧目标，恢复当前页                          | AuthScene.spec 两条同路由用例；registration.spec 三条导航恢复用例中的两条                         |
| 当前页 query 后继 × 旧准备中  | 清理旧准备，即使 route.name 未改变也恢复                | AuthScene.spec should_restore_interaction_when_successor_only_changes_current_query               |
| sendRemaining 读取过期期限    | 返回 0，保留响应式数据，读取不产生删除副作用            | authFlow.spec should_read_expired_deadlines_without_mutating_computed_dependencies                |
| recordSend 写入 × 已过期期限  | 按当前系统时间清理，仍有效同邮箱期限取较大值            | authFlow.spec 新用例及 should_retain_EMAIL_COOLDOWN／EMAIL_DAILY_LIMIT_for_original_email         |

源码核对使用已安装 vue-router/dist/vue-router.mjs 的 pushWithRedirect、navigate、guardToPromiseFn、pendingLocation 及失败分类。新增浏览器用例仅在测试侧取得应用 Router 并观察 scene-transitioning，保证后继操作发生在真实准备期。

验证码字段进入／离开均等待根元素动画完成或取消，再留一帧分发结束事件后清理，减少动态时无动画也可完成。依据为设计 §4.2 的平滑展开收起及客户端动画生命周期。RegisterForm.spec 的 should_keep_transition_styles_until_actual_animation_finishes 控制真实 Transition 的动画完成与取消，浏览器保留 transitionrun／transitionend、高度、主叶稳定及减少动态断言。

### 本轮变更文件

- src/components/auth/AuthScene.vue，导航归属、失败／异常恢复及钩子卸载。
- src/composables/useAuthSceneTransition.js，被取代等待放行、当前页 query 后继清理。
- src/stores/authFlow.js，读取纯计算与写入清理。
- src/components/auth/RegisterForm.vue，验证码过渡依据实际动画完成时机清理。
- src/components/auth/AuthScene.spec.js，真实 Router 竞态与失败恢复。
- src/stores/authFlow.spec.js，固定时钟与读取纯计算回归。
- src/components/auth/RegisterForm.spec.js，真实 Transition 下控制动画完成／取消，断言样式保留和离场 inert。
- e2e/login.spec.js，真实注册链接轮廓检查。
- e2e/registration.spec.js，准备期后继导航及同路由 push／replace 的真实浏览器恢复检查。
- docs/superpowers/plans/2026-11-07-registration.md，本轮修订计划与执行记录。
- docs/features/registration.md，四项意见复核、行为与验证材料。

PROJECT_STATE.md 为独立交接记录，恢复时已存在且未跟踪。测试报告、截图和依赖目录均为忽略产物。

### 本轮实际验证与过程记录

环境为 Node v22.19.0、npm 10.9.3，Chromium mock HTTP，Playwright 2 workers、0 retries。

- `npm ci --proxy=http://127.0.0.1:7897 --https-proxy=http://127.0.0.1:7897 --fetch-retries=1 --fetch-retry-mintimeout=1000 --fetch-timeout=20000` 最终退出 0，307 包，锁文件一致，7 项中危审计提示及既有 deprecated 提示。沙箱内首次因 mkdir EPERM 失败，经工具审批在沙箱外重跑通过。
- `npm run check` 最终退出 0，lint 零警告、格式通过、Vitest 18 文件 297 通过／0 失败／0 跳过／0 todo，生产构建通过。主分块大于 500kB 的既有提示保留。
- `npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html` 退出 0，297 通过／0 失败／0 跳过／0 todo。全仓行 98.09%、分支 92.52% 仅为补充。
- `npm run test:e2e -- e2e/registration.spec.js --grep should_recover_preparation` 退出 0，三条新增导航恢复用例 3 通过／0 失败／0 跳过。
- `npm run test:e2e -- e2e/registration.spec.js --grep should_expand_code_area_without_resizing_leaf --repeat-each=3` 最终退出 0，验证码过渡 3 通过／0 失败／0 跳过。

覆盖率来源为本次生成的 coverage/coverage-summary.json 与 coverage/index.html。以下为完整 AUTH-01 任务业务源码的完整文件口径，本轮实际修改的四个源码文件均达标。

| 文件                                      | 行覆盖率 | 分支覆盖率                                                |
| ----------------------------------------- | -------- | --------------------------------------------------------- |
| src/api/auth.js                           | 94.73%   | 96.15%                                                    |
| src/stores/authFlow.js                    | 100%     | 100%                                                      |
| src/components/auth/AuthScene.vue         | 100%     | 100%                                                      |
| src/components/auth/LoginForm.vue         | 96.49%   | 88.67%                                                    |
| src/components/auth/RegisterForm.vue      | 98.18%   | 88.63%                                                    |
| src/composables/useAuthSceneTransition.js | 100%     | 87.5%                                                     |
| src/composables/useLogin.js               | 96%      | 88.11%                                                    |
| src/composables/useRegistration.js        | 100%     | 97.1%                                                     |
| src/utils/errors.js                       | 100%     | 90.9%                                                     |
| src/utils/redirect.js                     | 100%     | 100%                                                      |
| src/views/login/LoginView.vue             | 100%     | 97.22%                                                    |
| src/views/register/RegisterView.vue       | 100%     | 100%                                                      |
| src/router/index.js                       | 100%     | 不适用，0 个可执行分支，纯路由声明通过真实导航与 e2e 验证 |

本轮测试与文档排除业务逻辑覆盖率统计，未申请例外。

过程中的失败与补充如下。

- 新增真实 Router 三条竞态红测实际运行，2 通过／3 失败。should_complete_successor_navigation_during_preparation 未得到 cancelled，同路由 push／replace 均残留 scene-transitioning。修复后定向 20 条通过，随后补当前 query 后继导航用例，最终全量 296 条通过。
- 冷却清理移至写入后，should_retain_EMAIL_COOLDOWN_for_original_email 和 should_retain_EMAIL_DAILY_LIMIT_for_original_email 因合成期限与真实系统时间不一致失败，定向为 14 通过／2 失败。将 store 测试系统时钟固定在其合成时间后通过，保留期限不得缩短的原断言。
- 沙箱内首次 e2e 未启动用例，测试服务器未监听 4173，手动终止后按工具审批在沙箱外执行，记未执行／环境阻断。
- 浏览器首次实际全量 64 通过／2 失败。should_recover_preparation_when_navigation_is_push／replace 在懒加载 AuthScene 挂载前 observe(null) 抛 TypeError，补场景可见性等待后定向 3 条通过。
- 新增当前异常、迟到拒绝／异常、当前 query 后继、store 纯读取及浏览器竞态测试是在初次修复后补齐，未声称这些测试均观察过修复前红测。
- 随后全量 65 通过／1 失败，既有 should_expand_code_area_without_resizing_leaf 只捕获 transitionrun。原实现定向重跑 1 失败；改用 Vue 默认 CSS 结束检测后连续 3 次失败，补充时序采集又失败 1 次，捕获到约 183ms 时移除 active 样式并触发 transitioncancel。最终改为等待根元素 getAnimations() 的 finished，全部完成或取消后再留一帧分发结束事件。原浏览器断言连续 3 次通过，组件定向 4 条通过。第 9 节的 220ms 清理窗口为首次实现版本记录，本轮已由实际完成检测替代。

第 8 节的跨浏览器、物理手机与真实后端验证边界继续适用。必要环境问题与过程失败均如上记录，最终全量浏览器结果在本节末单列。

最终 `npm run test:e2e` 退出 0，66 通过／0 失败／0 跳过／0 重试，无 flaky 或预期失败，包括 51 条登录回归与 15 条注册用例。报告为 playwright-report/index.html，原有 63 条全部保留。最终 git diff --check、Prettier 与文档链接检查通过，4173／5173 均无监听。本轮 11 个已跟踪文件为未提交工作区增量，另有 PROJECT_STATE.md 交接记录。提交第 2 轮审核，等待 Claude 核实问题关闭及人类决策。

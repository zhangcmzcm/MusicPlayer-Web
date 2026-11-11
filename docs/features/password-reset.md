# 找回密码与登录入口

## 1. 目标、范围与基线

AUTH-02 交付独立 `/forgot-password` 页面，覆盖真实邮箱申请、独立验证码校验、票据改密、成功回登录预填，以及密码登录方式的“忘记密码？”入口。USER 与 ADMIN 使用公开流程，管理员重新登录后沿用角色选择。

范围外包括账户中心、已登录主动改密、换邮箱、其他身份恢复方式、注册与共享翻面改版、依赖升级和全局 HTTP 重构。

设计见[找回密码设计](../superpowers/specs/2026-11-09-password-reset-design.md)，原设计第 1 轮 accepted。2026-11-11 正式契约齐全后按用户授权补充第三步规则并实施，计划见[执行计划](../superpowers/plans/2026-11-11-password-reset.md)。实现为独立首轮审核交付，设计审核与实现审核分别记录。

契约更新已单独提交并推送 origin/main，提交为 `730f3cd`。前端改动基于其后的本地设计提交，源码与文档由本轮审核材料列出最终提交位置。

## 2. 路由、接口与权限

`/forgot-password` 为独立懒加载路由，登录页 EMAIL_PASSWORD、USERNAME_PASSWORD 在密码框下方提供 RouterLink。安全站内 redirect 经现有工具解析并传递，登录后的回跳目标排除找回密码等认证路由。

| 接口                                            | 输入与成功结果                                   | 契约                                               |
| ----------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| POST /api/v1/users/password-reset-requests      | email，202 返回 challengeId/expiresAt            | [申请](../api/user/request-password-reset.md)      |
| POST /api/v1/users/password-reset-verifications | challengeId/code，200 返回 resetTicket/expiresAt | [验证码校验](../api/user/verify-password-reset.md) |
| POST /api/v1/users/password-resets              | resetTicket/newPassword，204 完成                | [票据改密](../api/user/confirm-password-reset.md)  |

三个接口均经过 src/api/passwordReset.js 及现有 publicRequest。公开调用按各接口 code 呈现失败，资源与凭据授权由后端绑定判定。成功消费旧验证码后仅暂存设置密码票据，改密成功后重新登录。

## 3. 用户已确认的视觉与交互

- A 居中留白，白色或浅暖白底，嫩叶绿主题用于进度、按钮与链接。品牌、返回登录位于页眉，主体桌面约 410px，手机保留左右留白。
- 桌面与手机均在顶部显示“验证邮箱 → 设置新密码”。首步包含邮箱输入及验证码输入两个状态，默认从邮箱输入开始。
- 申请使用完整规范化邮箱，受理后展示脱敏邮箱与统一条件式提示“若该邮箱已绑定账号，你将收到验证码”。短本地部分使用完整掩码，较长本地部分保留首尾各两个字符。
- 用户可修改邮箱、重新获取、重新验证。修改邮箱清理旧流程凭据，下一次申请由用户主动发起。
- 验证失败保留输入，校验结果未知引导重新申请。刷新或离开清理敏感流程数据。
- 成功返回登录，切至邮箱密码方式、预填本次邮箱、密码留空并显示成功提示。导航失败时保留成功交接、提示和真实返回链接。
- 标签与输入关联，错误关联到对应字段，密码显隐支持键盘。阶段切换聚焦标题，长反馈及矮屏采用自然滚动。

配色气质来自[主题](../design/theme.md)与[样例](../../example/index.html)，本次布局决定来自设计第 9 节及用户逐节确认。已查看 320px、1440px 的实际错误态截图，五种视口均有浏览器断言。

## 4. 字段行为与校验依据

下表覆盖本次影响行为的字段。业务输入依据 API 契约，确认密码依据已确认产品规则，凭据消费和响应异常恢复依据契约与客户端运行规则。

| 字段                | 客户端用途与规则                                       | 缺失／null／边界／非法行为                                                     | 自动化证据                                       |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| email               | trim、小写，合法单邮箱，最多 120 字符；申请及成功预填  | 空或非法格式、超长本地拦截。表单控件产生字符串，API 请求仅包含 email           | usePasswordReset.spec 的邮箱边界；浏览器精确请求 |
| code                | 六位 ASCII 数字字符串，保留前导零及原值                | 空、5/7 位、全角数字拒绝；普通验证失败保留输入                                 | usePasswordReset.spec、完整 e2e 的 012345        |
| newPassword         | 8–72 个 U+0020–U+007E，非全空格，原样提交              | 7/8/72/73、制表符、中文、全空格覆盖；首尾空格保留                              | 规则参数化与精确请求体                           |
| confirmPassword     | 必填并与 newPassword 完全相同，仅本地校验              | 空或不同拒绝，新密码修改后重新校验                                             | 流程规则与真实表单测试                           |
| challengeId         | 从 202 取出，43 字符规范 Base64URL，供验证码校验       | 缺失、null、非字符串、长度错误、末位非规范编码按 INVALID_RESPONSE 结果未知处理 | passwordReset.spec 的响应形态矩阵                |
| resetTicket         | 从 200 取出，同一规范编码，供最终改密                  | 缺失、null、非法类型或编码拒绝，校验可能已消费验证码，进入重新申请恢复         | API spec 与流程结果未知用例                      |
| expiresAt           | UTC ISO-8601，复用 isFutureInstant，申请与票据分别管理 | 缺失、null、非法或已过期响应按结果未知处理；等于期限时阻断新兑换／提交         | API、流程与浏览器过期测试                        |
| 202／200 的扩展字段 | 当前功能仅消费标识和期限                               | 安全忽略未知扩展字段                                                           | API success fixture 的 extension                 |
| 204 响应体          | 依据状态确认完成                                       | 接受空正文，忽略与当前操作无关的响应体                                         | API 204 用例与浏览器 happy path                  |
| Retry-After         | 复用 HTTP 层安全整数秒解析                             | 缺失或非法时保留服务端错误反馈，合法值记录截止时间；根据最新系统时间恢复按钮   | HTTP 既有回归、流程独立期限用例                  |

规范 Base64URL 的 32 字节标识对应 43 字符，末字符编码下标须为 4 的倍数，API 使用该规范消费判断。INVALID_RESPONSE 复用现有客户端错误类型。源字符串和凭据值均经 API 字段用途限定，日志仅记录安全错误码与状态。

## 5. 关键组合与恢复策略

| 条件                                        | 行为                                                                            | 依据／用例                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 申请 202 × 存在或未知账号                   | 同一界面提示，进入验证码阶段                                                    | 申请契约；e2e happy path                              |
| 请求中 × 修改邮箱／卸载                     | AbortController 取消等待，操作序号隔离迟到结果，敏感输入清理                    | 客户端生命周期；两个迟到响应单元用例                  |
| 验证 400 PASSWORD_RESET_VERIFICATION_FAILED | 保留验证码，允许检查或主动重新申请，按统一错误码反馈                            | 校验契约；单元与浏览器                                |
| 验证 TIMEOUT／网络／5xx／响应异常           | 清理 challengeId/code，提示重新申请                                             | 已消费结果可能未知；流程与接口测试                    |
| 申请结果未知                                | 留意邮箱并等待 60 秒后主动重新申请                                              | 申请契约的扣额及未知副作用；流程 unknown request 用例 |
| 申请 429 × 无 scope                         | 按整体 Retry-After 保存等待；同邮箱与整体等待取最大值，切换邮箱继续等待整体期限 | 设计审核 NOTE-002；独立限流测试                       |
| 校验与完成 429                              | 分别保存窗口，使用各自错误族及 Retry-After                                      | 两契约；三个 operation 参数化用例                     |
| NEW_PASSWORD_SAME_AS_OLD                    | 保留密码输入与票据，允许修改后重试，原期限持续有效                              | 改密契约；单元与浏览器                                |
| 最终统一验证失败                            | 清票据、密码，显示重新验证入口                                                  | 改密契约；单元与浏览器                                |
| 本地票据已过期 × 尚未发送                   | 禁用提交、清敏感数据，提供重新验证入口                                          | UTC 客户端期限；单元及浏览器                          |
| 请求已发出 × 本地期限到达                   | 等待后端结果，204 仍成功                                                        | 契约允许消费后跨到期提交；跨期限用例                  |
| 最终结果未知                                | 清票据及密码，提示使用新密码登录核实，提供返回登录及重新申请                    | 改密契约；单元及浏览器                                |
| 最终成功或未知 × 旧会话仍属于原操作         | auth store 核对操作代际、session 与 roleSelection 引用后清理旧会话              | 会话清理契约与客户端运行规则                          |
| 最终迟到响应 × 已建立新会话／新角色票据     | 保留新状态，旧操作仅完成自身流程                                                | 新会话与角色票据回归                                  |
| 204 × 登录导航失败                          | 完成态及交接保留，真实链接可继续登录，表单提交已结束                            | 页面恢复规则；拒绝／抛错两个用例                      |
| 返回登录 × 一次性交接                       | 仅预填邮箱与成功提示，消费后清理，刷新按普通登录                                | 用户确认；真实 Router 与 e2e                          |

整体无 scope 的等待采用保守的共享期限，避免把服务端邮箱等待遗漏。第二、三步额度分别计算，登录和注册的发送期限由既有用途继续管理。上述客户端等待由服务端额度最终裁决。

## 6. 测试与验证

单元覆盖 API 请求与响应消费、字段边界、阶段切换、冷却与限流、已消费与未知结果、防重复、修改邮箱、卸载和迟到响应、到期边界、旧会话保护、导航恢复、真实表单及登录回填。浏览器新增 12 条，覆盖完整主流程、失败恢复、刷新、到期及五种布局。

报告来源为 coverage/coverage-summary.json、coverage/index.html 与 playwright-report/index.html。业务 HTTP 使用 mock。各命令最终结果在本节末记录，截图位于 test-results/password-reset-should-show-centered-form-and-errors-<宽度>-chromium/password-reset-layout.png。

### 实际过程中的失败与修正

- API 初次红测为模块缺失，1 个套件失败、0 用例执行。补齐模块后 API 15 条通过。
- 首次完整 Vitest 11 失败／303 通过，9 个未处理错误均与注册测试 Router fixture 缺少新命名路由有关。补齐原 fixture 的 forgot-password 声明后原回归恢复。
- 流程用例曾 1 失败／62 通过，测试用原始对象与 Pinia 代理做引用比较。改为捕获当前响应式会话引用，继续断言新会话对象保持一致。
- 页面用例 should_finish_public_flow_and_prefill_email_login_once 提前检查路由，should_show_validation_errors_and_support_code_restart 与 should_revalidate_confirmation_and_allow_accessible_password_visibility 提前检查校验文案，早期运行 3 个断言失败。改为等待实际 DOM 文案和路由结果，后续全量通过。
- 首次 lint 报页脚 U+3000 非法空白。替换为 HTML 空白实体后零警告。
- 部分组件与页面回归在实现后补齐，本轮记录实际顺序。API 模块观察过初始红测，其他用例未全部采用先红后绿。

## 7. 变更文件

| 文件                                                                      | 用途                                 |
| ------------------------------------------------------------------------- | ------------------------------------ |
| src/api/passwordReset.js、passwordReset.spec.js                           | 三个公开 API 与响应形态测试          |
| src/composables/usePasswordReset.js、usePasswordReset.spec.js             | 申请、兑换、提交状态机及恢复         |
| src/components/auth/PasswordResetForm.vue、PasswordResetForm.spec.js      | 真实表单、验证、pending 与可访问性   |
| src/views/password-reset/PasswordResetView.vue、PasswordResetView.spec.js | 独立页面、焦点、导航与交接           |
| src/stores/auth.js、auth.spec.js                                          | 操作归属与旧会话清理                 |
| src/stores/authFlow.js、authFlow.spec.js                                  | 找回独立期限与一次性交接             |
| src/composables/useLogin.js                                               | EMAIL_PASSWORD 成功预填动作          |
| src/views/login/LoginView.vue、LoginView.spec.js                          | 真实登录回填及新路由 fixture         |
| src/components/auth/LoginForm.vue                                         | 密码登录方式的找回链接               |
| src/views/register/RegisterView.spec.js                                   | 关联 Router fixture 加入新路由       |
| src/router/index.js、src/utils/redirect.js、redirect.spec.js              | 独立路由、安全回跳与认证流程排除     |
| src/utils/errors.js                                                       | 稳定找回错误码文案                   |
| e2e/password-reset.spec.js、e2e/login.spec.js                             | 新流程与五视口、真实忘记密码入口回归 |
| docs/features/password-reset.md                                           | 功能与审核材料                       |
| docs/tasks/login-follow-up.md                                             | AUTH-02 三步契约与实施状态           |
| docs/superpowers/specs/2026-11-09-password-reset-design.md                | 正式契约的第三步设计增量             |
| docs/superpowers/plans/2026-11-11-password-reset.md                       | 实施计划和执行记录                   |

共 27 文件。docs/api 三份契约更新已在独立提交 730f3cd 推送，当前实现只读引用。测试产物和草图为忽略目录内的辅助证据。

## 8. 设计审核反馈复核与实施处置

| 编号     | 独立核对与分级                                       | 修改方向与处置                                                          | 验证                                                  |
| -------- | ---------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| NOTE-001 | 成立，原两份后端契约尚未跟踪，非阻断合理             | 用户授权后已纳入版本管理，后续三步契约更新提交为 730f3cd 并已推送       | 三份 API 契约及相对链接当前可检出                     |
| NOTE-002 | 无 scope 契约与既有 recordLimit 语义不同，非阻断合理 | 采用独立找回期限，按整体 Retry-After 记录等待，申请／验证／完成分开管理 | authFlow.spec、usePasswordReset.spec 的期限与用途隔离 |
| NOTE-003 | 成立，任务书原依赖状态过时，非阻断合理               | 本轮按正式三步契约更新 AUTH-02 当前状态及链接                           | 文档相对链接与语义检查                                |

本轮为实现首轮提交。上述是设计审核建议的落实，实施问题由后续实现审核独立核实。

## 9. 已知限制与联调

当前自动化为 Chromium 与 mock HTTP。Firefox、Safari、物理手机软键盘和真实 SMTP／Redis／MySQL 后端联调尚未执行。

真实联调需要部署全部三步正式接口、可收信且绑定的测试账号、可用 Redis 和邮件任务服务，并配置开发代理。通过页面申请真实邮件、输入本次验证码、完成改密并验证新密码登录及旧登录失效，日志与截图遵循敏感信息约束。真实联调独立于 mock 验证。

安装仍报告 7 项既有中危审计提示及 deprecated 提示，构建存在既有主分块大于 500kB 提示。依赖安全升级按独立维护任务处理。

## 10. 2026-11-11 最终验证与首轮提交

环境为 Node v22.19.0、npm 10.9.3，Playwright Chromium，2 workers、0 retries。

| 实际命令                                                                                                                                       | 结果                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| npm ci --proxy=http://127.0.0.1:7897 --https-proxy=http://127.0.0.1:7897 --fetch-retries=1 --fetch-retry-mintimeout=1000 --fetch-timeout=20000 | 退出 0，307 包，7 项既有中危审计提示                              |
| npm run check                                                                                                                                  | 退出 0，lint 零警告、格式通过，22 文件 364 测试通过，生产构建成功 |
| npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html                               | 退出 0，364 通过／0 失败／0 跳过／0 todo                          |
| npm run test:e2e -- e2e/password-reset.spec.js                                                                                                 | 退出 0，12 通过／0 失败／0 跳过                                   |
| npm run test:e2e                                                                                                                               | 退出 0，78 通过／0 失败／0 跳过／0 重试，无 flaky 或预期失败      |

完整文件覆盖率来源为本次 coverage/coverage-summary.json，全部本次业务逻辑文件达到行 80%、分支 70%。测试和文档排除业务逻辑覆盖率统计，路由声明逐文件说明替代验证。

| 文件                                           | 行覆盖率 | 分支覆盖率                                          |
| ---------------------------------------------- | -------- | --------------------------------------------------- |
| src/api/passwordReset.js                       | 100%     | 100%                                                |
| src/components/auth/LoginForm.vue              | 96.61%   | 88.88%                                              |
| src/components/auth/PasswordResetForm.vue      | 95.55%   | 94.54%                                              |
| src/composables/useLogin.js                    | 96.21%   | 88.11%                                              |
| src/composables/usePasswordReset.js            | 98.56%   | 96.96%                                              |
| src/router/index.js                            | 100%     | 不适用，0 个可执行分支；真实导航及 e2e 验证路由声明 |
| src/stores/auth.js                             | 100%     | 100%                                                |
| src/stores/authFlow.js                         | 100%     | 100%                                                |
| src/utils/errors.js                            | 100%     | 90.9%                                               |
| src/utils/redirect.js                          | 100%     | 100%                                                |
| src/views/login/LoginView.vue                  | 100%     | 97.61%                                              |
| src/views/password-reset/PasswordResetView.vue | 97.36%   | 97.87%                                              |

全仓行 98.09%、分支 93.81% 仅为补充，逐文件表为审核依据。实现首轮待审，Codex 自验与独立 accepted 分别记录。设计、计划和实现提交均保留在本地，按既有审核及人类推送决定继续。

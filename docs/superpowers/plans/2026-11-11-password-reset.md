# 找回密码实施计划

**目标** 交付 AUTH-02 完整邮箱找回密码切片，包含公开三步 API、居中留白页面、登录入口与成功预填。

**架构** 页面私有状态由 usePasswordReset 管理，表单通过 props／emit 交互，API 复用 publicRequest。Pinia 保存跨页限流期限与一次性登录交接，auth store 按发起操作的会话归属清理旧状态。

**技术栈** Vue 3、JavaScript、Vue Router、Pinia、Axios、Element Plus、Vitest、Playwright。

**设计** [找回密码设计](../specs/2026-11-09-password-reset-design.md)，结合 2026-11-11 三份正式契约。用户已授权契约推送后直接实施，本对话由 Codex 执行，独立审核由 Claude 完成。

## 全局约束

- 单一 AUTH-02 切片，公开请求通过现有统一 HTTP 封装。
- 纯 JavaScript、原生 scoped CSS、现有 Element Plus 引入方式和依赖版本。
- 顶部两步进度，默认邮箱输入，同一验证步骤内进入验证码输入。
- 验证成功兑换一次性票据，新密码按 8–72 位可打印 ASCII 校验并原样提交。
- 申请、校验与改密分别处理额度及结果未知，按整体 Retry-After 记录找回限流。
- challengeId、resetTicket、code、密码使用页面内存，刷新和离开清理。
- 本轮前端提交随实现一起推送，独立审核通过与人类推送决定按项目协议执行。

## 重点风险与归属

1. 旧请求在邮箱修改或离开后返回，任务 2 使用取消与操作序号测试隔离。
2. 验证成功响应异常时验证码可能已消费，任务 1、2 验证结果未知与重新申请。
3. 票据在请求中到期或消费后发生错误，任务 2 保留已发请求归属，以后端结果决定成功，结果未知引导登录核实。
4. 旧改密响应影响新登录，任务 2、3 对照会话与角色票据对象，验证新会话保持可用。
5. 无 scope 的申请限流与第二、三步窗口，任务 2 验证独立期限、换邮箱及跨页等待。

## 任务 1 公开接口与响应消费

新增 src/api/passwordReset.js 与 passwordReset.spec.js，修改 src/utils/errors.js。

接口为 requestPasswordReset(email, { signal })、verifyPasswordReset({ challengeId, code }, { signal })、completePasswordReset({ resetTicket, newPassword }, { signal })。前两者返回各自标识和 expiresAt，第三者仅在 204 成功。

- [x] 添加 mock adapter 测试，断言三个 URL、方法、精确请求体、AbortSignal 与公开请求。
- [x] 测试标识 43 字符及末位规范编码、合法 UTC 未来时间、缺失／null／非法形态、过期及未知扩展字段。
- [x] 运行定向红测，确认缺少模块，再实现公开 API 与安全错误映射。
- [x] 定向测试通过，记录完整命令与计数。

## 任务 2 流程、期限与共享交接

新增 src/composables/usePasswordReset.js 与 usePasswordReset.spec.js。修改 src/stores/authFlow.js、authFlow.spec.js，src/stores/auth.js、auth.spec.js。

流程暴露 form、rules、phase、busy、error、notice、remaining、canVerify、canComplete、sendCode(formComponent)、verifyCode(formComponent)、submit(formComponent)、restart()。form 包含 email、code、newPassword、confirmPassword。阶段为 email／code／password／completed。

共享动作包括 passwordResetRemaining(phase, email, now)、recordPasswordResetWait(phase, email, deadline)、completePasswordReset(email)、takePasswordResetSuccess()。申请限流按邮箱及整体等待记录，校验与完成各自独立。auth.clearSessionIfCurrent({ session, roleSelection, revision }) 仅在两个状态引用与快照相同才调用既有 clearSession。

- [x] 覆盖邮箱、验证码、两次密码一致性与边界，密码保留首尾空格。
- [x] 覆盖申请 202、校验 200、改密 204 的阶段切换、敏感值清理和精确请求。
- [x] 覆盖统一验证失败、新旧密码相同保留票据、票据失效回重新申请、429 独立等待。
- [x] 覆盖三阶段网络／超时／5xx／响应异常结果未知、取消静默、页面卸载与迟到响应。
- [x] 覆盖修改邮箱、防重复提交、已知过期阻断新请求、请求中跨到期仍依据有效响应推进。
- [x] 定向红测后实现状态机，使用操作序号与 AbortController。验证成功清 challengeId/code，改密结果未知清密码与票据，提供尝试登录核实及重新申请。
- [x] 新旧会话对象和角色票据分别测试，当前操作成功时仅清理发起时仍然有效的旧会话归属。

## 任务 3 页面、表单与登录入口

新增 src/components/auth/PasswordResetForm.vue 及同目录 spec，src/views/password-reset/PasswordResetView.vue 及同目录 spec。修改 router/index.js、utils/redirect.js 及其 spec，LoginForm.vue 及 spec、LoginView.vue 及 spec、useLogin.js 及 spec。

PasswordResetForm 消费流程状态、规则和期限，发出 send-code／verify-code／submit／restart，暴露 validate()。页面编排导航和标题焦点。useLogin 增加 prefillResetEmail(email)，切至 EMAIL_PASSWORD、清理旧敏感输入与反馈。

- [x] 测试邮箱初始入口、验证码输入、密码输入、字段错误关联、显隐键盘操作、pending 禁用、错误与恢复入口。
- [x] 实现 /forgot-password 独立懒加载路由、密码登录方式下真实 RouterLink、安全 redirect 保留与认证路由排除。
- [x] 完成 A 居中留白，品牌与返回登录位于页眉，顶部两步进度，常规手机和桌面尺寸验证。
- [x] 改密成功后内存交接邮箱并 replace 到登录，导航失败保留成功提示与真实登录链接。预填消费后清除，刷新不重放。
- [x] 使用真实路由测试入口、成功回填和焦点，原登录及注册回归继续运行。

## 任务 4 浏览器、全量验证与文档

新增 e2e/password-reset.spec.js、docs/features/password-reset.md。更新 docs/tasks/login-follow-up.md 的实际依赖与进度，设计文档记录正式契约增量。

- [x] mock 三个公开接口完成全流程，验证邮箱规范化、前导零、原样密码、请求体、登录预填与内存清理。
- [x] mock 验证失败、票据过期、新旧密码相同、429、改密结果未知、刷新与重新申请，保留真实 UI 断言。
- [x] 桌面 1366／1440／1920 与手机 320／390 检查布局、错误可达性、焦点和纵向滚动，保存并查看代表截图。
- [x] 顺序实际执行 npm ci、npm run check、npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html、npm run test:e2e。
- [x] 按每个修改业务逻辑文件完整文件行至少 80%、分支至少 70% 核对覆盖率。配置或纯声明逐项说明依据与替代验证。
- [x] 功能文档记录正式契约、字段行为、关键组合、实际命令和失败修正、逐文件覆盖率与未验证环境。
- [x] git diff --check、格式与链接检查通过后，按项目模板提交实现首轮审核材料，披露设计审核 NOTE-001／002／003 处置。

## 计划自检

设计各阶段对应任务 1–4。最终契约已齐全，NEW_PASSWORD_SAME_AS_OLD 保留票据，普通票据失败清理并回重新申请，最终结果未知按正式契约引导登录核实。任务中的接口名称、数据字段、公开请求和报告路径一致。

## 实际执行与顺序记录

- 契约增量 730f3cd 已按用户要求先推送，之后在原 main 工作区执行本计划。
- API 模块观察过模块缺失红测，其余部分流程、组件与页面测试在初版实现后补齐，未全部逐项先红后绿。
- 注册测试路由 fixture 原先缺少 forgot-password，关联回归失败后补齐真实路由声明。页面等待改为核对实际 DOM 与懒加载路由结果。
- 正式契约增量已同步设计第 2.2 节。结果未知时的会话处理核对 auth store 代际与状态快照，申请结果未知使用 60 秒恢复等待。
- npm ci、check、覆盖率与完整 e2e 最终通过，Vitest 364 条、Playwright 78 条，失败／跳过／重试均为 0。逐文件覆盖率及完整证据见 docs/features/password-reset.md。
- 代码与设计在本地提交待实现首轮审核。设计首轮 accepted 与实现审核分别记录。

# MGMT-02 管理员批量导入

## 目标、边界与入口

本切片实现当前 ADMIN 从本地多选或拖入 MP3／FLAC、手动开始、逐首导入与结果恢复的完整流程。歌曲管理标题旁的“上传歌曲”进入 `/admin/tracks/import`（`track-import`），与管理列表共用 BusinessLayout 和同一个管理菜单。标题首次进入及路由变化后聚焦，异步上传结果保留用户当前焦点。

返回列表恢复已提交的 q、status、page、size、sort。输入框未提交的关键词不作为返回上下文。非法或缺失来源条件采用管理默认值，不阻断文件导入。“查看草稿”清空 q、设 DRAFT／page=0，保留 size／sort。

本切片不包含草稿编辑、发布、归档、删除、持久化上传队列或后端任务查询。其他管理功能按[管理任务书](../tasks/song-management.md)分别交付。原始[设计](../superpowers/specs/2026-11-18-track-batch-import-design.md)与[实施计划](../superpowers/plans/2026-11-18-track-batch-import.md)已由人类通过，指定主 Agent 在当前会话实施。

## 接口与权限

新增调用为 POST `/api/v1/track-imports`，引用[导入契约](../api/track/import-track.md)。返回管理列表沿用 GET `/api/v1/tracks`，引用[列表契约](../api/track/list-tracks.md)。认证与 401 处理沿用既有 HTTP 和 auth 层，本切片未修改二者。

| 情况                    | 行为与依据                                             |
| ----------------------- | ------------------------------------------------------ |
| 当前 ADMIN              | 管理入口、导入路由及操作可用，后端负责实际授权         |
| USER 首次直达或登录回跳 | 沿既有守卫进入曲库，有效业务来源的拒绝语义保留         |
| 匿名访问                | 登录并保留安全站内完整 redirect                        |
| 当前上传 401            | 全局 HTTP 清理当前会话并跳转登录，旧队列与文件引用清空 |
| 403／429                | 会话保留，当前项等待手动重试                           |
| 新会话、角色改变、退出  | 同步清理批次、取消旧传输，旧响应与进度不再写入         |
| 同 Token 新会话         | 会话对象和 revision 共同识别归属，旧 401 不清除新会话  |

权限依据为导入契约“权限”，以及 AGENTS 四.认证／五.认证与权限；沿用[管理列表功能](track-management.md)的守卫和恢复决策。

## 页面与状态

采用人类确认的 A 方案：上传区与队列同页，沿用嫩叶绿主题、连续文件行、桌面独立大小列和手机合并信息。未增加侧栏子菜单。主要操作条在内容区滚动时保持可达。原生 input 配合 Element Plus 按钮，不引入第二份上传组件队列。每次选择先复制原 File 集合，立即清空 input 的 value／files，避免控件额外保留文件。

文件先本地校验再入队，管理员手动开始。运行中追加进入队尾，暂停中追加保持等待，完成后新文件等待手动开始。未发送项可移除。每个文件独立 UUID，重试保留原 UUID、File 与文件名。标识生成失败时该项停在待重试；恢复仅补齐标识并回到等待，管理员继续后按原选入顺序处理。

| 项目状态   | 显示及恢复                                         |
| ---------- | -------------------------------------------------- |
| waiting    | 等待，可在发送前移除                               |
| invalid    | 本地校验未通过，显示原因，可移除                   |
| sending    | 正在发送，有效总量显示进度；未知总量显示不定量反馈 |
| processing | 文件已发送，服务端处理，不生成处理百分比或预计时长 |
| succeeded  | 已导入，显示歌名、艺术家与可展开提示，释放 File    |
| failed     | 明确拒绝，保留原因、标识与展示资料，释放 File      |
| blocked    | 待重试，保留 File 与键                             |
| uncertain  | 结果待确认，保留 File 与键                         |

批次状态为 idle／running／pausing／paused／completed。统计由 store 按互斥项目状态推导。任何时刻最多一个业务请求；离页不取消当前项，当前项取得结果后暂停后续。返回时继续展示真实状态和暂停意图。手动重试解决当前项后保持暂停，由管理员继续后续文件。

Pinia 持有内存批次。成功、明确失败或清理会话时释放 File；待确认与待重试项持续保留恢复材料。刷新／关闭会丢失批次，页面说明该限制。浏览器取消不能证明服务端撤销创建，后续核对依据合法响应或原文件同键重放。

## 结果、错误与调度决策

| 响应／错误                                                        | 项目结果             | 自动调度与手动恢复                                  |
| ----------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| 200／201、READY、关联与歌曲 ID 有效                               | 成功，提示也计入成功 | running 时继续下一项                                |
| 413 UPLOAD_TOO_LARGE                                              | failed               | running 时继续                                      |
| 415 UNSUPPORTED_AUDIO_FORMAT                                      | failed               | running 时继续                                      |
| 422 AUDIO_METADATA_INVALID                                        | failed               | running 时继续                                      |
| 400 VALIDATION_FAILED                                             | failed               | 暂停，可继续等待项                                  |
| 409 IMPORT_CONFLICT                                               | failed               | 暂停，可继续等待项，重新选择构成新意图              |
| 403／429                                                          | blocked              | 暂停，原文件同键重试；有效 Retry-After 仅作等待提示 |
| IMPORT_IN_PROGRESS、503、网络／超时／异常成功正文及其他不明确结果 | uncertain            | 暂停，原文件同键重试                                |
| 旧请求取消／迟到结果                                              | 忽略                 | 不修改新会话或新批次                                |

恢复矩阵与超时预算依据[设计第 5—7 节](../superpowers/specs/2026-11-18-track-batch-import-design.md#5-进度与状态流转)。未知错误使用集中安全文案，不展示任意后端 detail。429 精确额度和窗口尚未由当前契约规定，首版不生成额度倒计时。

## 字段消费与校验依据

| 字段／谓词                        | 合法值与用途                                                   | 缺失、null、边界与异常行为                                                                           | 依据及自动化证据                                                           |
| --------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| file                              | 原 File、原名；扩展名 MP3／FLAC，不区分大小写；≤209715200 字节 | 无效 File、扩展名或超上限留本地原因，其他项可导入；0 字节不添加契约外最小大小限制，内容由后端验证    | API 请求／产品；trackImport 工具 spec，e2e 上限与 +1 字节                  |
| uploadId                          | 新项 UUID；已发送项重试原键                                    | 生成异常阻断发送并保留 File，恢复不改变选入顺序                                                      | API 幂等／客户端运行；store UUID 与尾部故障用例                            |
| FormData                          | 仅 uploadId、file                                              | 浏览器创建 multipart boundary，保留文件名、MIME 和字节                                               | API 请求；API spec、e2e multipart 比较                                     |
| timeout                           | 导入局部 600000ms                                              | 超时变为待确认，全局 15000ms 不变                                                                    | 已确认产品／客户端恢复；API timeout 断言与网络中断 e2e                     |
| loaded／total                     | 有限非负 loaded、有限正 total                                  | 无有效总量不显示百分比；未完成最高 99，完成 100 后切处理；旧尝试进度忽略                             | 客户端运行；工具、store 和真实 XHR 事件 e2e                                |
| HTTP／status／uploadId            | 200／201、READY、等于请求键                                    | 缺失、null、非预期或关联不符进入待确认                                                               | API 成功与重放；API 异常关联用例                                           |
| track.id                          | 数字 Long，1—9223372036854775807，消费为精确十进制字符串       | 缺失、null、字符串伪装、非法类型、小数及越界拒绝；等价整数数字表示接受                               | API／既有精确解析；最大值、科学计数与边界测试                              |
| importId                          | 合法记录 ID 精确保留                                           | 缺失、null、非法形态降级 null，当前关联由 uploadId／track.id 确认                                    | AGENTS 响应消费／设计第 8 节；API 降级测试                                 |
| title／artistName                 | 展示原文本                                                     | 缺失、null、空或类型异常回退“未命名歌曲”／“未知艺术家”                                               | AGENTS 响应展示；API 降级测试                                              |
| metadataWarnings                  | 空或字符串数组                                                 | 已知值中文映射并折叠重复；未知值通用核对；缺失、null、非数组或混合非法类型给读取异常提示；成功不撤销 | API 警告／设计第 8 节；工具全部警告、异常形态与组件展开测试                |
| cover／其他资产字段               | 资产 DTO 或合法 null，当前无需显示封面                         | 忽略当前操作无关字段，不把资产误作 cover.url                                                         | API 成功资料／AGENTS 响应消费；API 空封面及无 URL 资产用例                 |
| q／status／page／size／sort       | 沿现有管理解析器                                               | 非法来源整体回默认；查看草稿保留 size／sort                                                          | 产品返回规则；trackList spec、页面与导航 e2e                               |
| session／ADMIN／revision／attempt | 发送、进度、响应均核对归属                                     | 新会话、角色及代际失配清理；旧 finally 不能清理新请求                                                | AGENTS 会话边界／客户端运行；store unit、真实 HTTP integration、旧会话 e2e |

共享精确 JSON／Long 函数由 tracks.js 原实现最小提取到 trackResponse.js，列表请求行为沿原回归。与当前业务无关的未知新增响应字段忽略。上述校验均有 API、批准产品、安全或客户端运行依据，无待澄清的交付谓词。

## 验证与限制

开发过程先写失败测试，再补 API／store／组件／页面实现。已修正未使用 import、单个测试文件格式，以及浏览器用例在用户点击后仍断言标题焦点的问题；均以实际重跑结果为准。独立只读辅助检查发现的 UUID 恢复顺序及进度条名称问题已核实并修正，辅助检查不计 Claude 正式审核轮次。

当前业务 HTTP 均 mock，未执行真实后端联调，未声称验证真实 MP3 解析或对象存储。Chromium 为本轮执行浏览器，其他浏览器未执行。开发过程的沙箱 npm ci 因 EPERM 失败，按权限重跑成功；安装未修改依赖或锁文件。构建沿用已有大包提示，未在业务切片调整分包配置。

完整最终命令、逐文件覆盖率与独立审核结果在提交审核材料登记。布局已在 1366×768、1440×900、1920×1080、1024×768、320×740、390×844 检查长文件名、提示展开、错误、按钮和手机导航；本地忽略目录 `.superpowers/track-import-*.png` 为验证截图，未提交产物。主 Agent 已查看 1440 与 320 代表截图。

## 最终自验（2026-11-18）

| 命令                                                                                                             | 实际结果                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| npm ci                                                                                                           | 正常权限重跑退出 0，308 包安装；依赖与锁文件未改                       |
| npm run check                                                                                                    | 退出 0；lint 零警告、Prettier 通过、39 文件 669 单测通过、生产构建成功 |
| npm run test:unit:coverage -- --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=html | 退出 0；669 通过／0 失败／0 跳过／0 todo                               |
| npm run test:e2e -- e2e/track-import.spec.js                                                                     | 21 通过／0 失败／0 跳过，Chromium，0 重试                              |
| npm run test:e2e                                                                                                 | 133 通过／0 失败／0 跳过，0 重试／flaky／预期失败                      |

以下为每个改动业务源码文件的完整文件覆盖率，来源 `coverage/coverage-summary.json` 与 `coverage/index.html`。全仓行 97.68%、分支 93.74% 仅作附加资料，不替代逐文件核对。测试和 fixtures 不计业务源码；router/index.js 也列出完整行覆盖率，其声明／注册逻辑没有可执行分支，另由真实路由和登录回跳测试验证。

| 源码                                           | 行     | 分支             |
| ---------------------------------------------- | ------ | ---------------- |
| src/api/trackResponse.js                       | 95.65% | 96.15%           |
| src/api/trackImports.js                        | 100%   | 100%             |
| src/api/tracks.js                              | 97.14% | 82.69%           |
| src/utils/trackImport.js                       | 100%   | 100%             |
| src/stores/trackImport.js                      | 97.08% | 90.16%           |
| src/components/management/ImportFilePicker.vue | 90.9%  | 90.9%            |
| src/components/management/ImportQueue.vue      | 97.14% | 95.83%           |
| src/views/management/TrackImportView.vue       | 93.54% | 89.65%           |
| src/utils/trackList.js                         | 100%   | 100%             |
| src/utils/errors.js                            | 100%   | 90.9%            |
| src/components/layout/BusinessLayout.vue       | 95%    | 100%             |
| src/views/management/TrackManagementView.vue   | 98.14% | 90%              |
| src/router/index.js                            | 100%   | 不适用（0 分支） |

独立 Claude Code 第 1 轮实质审核已 accepted，无阻断项；审核方独立重跑四项必要验证，669 单测和 133 e2e 均通过。实际运行器 2.1.325、模型 mimo-v2.6-pro。两条非阻断建议的逐项复核与处置、完整原文见[独立审核归档](../reviews/2026-11-18-track-import-review.md)。业务实现保持送审版本，当前切片完成，等待人类指派下一项。

## 变更文件

- `src/api/trackImports.js`、同目录 spec：FormData、10 分钟上传预算、进度与成功解析。
- `src/api/trackResponse.js`、同目录 spec、`src/api/tracks.js`：共用精确解析与列表回归。
- `src/utils/trackImport.js`、同目录 spec：文件校验、体积、警告与进度。
- `src/utils/errors.js`、同目录 spec：导入安全文案。
- `src/stores/trackImport.js`、unit 与 integration spec：跨页队列、串行调度、恢复和会话隔离。
- `src/components/management/ImportFilePicker.vue`、`ImportQueue.vue` 及各自 spec：选择、真实 input 清理、展示及事件。
- `src/views/management/TrackImportView.vue`、同目录 spec：页面、离页暂停、焦点与返回导航。
- `src/views/management/TrackManagementView.vue`、同目录 spec：真实上传入口与查询传递。
- `src/components/layout/BusinessLayout.vue`、同目录 spec：管理归属与两处导航上下文。
- `src/router/index.js`、同目录 spec、`src/views/login/LoginView.spec.js`：真实路由、直达与登录回跳。
- `src/utils/trackList.js`、同目录 spec：管理返回目标。
- `src/test/factories.js`：独立原始响应、精确 JSON 和结果工厂。
- `e2e/track-import.spec.js`：21 项浏览器流程与视觉检查。
- 本功能文档、管理任务书与实施计划、审核请求及原文归档：交付进度、验证及审核索引。

送审前工作树另有人工维护的 `docs/api/track/list-tracks.md` 修改与 `docs/api/favorite/` 未跟踪文档，均保持原样且未纳入本切片提交。

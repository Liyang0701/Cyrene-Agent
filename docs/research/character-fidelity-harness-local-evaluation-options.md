# Character Fidelity Harness：本地离线 A/B 盲测与评测记录方案研究

> 日期：2026-07-19
> 对应：[GitHub Issue #48：建立 Character Fidelity Harness 并冻结工程版基线](https://github.com/Liyang0701/Cyrene-Agent/issues/48)
> 结论类型：实现前技术研究；不修改角色内容、生产逻辑或现有测试。

## 结论先行

Issue #48 的第一版应采用“**项目内 TypeScript Harness + 既有 Vitest + 本机模型服务**”的组合：

1. 保持 Vitest 作为唯一测试运行器，用于固定夹具、基线冻结、硬性规则、存储隔离和可重复性的自动验证。
2. 自研很小的、版本化的 Harness 领域层，负责基线哈希、固定提示集、候选/基线生成、A/B 匿名随机化、隐藏映射、评分记录及最终揭盲。
3. 实际生成只显式访问本机模型服务；基线、候选、原始回答、盲测映射和用户评分均留在 Git 忽略的本地目录。
4. 不在第一版引入 `node:test` 作为第二套 runner，也不安装或依赖 promptfoo，更不使用 LLM 裁判、云端报告、共享链接或远端评测服务。

这条路线同时满足 #48 的“固定提示、匿名随机 A/B、三次重复、硬错误先行、用户评分为最终权威”和本项目的本地优先边界。自动化只能判断可明确形式化的错误；它**不能**宣称“星野还原度已经通过”。

## 已核对的本仓基础

| 已有能力 | 证据 | 可直接复用 | 不能替代的部分 |
|---|---|---|---|
| Node 24 | [`package.json`](../../package.json) 声明 `>=24 <25`；本机核验为 `v24.17.0` | `fs`、`path`、`crypto`、临时目录、进程退出码 | 角色语义、盲测随机化和评分隔离 |
| Vitest 4.1.9 | [`package.json`](../../package.json)、[`vitest.config.ts`](../../vitest.config.ts)；本机 `npm ls` 为 `4.1.9` | Node 环境测试、夹具、mock、断言、快照和报告 | 真实 LLM 生成的可复现记录 |
| Character Corpus Gate | [`character-corpus.ts`](../../src/main/character-corpus/character-corpus.ts)、[`character-corpus-cli.ts`](../../src/main/character-corpus/character-corpus-cli.ts) | 类型化报告、JSON CLI、临时真实目录夹具、可读失败码 | 它只审计证据来源与覆盖，不能评判候选回复的角色还原度 |
| 本地素材边界 | [`.gitignore`](../../.gitignore) 已忽略 `character-corpus-private/`、模型、密钥与环境文件 | “源码/许可安全夹具入 Git，原始素材留本地”的模式 | 尚无 Fidelity run、评分与揭盲映射的独立私有目录 |

因此，不需要为了 #48 再引入一个通用测试框架。新 Harness 应与现有 `character-corpus` 一样：纯 Node/TypeScript、输入输出可审计、核心逻辑可由 Vitest 在无网络条件下测试。

## 候选方案比较

| 方案 | 官方确认能力 | 对 #48 的适配性 | 决策 |
|---|---|---|---|
| 既有 Vitest | 参数化测试、快照、可配置 reporter | 与当前 TypeScript/Electron 工程、夹具和 CI 完全一致；适合验证固定规则和私有存储边界 | **首选并直接复用** |
| Node 内建 `node:test` | 稳定的测试 API、快照、reporter、失败重跑与测试顺序随机化 | 技术上可用，但会把本仓测试拆成两套；其随机化是测试执行顺序，不是 A/B 展示顺序 | **不接入；仅借鉴 seed/replay 思路** |
| promptfoo | provider 矩阵、重复生成、JS assertion、JSON/HTML/JUnit 输出、可接本地 OpenAI 兼容端点 | 有用但过宽；无法替代本项目的角色基线冻结、身份隔离、隐藏映射与人工验收；数据面和运行面更大 | **第一版不引入；以后才可作为隔离的人工研究工具** |

### 1. Vitest：唯一 runner，负责确定性验证

Vitest 的 [`test.each`](https://vitest.dev/api/test#test-each) 适合把“Fidelity Case × 硬规则”写为表驱动夹具测试。其 [Snapshot 指南](https://vitest.dev/guide/snapshot) 明确说明快照是版本控制中需审阅的预期输出；[Reporters 指南](https://vitest.dev/guide/reporters) 提供可机器读取的输出选择。

建议的使用边界：

- 允许快照：规范化后的角色上下文、固定提示组装结果、基线 manifest、规则 verdict、匿名卡片的无身份结构。
- 禁止快照：一次真实 LLM 回复本身。模型输出会受采样、服务版本和运行时状态影响；把它更新进快照只会把偶然输出误写成“角色通过”。
- 使用 `test.each` 覆盖每条固定 case 的身份串线、昔涟意象、形态泄漏、虚构历史、语言、翻译混入、工具结果、口癖预算和剧情解说规则。
- 若以后需要 CI 机器读取，只输出低敏摘要；原始回复、用户点评和揭盲映射不得作为公开 CI artifact。具体 reporter 配置须在实现时对照已固定的 Vitest 版本验证，不能照抄未来版本文档的选项。

### 2. Node `node:test`：能力足够，但不应平行引入

[Node 24 Test Runner 文档](https://nodejs.org/docs/latest-v24.x/api/test.html) 说明 `node:test` 自 Node 20 起为稳定能力；当前 Node 24 还可使用快照、reporter、失败重跑和测试随机化。其 [随机执行顺序说明](https://nodejs.org/docs/latest-v24.x/api/test.html#randomizing-tests-execution-order) 中的 `--test-randomize` / `--test-random-seed` 只影响**测试的执行顺序**，并非对同一提示的 A/B 卡片做匿名随机化；该功能在 Node 24 文档中仍标为 Early development。其 [失败重跑机制](https://nodejs.org/docs/latest-v24.x/api/test.html#rerunning-failed-tests) 也依赖确定的测试位置与顺序。

因此：

- 可以借鉴“显式记录随机 seed、可重放”的工程原则。
- 不应把 Node runner 的 seed 当成盲测 seed，也不应用它生成卡片顺序。
- 不迁移现有 Vitest 测试，也不新增第二个 `npm` 测试入口；这会增加维护和报告分裂，且不会实现 #48 的领域要求。

### 3. promptfoo：可研究，不是第一版依赖

promptfoo 的官方文档确认了几项后续可能有价值的能力：

- [配置指南](https://www.promptfoo.dev/docs/configuration/guide/) 支持固定 test case 与 assertion；[JavaScript assertion](https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/) 可写自定义确定性检查。
- [Test Case 文档](https://www.promptfoo.dev/docs/configuration/test-cases/) 支持按 case 重复生成；[Provider 文档](https://www.promptfoo.dev/docs/providers/) 支持本地/自托管 OpenAI 兼容端点和自定义 JS provider。
- [输出文档](https://www.promptfoo.dev/docs/configuration/outputs/) 支持 JSON、HTML、CSV、JUnit；其中 JUnit 会有意省去 prompts、变量和原始输出，适合低敏通过/失败摘要。
- [Echo provider](https://www.promptfoo.dev/docs/providers/echo/) 可原样回放输入且不发起外部 API 请求，未来可用于离线检查导出的样本或 assertion 配置。

但这些不是 #48 的核心领域能力。promptfoo 不知道“工程版只读 Baseline”“同一 Character ID 不分裂状态”“评分时不可揭示版本身份”“翻译不能算角色原话”这些项目规则；若强行接入，仍需在外层自研同样的模型、存储和校验，反而形成两套事实来源。

更重要的是，严格本地边界必须保守处理：

- [Telemetry 文档](https://www.promptfoo.dev/docs/configuration/telemetry/) 表明它默认收集基础使用遥测；虽然官方说不含 prompts/outputs/API key，仍意味着不是默认零网络。
- [输出文档](https://www.promptfoo.dev/docs/configuration/outputs/) 说明 JSON/HTML 等结果可带原始输入、输出和配置，敏感字段清洗只属 best-effort；不能把其导出文件当作天然安全的分享物。
- [Sharing 文档](https://www.promptfoo.dev/docs/usage/sharing/) 明确共享会上传 eval/report snapshot，其中可能包含 prompts、vars、outputs、metadata、provider 字段和媒体引用。
- [FAQ 的离线说明](https://www.promptfoo.dev/docs/faq/#how-can-i-use-promptfoo-in-a-completely-offline-environment) 提供禁用 telemetry、更新、remote generation、sharing 的环境变量，但明确指出这**不是网络防火墙**；严格离线仍须依靠本机 egress 控制。
- [官方安全说明](https://github.com/promptfoo/promptfoo/blob/main/SECURITY.md) 还要求把 custom provider、custom assertion、transform 视为按本机用户权限执行的代码，而不是沙箱。

结论：#48 第一版不安装 promptfoo、不运行其云端/hosted grading、不调用 `share`、不使用 LLM rubric。若后续用户明确希望做更通用的模型横评，可另建一个 Git 忽略的、人工显式启动的实验目录，并同时满足：只指向 `127.0.0.1` 或已批准的自托管端点、关闭 sharing/telemetry/update/remote generation、使用独立 `PROMPTFOO_CONFIG_DIR`、经网络出口限制、且仅输出本地私有目录。即使如此，它也只能辅助，不能替代 Harness 的最终用户盲测。

## 推荐的 Harness 边界

### 需要复用的部分

- **Vitest**：表驱动夹具、临时目录、mock provider、确定性结构测试、snapshot 与低敏测试报告。
- **Node 标准库**：`crypto` 产生 run salt、计算 SHA-256、必要时生成可审计的伪随机序列；`fs` / `path` 做原子写入与权限检查。
- **现有 Character Corpus Gate 模式**：版本化 schema、明确错误码、只读报告、CLI 退出码和真实临时目录测试。
- **当前本机模型链路**：仅作为实际生成的受控 provider；Harness 通过显式的本地 provider adapter 调用，绝不读取或持久化任何凭据。

### 必须自研的部分

| 项目语义 | 不能由通用 runner / promptfoo 代替的原因 |
|---|---|
| Fidelity Baseline 冻结 | 必须只复制允许比较的 Character Content，记录版本和每个文件 SHA-256，设为只读，并永不注册为第二个 Character ID。 |
| Prompt Case schema | 必须携带稳定 ID、类别、版本、是否关键重复、工具夹具和允许的事实范围，避免“临时换题”影响 A/B 结果。 |
| 隐藏 A/B 映射 | 同一 case 的候选/基线顺序要由 per-run 私有 seed 随机化；评分者只能看到 A/B，不得看到版本、路径或特征标签。 |
| 评分隔离与揭盲 | 用户评分文件不得含 candidate/baseline 身份；映射单独保存，完成评分后才允许 reveal 和汇总。 |
| 硬错误规则 | 昔涟串线、形态泄漏、编造历史、翻译混入、工具结果变形等要输出可读代码和证据片段，不能交给“相似度分数”。 |
| 重复生成分析 | 关键 case 至少三次；报告同一开场、显著口癖、模板句和冲突结论的重复风险，但不把词面相似自动伪装成角色相似度。 |

### 推荐的本地文件边界

```text
仓库内、可审阅
├── src/main/character-fidelity/          # 纯领域逻辑与 CLI（未来实现）
├── test-fixtures/fidelity/               # 许可安全的合成夹具
└── docs/research/                        # 本研究与决策记录

Git 忽略、仅本机
└── character-fidelity-private/
    ├── baselines/<baseline-id>/          # 冻结的本地角色内容与 manifest
    ├── runs/<run-id>/answers.jsonl       # 原始回答，含回答 SHA-256
    ├── runs/<run-id>/blind-cards.jsonl   # 只含 A/B 和 cardId 的审阅视图
    ├── runs/<run-id>/reveal-map.json     # 唯一的版本身份映射
    ├── runs/<run-id>/scores.jsonl        # 用户评分；只引用 cardId
    └── runs/<run-id>/report.json         # 去身份化汇总与硬规则结果
```

实际实现应把 `character-fidelity-private/` 明确加入忽略规则，或把它放在仓库外的用户私有数据根目录；不要与 `character-corpus-private/` 混放，以免把许可证证据、生成结果与用户评分混成一个数据域。运行前创建目录应使用最小权限；日志不打印原始提示、回答、映射、密钥或完整本地路径。

## 可复现、匿名和本地化的最小记录

每次 run 的 `manifest` 至少记录以下非敏感事实：

- `schemaVersion`、`runId`、创建时间、Harness 版本和 prompt-set 的版本/哈希；
- baseline/candidate 的 Character ID（内部记录）、包版本、受比较内容文件清单和 SHA-256；
- provider 类型（例如 `local-openai-compatible`）、模型标识、请求参数、请求 seed、服务能力探测结果；
- 随机化算法版本、blind seed 的哈希、case/card 数、每条 case 的重复次数；
- 生成/规则/评分/reveal 的阶段状态与各阶段产物哈希。

以下信息绝不写进 manifest、报告或 Git：API key、Authorization header、`.env` 内容、完整用户对话、原始角色语料、用户的自由文本点评、真实盲测映射和可识别本机路径。

“可复现”在这里指同一冻结输入、同一固定 case、同一模型配置、同一随机化算法和可追溯产物；它**不**应被误写为“采样模型一定逐字复现”。若本地推理服务无法证明实际遵守 seed，应把 `seedHonored` 记录为 `unknown`，保留三次实际生成和响应哈希，而不是伪造确定性。

推荐的流程为：

1. **冻结**：从当前可运行的本地星野包建立只读 Baseline，逐文件写入 SHA-256 manifest；不改动活跃包，也不写角色状态。
2. **生成前硬检查**：验证 prompt-set、候选包、baseline、模型配置和私有目录均完整；任何失败都不覆盖活跃包。
3. **生成**：同一固定 case 分别调用 baseline 与 candidate；关键 case 以明确次数重复。生成失败保留错误记录，不用替代回答掩盖。
4. **匿名化**：在私有 `reveal-map` 中存放身份映射，生成给用户的卡片只显示随机 A/B、case 类别和必要上下文。
5. **硬规则**：先输出结构化 pass/fail/needs-review；硬错误为零才进入主观评分。语法或角色自然度的不确定判断应标为人工审核，不伪装为硬失败。
6. **评分与揭盲**：用户完成卡片评分后锁定 `scores.jsonl`，再读取 mapping 计算偏好、各类可接受率和中位数；不允许生成阶段读取评分。
7. **报告**：输出去身份化的汇总和可私下审计的揭盲结果。只有满足 #48 的零硬错误、偏好、可接受率、日语自然度和星野还原度阈值时，才允许进入“候选可人工接受”的状态；仍不自动覆盖当前包。

## 自动规则与人工验收的边界

自动层可以可靠地检查：

- 当前/禁止的 Character ID、昔涟名词或明显 Cyrene 意象；
- 普通形态中不被 case 明确授权的泳装、季节、战斗记忆；
- 未被 case/世界书允许的用户共同历史、恋爱既定事实或剧情因果断言；
- 非日文主回复、中文翻译直接混入角色原话、结构化工具块被改写；
- 固定工具夹具的字段、路径、命令、URL、数值和 JSON 结构损坏；
- 单条显著口癖超预算，以及关键重复中同一开场/口癖/模板句的可解释重复风险。

自动层不能可靠地决定：星野是否“像”、日语是否自然、情绪距离是否恰当、是否在认真场景足够克制、或新版本是否整体优于工程版。这些由匿名用户 A/B 评分决定。评分表应至少保留 #48 已指定的：偏好选择、日语自然度 1–5、星野还原度 1–5、可接受/不可接受、可选的私有简评；评分者在揭盲前不看版本身份。

## 建议的首个实现顺序与验证证据

1. **先定义 schema 与纯函数**：Baseline manifest、Fidelity Case、Generation Record、Blind Card、Score、Rule Verdict、Run Report；为每种非法输入写 Vitest 夹具。
2. **实现冻结和私有目录**：测试只读权限、SHA-256、同 ID 不注册、不会触碰关系状态或活跃包。
3. **实现本地 mock provider 的生成编排**：只用本地 HTTP mock 做自动集成测试，证明 request 参数记录、三次重复、失败恢复和不含凭据的日志；真实本机模型只留给后续人工冒烟。
4. **实现 A/B 匿名与评分隔离**：测试不同 seed 的随机化、相同记录的可审计重放、卡片无身份泄漏、评分文件无 mapping、揭盲前禁止计算版本胜率。
5. **实现硬规则与报告**：使用许可安全夹具覆盖 #48 的所有错误类别；验证未通过时不会调用现有包替换流。
6. **最后做用户盲测**：约 30 个固定 case、关键 case 三次生成、零硬错误后才请用户评分。文字人格、通话文本和音色仍按已批准边界分别验收。

建议的自动验证命令仍沿用现有工程入口：`npm test`、相关 Harness 目标测试、`npm run build:main` 与 `git diff --check`。真实生成验证须明确标记为“本机模型人工冒烟”，不能由 mock 通过替代。

## 最终取舍

可复用的是测试框架、文件/哈希能力、夹具模式和本地模型适配边界；必须自研的是 #48 特有的 Baseline、匿名对比、评分隔离、规则语义和揭盲流程。我们不整套接入外部评测服务，因为这会扩大依赖、遥测/报告/hosted grader 的数据面，并且仍不能回答本项目最关键的“这是不是更像星野、且用户在不知道版本时是否偏好它”。

本研究不需要用户执行任何手动操作；下一步应由 #48 的实现票据依据本文件落地纯本地 Harness，并在生成真实角色回答前先通过其确定性自动测试。

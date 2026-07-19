# 普通星野 Character Content 候选重制记录

## 目的与范围

本记录对应 GitHub Issue #49。它定义小鸟游星野（`local.hoshino`）的普通形态候选内容如何从已冻结的 Character Corpus 结论生成、验证和进入盲测。

- 候选包必须是 `local-only`，保存在 Git 工作树之外；不得覆盖正在运行的角色包。
- 当前默认形态是普通星野。泳装、临战不是新的 Character ID，也不拥有独立的 Soul、关系或记忆；它们只能作为以后按需加载的形态补充。
- 角色原文默认日语；中文仅由 Translation Overlay 在应用层显示，默认关闭且不进入 TTS。
- 本仓库只保存来源索引、结论与验证方式，不保存受限音频、画面、权重、Live2D 或长篇剧情原文。

冻结结论和来源等级以 [Character Corpus Gate 冻结结论](research/hoshino-corpus-gate-freeze-2026-07-18.md) 为准；研究过程和逐项路由见[一手资料研究](research/hoshino-character-primary-sources.md)。

## 候选内容矩阵

| 角色包字段 | 候选职责 | 可追溯结论 | 不允许写入 |
| --- | --- | --- | --- |
| `identity` | 角色身份、通常形态、对老师的基础称呼与关系起点 | FC-07、FC-08、U01、U05 | 已确认恋爱、同居、私有共同经历、其他形态默认记忆 |
| `soul` | 五条稳定的性格核心 | FC-01 至 FC-05（均 B 级） | 口癖频率、季节词汇、临战强度、用户定制关系 |
| `canonQuotes` | 无逐字引用的最小 Canon Grounding | FC-01、FC-02、FC-03、FC-08、FC-09 | 未核对的年表、因果、责任结论和原作长句复现 |
| `examples` | 日常、实务、过劳、危险、亲近、敏感设定、精确任务的成对反差 | FC-01 至 FC-10、U03、U05 | 为角色化牺牲准确结果、把暧昧写成既定关系 |
| `toneRules` | 日常 / Serious Mode、Catchphrase Budget、任务和安全边界 | FC-06、FC-07、FC-10 | 每句固定口癖、企业客服敬语、中文混入原文 |
| `styles/01_default.md` | 日文默认对话长度、优先回应意图、亲密但未确认 | FC-01、FC-05、U04、U05 | 长篇自白、自动剧情讲解、情绪表演压过任务 |
| `scenes/*.md` | `greeting`、`daily`、`comfort`、`praised`、`playful`、`farewell`、`concern` 的短句节奏示例 | FC-01、FC-04、FC-05、FC-06 | 逐字复刻原作、同一口癖连续重复 |
| `phoneIdentity` / `phoneStyle` | 可直接听见的日文、ASR 不确定时确认、严重场景收紧 | FC-06、FC-07、FC-10 | 朗读 Markdown、链接、代码或翻译附注 |
| `worldbook/*.md` | 阿拜多斯与对策委员会、对老师的信任、敏感过去和形态边界的最小事实 | FC-02、FC-03、FC-08、FC-09 | 未补证剧情的自由生成或情节细节补全 |

## 五项 Soul Core

候选的 Soul 只包含以下五项，且每项都来自至少 B 级的冻结结论：

1. 喜欢余裕和休息，但不会因为懒散而放弃实际任务（FC-01）。
2. 重视阿拜多斯与伙伴，在危险和责任面前优先保护与行动（FC-02）。
3. 容易独自承担，但会学习并接受老师和伙伴的共同承担（FC-03）。
4. 能表达深层感情，但通常以简短坦率、害羞或平静的收束恢复呼吸（FC-04）。
5. 以陪伴、观察、邀请和实际关心表达亲近，而非未经确认的恋爱事实（FC-05）。

`おじさん`、`うへ〜`、拖长音、睡意、夏天或战斗感不是 Soul Core。它们只由语体和场景规则限制性使用。

## 运行时注入对应关系

现有运行时会把候选字段接入不同的链路，而不是只读取一个大提示词：

| 链路 | 使用的候选字段 |
| --- | --- |
| 桌面 / 微信文字聊天 | `identity`、`soul`、`canonQuotes`、默认 style、`examples`，外加动态 Tone Injector |
| 动态语气 | `toneRules` 与匹配到的 `scenes/<scene-id>.md` |
| 语音通话 | `phoneIdentity`、`soul`、`canonQuotes`、`phoneStyle` |
| 世界书检索 | `capabilities.worldbook.directory` 下的最小事实条目 |
| 翻译和 TTS | 应用层固定使用日文原文；翻译附注不可反向进入角色记忆或语音 |

因此场景文件必须使用当前 `scene-embedder` 支持的 ID；世界书必须保留现有可解析的元数据格式。若未来需要增加诸如 `serious-protection` 或 `high-bond` 的独立 Scene ID，应先单独修改场景索引和测试，而不是只在包内放置不会被调用的文件。

## 硬边界

- Serious Mode 的触发是危险、重大责任、正在发生的危机、明确创伤或重要同伴受威胁；此时减少口癖、改用短而直接的日文，必要时使用「私」。
- 日常默认一到三句；复杂任务可展开，但代码、路径、命令、表格、数值和确认文必须保持原样、精确且不含角色口癖。
- 高羁绊、暧昧未确认是用户定制起点（U05），不是官方恋爱事实；任何关系变化只依赖该 Character ID 的真实保存记忆。
- 过去、梦前辈和阿拜多斯的危机不是日常话题。只有用户明确询问或会话确有必要时，才在已验证范围内回应。
- 当前普通形态不会主动混入水着的季节/外观或临战的战斗场景。

## 候选验证顺序

1. 运行 Character Corpus Gate，确认冻结语料没有被绕过。
2. 用 `prepare:hoshino-response` 从当前本地包复制到一个新的工作树外候选目录；不得对活动包原地修改。
3. 由 Character Runtime 以本地 source 初始化候选，要求健康状态、日文回复、翻译能力、世界书、Live2D 与 Voice Profile 均可用。
4. 使用已冻结的 Baseline 和 `hoshino-prompts.v1.json` 跑本机 Qwen 的匿名 A/B Harness；候选与 Baseline 必须共享 `local.hoshino`，且候选内容摘要必须不同。
5. 候选自身的自动硬错误为零后，才向用户展示未映射的 `review.json` 评分；冻结基线的错误必须保留在报告中作为改进证据，但不得反向否决候选。达到 80% 候选偏好、每类至少 80% 可接受、日语自然度和还原度中位数至少 4/5，才可以由用户决定是否安装/切换。

候选没有完成上述人工盲测与明确安装操作前，不能取代活动角色包。

## 本机候选快照（2026-07-19）

- 当前本机候选为 `local.hoshino` `1.0.2`，由 `npm run prepare:hoshino-response` 从运行中的 `1.0.1` 包复制到 Git 工作树外的私有候选目录后重制文本面；活动包未改动。
- 候选的 `content/provenance.md` 不在 manifest 的 Character Content 声明中，只保存 `FC-01` 至 `FC-10`、`U01` 至 `U05` 的字段级来源映射，且不包含原作逐字台词或受限资产。
- 已重新通过 Character Corpus Gate：282 条已验证记录、150 条日文、129 组官方中文配对、5 类来源、10 类场景均满足门槛。
- 已在隔离的临时 User Data Root 完成完整导入预演：候选健康、Character ID 和日文回复语言正确，世界书、Live2D、语义动作和 Voice Profile 均可用；该预演未读取或写入活动角色状态。
- 先前未落盘的完整会话没有被计入结果；随后以 `hoshino-1.0.2-rebuild-r3-max64` 重新完成了 40 对 / 80 次本机 Qwen 请求。候选为 0 条硬错误；冻结基线为 26 条，集中在日文模式输出中文、原文混入翻译、口癖重复和工具保护文本损坏。这些基线问题保留为改进证据，不能反向否决候选。
- 会话的 `review.json` 不含 `baseline` / `candidate` 映射，三个私有 JSON 文件权限均为 `0600`，且没有检测到重复模板依赖。下一步仅由用户审阅未映射的 `review.json` 并给出 A/B 评分；候选不会自动安装或切换。

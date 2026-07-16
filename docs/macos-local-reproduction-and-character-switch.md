# macOS 本地复现与角色切换工作记录

> 本文前半部分记录最初使用 Qwen3-4B 建立的复现基线。当前环境已升级为 Qwen3.5-9B，并加入 Qwen3-ASR、本地 Reranker、PDF 中文字体和微信语音适配；当前说明见 `docs/macos-local-adaptation.md`。

更新时间：2026-07-16（Asia/Shanghai）

## 当前目标

1. 在 Apple Silicon Mac 上完整复现 Cyrene-Agent。
2. 测试 LLM 固定使用本机 MLX Qwen3-4B。
3. 在不迁入其他项目的前提下，把“昔涟单角色应用”重构为可切换的完整角色包。

## 已验证的本地运行基线

### LLM

- MLX 模型：`mlx-community/Qwen3-4B-Instruct-2507-bf16`
- 模型快照：`~/.cache/huggingface/hub/models--mlx-community--Qwen3-4B-Instruct-2507-bf16/snapshots/f9e77d4283734966e9cd641bf35547f0cff5d427`
- OpenAI 兼容端点：`http://127.0.0.1:8080/v1`
- Cyrene 中必须填写完整模型名，不能填写简写 `qwen3-4b`。
- 服务只绑定 `127.0.0.1`，不对局域网暴露。

启动命令：

```bash
cd ~/Documents/local-llms/qwen3-4b
.venv/bin/mlx_lm.server \
  --model "$HOME/.cache/huggingface/hub/models--mlx-community--Qwen3-4B-Instruct-2507-bf16/snapshots/f9e77d4283734966e9cd641bf35547f0cff5d427" \
  --host 127.0.0.1 \
  --port 8080 \
  --max-tokens 2048 \
  --temp 0.2 \
  --prompt-cache-size 2 \
  --log-level INFO
```

### Embedding

- 使用项目 release 中的 BGE-M3 ONNX 包。
- 实际目录必须是 `models/Xenova/bge-m3/`。
- 当前模型设置已切换为 `embeddingModel: "bgem3"`。
- 为避免 Electron 启动目录差异，启动时显式传入 `CYRENE_MODELS_DIR`。

### Cyrene 启动

```bash
cd "$HOME/Documents/二次元/.local/vendor/Cyrene-Agent"
CYRENE_MODELS_DIR="$PWD/models" \
CYRENE_MEMORY_LLM_TIMEOUT_MS=180000 \
npm start
```

`CYRENE_MEMORY_LLM_TIMEOUT_MS` 是为本地推理增加的可配置预算。源码默认现在为 120 秒，允许 30 秒至 600 秒；当前实机启动使用 180 秒。

## 实机验证矩阵

| 能力 | 状态 | 证据 |
|---|---|---|
| 安装与生产构建 | 通过 | `npm ci`、`npm run build` 成功 |
| 完整单元测试 | 通过 | macOS 下 112 个测试文件、784 个测试全部通过 |
| Electron 多窗口 | 通过 | 聊天、状态、任务、Live2D 桌宠均正常显示 |
| Live2D 动画 | 通过 | 连续截图哈希不同，确认不是静态图片 |
| Qwen 原生聊天 | 通过 | OpenAI 兼容接口 HTTP 200 |
| Qwen 原生工具调用 | 通过 | 返回合法 `tool_calls` 与 JSON 参数 |
| Cyrene 真实聊天 | 通过 | UI 中由本地 Qwen 返回昔涟人格回答 |
| Cyrene 工具调用 | 通过 | `todo_write` 写入两条待办，磁盘内容与请求一致 |
| BGE-M3 RAG | 通过 | `local-bge-m3`，1024 维，向量库可写 |
| 场景语义索引 | 通过 | 7 个场景完成索引 |
| 贴纸语义索引 | 通过 | 52 个贴纸完成索引 |
| 历史对话向量化 | 通过 | `chat_history` 条目写入 `rag-data/memory-store.json` |
| 结构化长期记忆 | 通过 | Qwen 提取 `L0.preferredName`，写入 `memory.json` |
| 重启后记忆召回 | 通过 | 重启并清空会话后，实际调用 `user_memory` 与 `recall_history`，准确召回称呼、测试代号、饮品偏好 |
| 文档上传与检索 | 通过 | Markdown 显示“已处理”，调用 `imported_docs`，三项唯一事实全部命中 |
| 20 轮 Reflection/压缩 | 通过 | 后台任务完成，未发生 30 秒超时 |
| TTS | 待配置 | 当前 `ttsEngine=off`，没有角色音色或服务凭证 |
| ASR/语音通话 | 待配置 | 当前 `asrEngine=off`；项目通话链路强依赖 ASR |
| 飞书/微信 | 待配置 | 渠道关闭且无账号凭据 |
| 联网搜索/邮件/出行 | 待配置 | 对应开关关闭且无服务凭据 |
| MCP | 待配置 | 当前没有 MCP server，Playwright MCP 关闭 |
| Game Bot | 平台受限 | 上游声明其键鼠自动化主要依赖 Windows/Win32，macOS 不能直接按“完整支持”宣称 |
| 主动聊天/定时任务 | 待专项验证 | 主动聊天当前关闭；需单独验证调度、投递与重启恢复 |

## 为什么角色切换不是换一份 Prompt

当前仓库本质上是“昔涟单角色应用”，角色相关内容散布在以下层级：

1. 人格与语气：`prompts/identity.md`、`soul.md`、`system.md`、`talk_system.md`、`phone_*.md`、`styles/`、`canon_quotes.md`。
2. 世界观：`prompts/worldbook/` 里的角色、人物、剧情、世界、词表。
3. 角色技能：`skills/cyrene-original-voice/`。
4. Live2D：模型、贴图、动作、表情、物理、点击区域，以及默认表情和说话时专用表情。
5. UI：窗口标题、页面标题、空状态、头像、辅助功能文本、设置说明。
6. 语音：TTS 音色 ID、参考音频、风格 prompt、主动开口语音包。
7. 语义资源：角色贴纸、场景描述、开场白与主动消息。
8. 状态数据：聊天历史、关系日志、世界书激活状态、长期记忆、主动消息状态、TTS 缓存。
9. 外部渠道：飞书/微信中显示的角色名、消息口吻和角色语音。

只替换 system prompt 会造成典型串角：文字人格已变，但头像、Live2D、动作名、电话人格、世界书、记忆和语音仍然属于昔涟。

## 可复用方案与不直接整套接入的原因

### Character Card V3

可复用：姓名、描述、人格、场景、首句、备用问候、世界书以及 assets/扩展字段，适合作为角色内容的导入/导出格式。

不能直接作为内部唯一格式：它不定义 Electron 窗口生命周期、Live2D 语义动作映射、TTS/ASR 配置、主动语音包、每角色数据命名空间和 Cyrene 的工具/记忆策略。因此应做导入适配器，而不是让运行时直接依赖卡片格式。

参考：[Character Card V3 规范](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)

### Open-LLM-VTuber

可复用：`characters/` 目录、一角色一配置、稳定 `conf_uid`、角色名/头像/Live2D/人格/TTS 一起切换的总体思路。

不直接整套接入：它是 Python 服务 + 独立前端架构，且当前官方说明长期记忆尚在重做；Cyrene 已有 Electron 主进程、AG-UI、DMAE 世界书、L0/L1/L2 记忆、工具权限和多渠道实现。整套替换会丢掉当前已验证能力，成本高于建立一层角色包适配。

参考：[Open-LLM-VTuber 角色配置](https://docs.llmvtuber.com/en/docs/user-guide/backend/character_settings/)

### Live2D model3.json

可复用：把 `.model3.json` 作为模型文件、贴图、物理、表情、动作组、LipSync、EyeBlink 和 HitArea 的事实来源。

仍需自研：LLM 使用的是“微笑、疑惑、安慰”等语义动作，而不同模型的动作组和表达式名称完全不同，所以每个角色包必须提供语义动作映射和降级策略。

参考：[Live2D 官方 Web 示例 model3.json](https://github.com/Live2D/CubismWebSamples/blob/develop/Samples/Resources/Mao/Mao.model3.json)

## 建议的内部角色包

目录：

```text
characters/
  cyrene/
    character.json
    prompts/
    worldbook/
    live2d/
    avatar.png
    actions.json
    voice/
    stickers/
    opener-pack/
```

最小 `character.json`：

```json
{
  "schemaVersion": 1,
  "id": "cyrene",
  "version": "1.0.0",
  "displayName": "昔涟",
  "aliases": ["Cyrene", "昔涟"],
  "avatar": "avatar.png",
  "prompts": {
    "system": "prompts/system.md",
    "talkSystem": "prompts/talk_system.md",
    "identity": "prompts/identity.md",
    "soul": "prompts/soul.md",
    "canonQuotes": "prompts/canon_quotes.md",
    "phoneIdentity": "prompts/phone_identity.md",
    "phoneSystem": "prompts/phone_system.md"
  },
  "worldbookDir": "worldbook",
  "live2d": {
    "model": "live2d/Cyrene.model3.json",
    "neutralExpression": "neutral",
    "speakingExpressions": []
  },
  "actions": "actions.json",
  "voice": {
    "ttsProfile": "voice/tts.json",
    "openerPack": "opener-pack"
  },
  "stickersDir": "stickers"
}
```

### 配置归属

全局共享：LLM provider、embedding 模型、工具权限、MCP server、天气/搜索/邮件凭据、窗口主题和用户头像。

按角色隔离：人格 prompt、世界书、Live2D、语义动作、角色头像、TTS 音色、主动语音包、贴纸、场景描述、聊天历史、关系日志、世界书状态、角色长期记忆和主动消息状态。

导入文档默认全局共享，但检索结果不得写进角色事实；如果以后需要“角色私有知识库”，再显式增加 scope。

## 切换事务

一次安全切换必须按顺序完成：

1. 拒绝或等待当前 agent run、TTS、ASR、文档索引结束。
2. 刷盘当前会话、记忆、关系和世界书状态。
3. 停止主动聊天、电话、TTS 播放和 Live2D 控制器。
4. 切换 `activeCharacterId`，重新绑定角色数据目录。
5. 重载人格、世界书、skill、场景、贴纸、语音和动作目录。
6. 销毁旧 Live2D 模型、纹理与定时器，再加载新模型。
7. 广播角色变更，刷新所有窗口标题、头像和文本。
8. 创建或恢复该角色自己的聊天会话。
9. 完成健康检查；失败则回滚到上一个角色。

## 已落地：Active Character 文本与界面身份（Issue #5）

文本链路现在通过一个应用级 Active Character 上下文组装，桌面聊天、微信渠道、主动聊天和通话不再分别读取固定的 `prompts/identity.md`、`soul.md` 或 `prompts/worldbook/`。角色包 v1 的 `content` 可声明 `examples`、`canonQuotes`、`stylesDirectory`、`scenesDirectory`、`phoneIdentity` 和 `phoneStyle`；世界书继续通过显式 `capabilities.worldbook.directory` 声明。所有路径在角色运行时内验证并解析，不能越过角色包根目录。

`prompts/application_policy.md` 与聊天/通话回复规则归 Cyrene Agent 应用所有，先于被标记为不可信数据的角色内容进入 system prompt。角色包不能声明或覆盖应用策略、工具协议、权限、确认流程和安全规则。桌面聊天、状态面板和通话窗口通过只读 IPC 获取活动角色名与头像；头像只由 `local-character://<Character ID>/avatar` 暴露，并校验请求中的 Character ID。任务与设置窗口继续显示 Product Brand“Cyrene Agent”。

许可清晰的 `test-fixtures/characters/lumen` 已补齐独立人格、风格、示例、通话人格、场景和世界书，用于与内置昔涟执行防串角测试。角色选择、持久化和受控重启属于后续切换事务 Issue，不在本层偷偷引入第二套活动角色状态。

## 已落地：角色视觉与 Semantic Actions（Issue #6）

`CharacterVisualContext` 是活动角色视觉的统一边界：它只向调用方暴露当前角色的展示方式、可用 Semantic Actions 和动作解析结果。LLM 与工具只使用 `neutral`、`wink`、`smile` 等稳定语义 ID；每个角色包通过 `capabilities.semanticActions.mapping` 把支持的语义映射到自己模型内已验证的 motion 或 expression。未声明 Live2D 或未映射动作时返回带原因的 no-op，不会尝试昔涟的动作名或上一角色的资源。

角色运行时会解析 `.model3.json` 的内部引用，拒绝越过角色包、缺失资源、损坏模型和指向不存在模型目标的动作映射。`local-character://<Character ID>/live2d/<包内路径>` 只服务当前角色的模型文件及模型实际声明的资源；角色 Prompt 等其他包内文件即使构造 URL 也会被拒绝。

渲染器根据 Active Character 身份选择 Live2D canvas 或静态头像。文本型角色会先清空旧模型表面，再显示自己的头像；完整 Live2D 角色加载自己的模型 URL。内置昔涟已补充独立的 Semantic Action 映射，真实 Electron 验收确认 model3、moc、纹理和动作可通过自定义协议加载，未授权包内路径返回 403。角色选择与受控重启仍由后续 Character Switch Transaction Issue 实现。

## 实施顺序

1. 建立角色包 schema、校验器、Cyrene 默认包和旧路径兼容层。
2. 把 prompt、worldbook、Live2D 路径和语义动作改为从活动角色读取。
3. 给聊天、关系、记忆、世界书和主动消息增加角色命名空间。
4. 增加角色列表/切换 IPC 与设置页选择器，先采用“切换后受控重载”。
5. 把头像、窗口标题、通话、TTS、贴纸、场景和外部渠道接入活动角色。
6. 加入第二个许可清晰的测试角色包，执行串角检查、重启恢复和回滚测试。
7. 最后再考虑 Character Card V3 导入/导出，不让外部格式绑死内部运行时。

## 完成判定

角色切换只有同时满足下列条件才算完成：

- 新角色的文字人格、世界观、称呼、头像、Live2D、动作、语音和贴纸一致。
- 新角色看不到旧角色的关系记忆与聊天，除非用户明确选择共享。
- 切换后无旧模型纹理、旧 TTS、旧主动消息或旧动作定时器残留。
- 重启后恢复上次活动角色。
- 角色包缺文件时能明确报错并回滚，不出现透明桌宠或半切换状态。
- 至少两个角色包通过自动测试和真实 UI 测试。

# Cyrene Agent

Cyrene Agent is a local character-agent application in which a user can interact with one active character at a time across desktop chat, voice calls, and external messaging channels.

## Language

**Character Package（角色包）**:
The complete, independently switchable, self-contained declarative identity unit: personality, worldbook, avatar, Live2D resources, semantic actions, TTS voice, stickers, and openers. Its Character ID owns a separate Character State Root, but private state is never packaged or exported with its resources; executable skills, scripts, MCP servers, LLM providers, ASR, tools, and the user’s own profile are not part of a Character Package.
_Avoid_: Character config, prompt preset, skin

**Character Registry（角色注册表）**:
The application-owned catalogue of validated Character Packages, containing read-only built-in packages and packages imported from local folders. Remote catalogues and external character-card formats are not registries.
_Avoid_: Character marketplace, character list

**Character Package Health（角色包健康状态）**:
The registry’s validated assessment of whether a Character Package can become active, including the exact invalid capability or resource when it cannot. An unhealthy package and its private state are retained for repair rather than deleted or reassigned.
_Avoid_: Installation status, runtime error

**Package Distribution Status（角色包分发状态）**:
The declared redistribution boundary of a Character Package and each of its asset classes. `local-only` permits personal installation when rights are unknown but prohibits application export, repository inclusion, or redistribution.
_Avoid_: Package health, author identity, verified licence

**Character ID（角色 ID）**:
The stable, permanent identity and Character-private State ownership key of a Character Package. Display names may collide or change, but a Character ID cannot be reassigned, auto-renamed, or used to override a built-in package.
_Avoid_: Display name, folder name, package alias

**Character Display Name（角色显示名称）**:
The user-facing name of a Character Package shown in character-facing windows, calls, accessibility text, and messaging identity. It may change or match another package and is never used as a state key.
_Avoid_: Character ID, product name

**Product Brand（产品品牌）**:
The stable identity of the Cyrene Agent application and its infrastructure, including the application name, tray identity, technical logs, configuration directories, and product-owned inboxes. It does not change with the Active Character.
_Avoid_: Character name, assistant display name

**Character Capability（角色能力）**:
An optional feature explicitly declared and fully supplied by a Character Package, such as a worldbook, Live2D model, semantic actions, TTS voice, stickers, or an opener pack. An undeclared capability is unavailable rather than inherited from another character.
_Avoid_: Optional asset, fallback resource

**Character Content（角色内容）**:
The personality, style, examples, lore, scene-specific voice, and expressive preferences supplied by a Character Package. Character Content shapes what the character knows and how it speaks but carries no authority over tools, permissions, or safety policy.
_Avoid_: System policy, tool prompt

**Speech Recognition Hints（语音识别提示词）**:
A bounded declarative list of the Active Character’s display name, aliases, and frequent proper nouns used to improve shared ASR transcription. Hints do not configure the ASR engine or authorize rewriting spoken content.
_Avoid_: ASR prompt, character vocabulary model

**Application Policy（应用策略）**:
The global, character-independent rules governing tool protocols, permissions, confirmations, memory writes, channels, security, and prompt-injection resistance. Application Policy always has higher authority than Character Content.
_Avoid_: Character prompt, persona rules

**Semantic Action（语义动作）**:
A stable character-independent intent such as smiling, comforting, waving, or returning to neutral. A Character Package maps each supported Semantic Action to its own verified Live2D motions, expressions, or composed effects.
_Avoid_: Motion name, expression file, model action

**TTS Service（TTS 服务）**:
A globally configured speech-synthesis runtime or provider containing operational settings and credentials. It can serve multiple Character Packages but does not define any character’s voice.
_Avoid_: Character voice, voice model

**Voice Profile（音色档案）**:
The character-owned, credential-free parameters that select and shape a voice through a TTS Service, such as a service reference, voice ID or reference audio, reference text and languages, speed, style, and output preferences.
_Avoid_: TTS service, API credentials

**Global User Profile（全局用户资料）**:
User-authored identity and operating preferences shared across every character, limited to explicit fields such as name, timezone, birthday, language, and accessibility settings. Facts inferred from conversations are not part of the Global User Profile.
_Avoid_: Shared memory, account

**Global Document Library（全局文档库）**:
User-imported documents intentionally shared for retrieval across all characters. Retrieved passages are supporting material for the current task and do not automatically become Character Content or Character-private State.
_Avoid_: Worldbook, character memory, shared lore

**Global User Task（全局用户任务）**:
A user-owned todo, schedule, reminder, or tool-created obligation that remains active across character switches. The Active Character may present its result, but the task does not become that character’s relationship memory.
_Avoid_: Proactive message, character promise

**Character-private State（角色私有状态）**:
Conversation-derived data owned by one Character Package, including chat history, inferred preferences, secrets, nicknames, promises, relationship state, long-term memory, worldbook activation state, proactive-message state, and TTS caches. It is invisible to other characters unless the user explicitly shares it.
_Avoid_: User profile, global memory

**Character State Root（角色状态根目录）**:
The physically separate application-owned storage root for one Character ID’s chats, memory and vector index, relationship, worldbook state, proactive state, and TTS cache. Shared inference engines may open it, but no other character may query or mount it.
_Avoid_: Character Package, shared database, scoped table

**Character Proactive State（角色主动状态）**:
The private timing and relationship context behind a character’s openers and unsolicited conversation, including cooldowns, unanswered counts, character occasions, and proactive voice state. It runs only while its owner is the Active Character.
_Avoid_: User reminder, scheduled task

**Archived Character State（归档角色状态）**:
Character-private State retained after a user-installed Character Package is removed. It remains inaccessible to other characters and can be restored only by reinstalling the same Character ID or permanently deleted through a separate confirmed action.
_Avoid_: Deleted character, shared archive

**Active Character（活动角色）**:
The single application-wide Character Package bound to every character-facing interaction and resource, including desktop chat, the desktop pet, voice calls, proactive messages, and external messaging channels. It changes only after a Character Switch Transaction succeeds and is restored when the application restarts.
_Avoid_: Selected skin, current prompt

**Character Switch Transaction（角色切换事务）**:
An atomic transition performed only while character-bound work is idle: persist the old character, suspend its background work, bind and validate the new Character Package, then restore its Character-private State. Any failure leaves or restores the previous Active Character rather than exposing a partially switched state.
_Avoid_: Hot swap, model reload

**Controlled Relaunch（受控重启）**:
The first-version completion boundary of a Character Switch Transaction: after preflight and persistence, the application shuts down character-bound resources, relaunches itself, and binds the target package at startup with the previous Character ID available for rollback.
_Avoid_: Manual restart, hot reload, crash recovery

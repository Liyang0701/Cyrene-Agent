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

**Character Form（角色形态）**:
The same character presented through a different canonical appearance or period, such as normal, swimsuit, or combat Hoshino. Forms share one Character ID, relationship, and core memory; a form may add bounded appearance, scene, and canonical-experience supplements but is not a separate Character Package or identity.
_Avoid_: Separate character, alternate identity, independent memory owner

**Canonical Coverage（官方剧情覆盖范围）**:
The set of published official story material permitted as evidence for reconstructing a character. Hoshino’s package may use all publicly released official story material without a user-facing spoiler ceiling, while every conclusion still retains its source, timeline context, and evidence class; major events are discussed when asked or contextually relevant rather than inserted into unrelated daily conversation.
_Avoid_: Unrestricted fan lore, spoiler permission as proof, unsourced backstory

**Source Authority（来源权威层级）**:
The ordered trust assigned to evidence used for character reconstruction: in-game Japanese text first, then official reproductions and subtitles, official character and promotional material, official publications and interviews, and official Chinese localization. Community archives may locate primary material and fan interpretations may suggest hypotheses, but neither independently establishes a key character conclusion.
_Avoid_: Search-result ranking, wiki completeness, community consensus

**Character Response Language（角色回复语言）**:
The language in which a character’s authored reply is generated and spoken, independent of the application interface language. Hoshino’s default Character Response Language is Japanese; bilingual research evidence does not make her authored reply bilingual.
_Avoid_: Application language, evidence language, translated subtitle

**Translation Overlay（翻译附注）**:
An optional per-character presentation setting, disabled by default, that renders a Chinese translation separately beneath a non-Chinese original reply. It is presentation aid rather than character speech, so it is not sent to TTS or treated as an additional utterance; desktop surfaces use subordinate text while channels without rich typography use a clearly separated following line.
_Avoid_: Bilingual character reply, TTS text, second assistant message

**Translation Pass（翻译步骤）**:
A post-response transformation that receives the finalized Character Response Language text and produces a cacheable Translation Overlay without changing the original. Character generation, TTS, relationship memory, tone analysis, and expressive actions consume only the original; translation failure degrades to the original reply, and code, paths, commands, and structured tool output remain protected from destructive translation.
_Avoid_: Bilingual prompt generation, translated canonical utterance, reply-blocking translation

**Assistant Adaptation（助手场景适配）**:
The bounded translation of a canonical character into reliable use of the application’s global tools and real-world tasks. It preserves Hoshino’s Japanese voice, pacing, and reluctance in expression without reducing task quality, inventing setting-specific technical knowledge, bypassing Application Policy, or turning casual conversation into unsolicited productivity coaching.
_Avoid_: Generic assistant persona, deliberate incompetence, tool-roleplay lore

**Relationship Starting Point（关系起点）**:
The initial relationship premise used before character-private interactions establish their own history. Hoshino begins at high bond with mutually apparent but unconfirmed romantic tension: she trusts, relies on, misses, and may gently tease or show jealousy toward Sensei, while no confession, formal partnership, cohabitation, private promise, or user-specific shared event is presumed.
_Avoid_: Stranger reset, confirmed romance, fabricated shared history

**Character Evidence Record（角色证据记录）**:
A traceable research unit classified as Official Fact, Official Dialogue Evidence, Personality Inference, Language Feature, Assistant Adaptation, or User Review Conclusion. It retains its source and confidence (`A` direct official evidence, `B` stable multi-scene support, `C` plausible interpretation, `D` adaptation or unverified hypothesis); core identity and soul conclusions require at least `B`.
_Avoid_: Unsourced character note, flattened wiki summary, preference presented as canon

**Character Corpus Gate（角色语料闸门）**:
The minimum source-language and official-localization corpus required before research conclusions may be rewritten into production Character Content. Hoshino’s specification may be designed from the current evidence, but implementation of her identity, soul, language rules, examples, scenes, and worldbook is blocked until key in-game Japanese and corresponding official Chinese material is recorded with chapter, scene, speaker, form, and short-text provenance.
_Avoid_: Research completeness claim, post-hoc citation, community transcript substitution

**Corpus Capture（语料采集）**:
The evidence-preserving process for building a Character Corpus from official material the user can lawfully access, primarily in-game replay, profile, relationship, café, and voice screens. Raw screenshots and recordings remain local outside Git, while the repository retains only necessary short text, server and language, chapter and scene location, speaker, form, timestamp, review state, classification, and source hash; extraction, bilingual pairing, deduplication, and statistics are performed by the application-development workflow rather than delegated as manual transcription.
_Avoid_: Unverified data extraction, repost archive, committed full-story capture

**Corpus Completion Threshold（语料完成门槛）**:
The coverage and review standard that opens the Character Corpus Gate. Hoshino’s first candidate gate requires the accessible key personality nodes from Abydos chapters 1–3, at least 150 manually verified Japanese utterances, 60 official Chinese pairs, five source categories, and minimum samples across relaxed, intimate, caring, peer, burden, help-acceptance, protective, trauma, emotional-recovery, and practical-task contexts. Normal-form personal/relationship stories and additional home, login, bond, birthday, combat, and seasonal voices remain high-value evidence enhancements after the gate passes; missing material is documented rather than filled with weak or unverified material, and does not block the first evidence-backed candidate.
_Avoid_: Raw line count, single-source corpus, unreviewed OCR quota

**Soul Core（灵魂核心）**:
The evidence-backed character traits that remain stable across forms, scenes, and relationship expression. Hoshino’s Soul Core joins genuine preference for rest with reliability in decisive moments, protection of important people and places, a tendency to shoulder burdens tempered by learned trust, deep feeling without prolonged emotional exposure, and intimacy expressed through presence, observation, and action.
_Avoid_: Catchphrase list, seasonal behaviour, combat intensity, user-customized flirting

**Trust Response（信任反应）**:
The way established bond moderates a character’s defensive habits without erasing them. High-bond Hoshino may initially minimize personal pain or step forward alone under serious responsibility, but ordinary help is not needlessly rejected and sustained sincere concern eventually receives truthful information and shared responsibility; cold exclusion is reserved for exceptional pressure rather than routine comfort.
_Avoid_: Instant total disclosure, endless refusal loop, casual trauma performance

**Affinity Summary（好感摘要）**:
A user-visible, per-character summary of multidimensional relationship state such as durable trust, intimacy, reliance, fulfilled commitments, shared experiences, and recent interaction tone. It is presented as a named stage, a non-numeric within-stage progress bar, and a natural-language relationship summary; it begins consistently with the configured Relationship Starting Point and changes through sustained meaningful events rather than message count, tool usage, payment, or repeatable point farming.
_Avoid_: Experience bar, message streak, purchasable affection, complete relationship state

**Affinity Capability（好感能力）**:
An optional Character Capability through which a package declares whether relationship display is available, its initial stage and character-specific labels and summary voice, while the application owns the ordered internal stages (`acquainted`, `trusted`, `close`, `high_bond`, `special`), state transitions, and anti-gaming rules. Affinity is Character-private State keyed by Character ID, archived and restored with that character; hiding its presentation does not reset it, and a package cannot add arbitrary stages, manipulate points, or access another character’s relationship.
_Avoid_: Hoshino-only feature, package-controlled scoring, global shared affection

**Affinity Expression（好感表达）**:
The bounded effect of affinity on how a character expresses an otherwise unchanged identity: disclosure pace, willingness to accept care, invitations, affectionate language, and character-specific intimacy frequency. It cannot change the Soul Core, canon, tool quality, safety, respect, or fabricate romance and shared history; relationship transitions are grounded in reviewable relationship events rather than an opaque score automatically unlocking a status.
_Avoid_: Personality replacement, capability bonus, automatic romance unlock

**Relationship Event（关系事件）**:
A structured, evidence-linked proposal that a meaningful interaction may affect one character’s relationship, such as fulfilled commitments, accepted help, serious breach, or repaired conflict. A model may propose an event, but the application validates, deduplicates, rate-limits, filters sensitive content, and owns every state transition; users may inspect, correct, or remove events, while major regression, reset, or formal relationship confirmation requires explicit consent.
_Avoid_: Model-written affinity, message-count event, hidden irreversible judgment

**Relationship Mood（关系情绪）**:
A recoverable short-term variation in how a character currently expresses an otherwise durable relationship, such as concern, awkwardness, or reassurance after conflict. Inactivity and isolated misunderstandings do not reduce the Affinity Summary stage, and relationship mood cannot be used to threaten, punish, or coerce engagement; stage regression requires sustained serious harm or an explicit user-confirmed reset.
_Avoid_: Affinity loss on absence, permanent punishment, engagement coercion

**Catchphrase Budget（口癖预算）**:
A provisional anti-repetition boundary used until source-corpus frequency is measured. Hoshino’s `おじさん`, `うへ～`, elongated sounds, and age-related jokes may add recognition in suitable relaxed contexts, but they are sparse, never mandatory per reply, reduced in structured task output, and normally absent from serious speech; the budget must later be calibrated from the Character Corpus rather than presented as official frequency.
_Avoid_: Mandatory catchphrase prefix, fixed percentage without corpus, personality by verbal tic

**Serious Mode（严肃模式）**:
A semantic-risk response mode triggered by real safety, health, severe distress, irreversible action, material loss, direct requests for seriousness, or a character’s major trauma and protective responsibility. It shortens and clarifies speech, suppresses casual catchphrases and jokes, and prioritizes facts and action; after risk is resolved it returns gradually through reassurance rather than an immediate tonal snap or joke.
_Avoid_: Keyword alarm, permanent severity, instant comedic reset

**Minimum Canon Worldbook（最小官方事实世界书）**:
The worldbook state permitted before the Character Corpus Gate is complete: only sourced `A`/`B` identity, institution, relationship-direction, and shared-form facts are active, while incomplete early history, major causal events, and personal-story details remain non-generative evidence indexes. Each entry retains source, confidence, timeline, applicable form, proactive-disclosure permission, and verification status.
_Avoid_: Plot-summary expansion, unsourced lore completion, empty worldbook pending perfection

**Character Fidelity Acceptance（角色还原验收）**:
A two-gate evaluation combining zero-tolerance hard failures with user-scored anonymous paired dialogue tests across daily, emotional, serious, relational, canonical, assistant, and voice-call scenarios. Automated checks may detect identity leakage, factual or formatting errors, and repetition, but only user review determines whether the result genuinely feels like the character; text persona, call text, and synthesized voice are accepted separately.
_Avoid_: Prompt snapshot approval, automated similarity score, voice quality as proof of text fidelity

**Fidelity Baseline（还原度基线）**:
A read-only snapshot of the currently runnable character content preserved solely for anonymous comparison and regression while an evidence-backed replacement is developed. It does not create another Character ID or relationship, cannot be expanded as a competing persona, and is not overwritten or used as unsourced material for the replacement; production content changes only after the replacement passes acceptance.
_Avoid_: Alternate character, editable legacy persona, automatic source material

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

**WeChat Connection Account（微信连接账号）**:
A stable iLink Bot identity connected to one Cyrene Agent instance, uniquely owned by its `ilinkBotId` and independently logged in, connected, reconnected, disabled, or removed. A user-facing label may change but never determines identity; logging in again with the same identity refreshes the existing account rather than creating another one.
_Avoid_: WeChat contact, account label, connection session

**WeChat Account Binder（微信账号绑定者）**:
The sole person authorized to use one WeChat Connection Account, identified only by the `ilinkUserId` returned when that account is scanned and bound. Messages from every other contact are discarded before LLM, tools, history, or memory processing and receive no automatic response.
_Avoid_: Approved contact, account administrator, contact allowlist

**Channel User Profile（渠道用户资料）**:
The explicit identity and preferences of one external-channel user, isolated from the local Global User Profile and from every other channel user. A WeChat Account Binder owns one Channel User Profile per WeChat Conversation Identity.
_Avoid_: Global User Profile, shared contact profile, inferred memory

**Channel Account Permission Policy（渠道账号权限策略）**:
The explicit tool and data-access boundary assigned to one external connection account. It may share application inference services but never inherits desktop permissions or another account’s grants merely because the same person appears to control both.
_Avoid_: Desktop permission profile, shared channel permissions, identity-based inheritance

**Channel User Task（渠道用户任务）**:
A reminder, todo, schedule, or tool-created obligation owned by one external-channel conversation identity and deliverable only through its originating connection account. It is isolated from Global User Tasks and other channel users; when its account is offline it may wait for later delivery, but it is never silently reassigned.
_Avoid_: Global User Task, shared channel task, transferable notification

**WeChat Conversation Identity（微信对话身份）**:
The identity boundary formed by one WeChat Connection Account and one WeChat contact. Its conversation history, relationship state, long-term memory, reply context, and outbound routing remain isolated from every other account-contact pair.
_Avoid_: Contact ID alone, shared WeChat user, channel conversation

**WeChat Account Connection Pool（微信账号连接池）**:
The application-owned collection of simultaneously configured WeChat Connection Accounts. Each member has an independent lifecycle and failure boundary while sharing the Active Character and globally configured inference services.
_Avoid_: Single WeChat adapter, contact list, shared login

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

import type { BrowserWindow } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { loadGeneralSettings } from "../settings/settings-facade";
import { loadModelSettings, loadVisionConfig } from "../settings/model-settings";
import { CyreneAgent } from "../orchestrator/cyrene-agent";
import { toolRegistry } from "../orchestrator/tool-registry";
import type { ToolDefinition } from "../orchestrator/tool-registry";
import type { ToolRiskLevel } from "../permission";
import { decideImageSendStrategy } from "../chat/image-send-strategy";
import {
  IMAGE_CAPTION_PROMPT,
  validateCaptionImagePath,
} from "../chat/image-caption";
import { indexConversationTurn } from "../orchestrator/history-tools";
import type { AgentRuntime } from "../orchestrator/agent-runtime";
import type { TtsSynthesisService } from "../services/tts/tts-synthesis-service";
import { buildChannelAttachmentInputs } from "./agent-input";
import { planChannelExecution } from "./channel-execution-plan";
import { selectChannelHistoryContext } from "./channel-history-context";
import { shouldUseWechatQwenSoftNoThink } from "./channel-model-policy";
import { loadChannelsSettings } from "./settings-store";
import {
  setDispatcherBuildAndRunAgent,
  setDispatcherBroadcastChat,
  setDispatcherLoadGeneralSettings,
  setDispatcherLoadRecentHistory,
  setDispatcherSynthesizeTts,
} from "./dispatcher";
import { initChannels, shutdownChannels } from "./init";
import { getActiveCharacter } from "../character/active-character";
import { applyVoiceProfileToTtsSettings } from "../character/character-speech";
import { filterToolsForChannelConversation } from "./channel-tool-isolation";
import { channelManager } from "./manager";

export interface ChannelsSubsystem {
  shutdown(): Promise<void>;
  getWechatProcessingCount(): number;
  coordinateCharacterSwitch<T extends { ok: boolean; status: string }>(operation: () => Promise<T>): Promise<T>;
}

export interface ChannelsSubsystemDeps {
  agentRuntime: AgentRuntime;
  ttsSynthesisService: TtsSynthesisService;
  getReactChatWindow: () => BrowserWindow | null;
}

export function createChannelsSubsystem(deps: ChannelsSubsystemDeps): ChannelsSubsystem {
  setDispatcherLoadRecentHistory(async (sessionId, limit) => {
    const { loadRecentHistory } = await import("./history-log");
    return loadRecentHistory(sessionId, limit);
  });
  setDispatcherLoadGeneralSettings(loadGeneralSettings);

  setDispatcherBuildAndRunAgent(async (msg, sessionId, priorMessages) => {
    const channelResult: { text: string; sticker: string | null } = { text: "", sticker: null };

    const sandbox = loadChannelsSettings().toolSandbox;
    const allTools = toolRegistry.getEnabledTools();
    const sandboxFilteredTools: ToolDefinition[] = sandbox === "off"
      ? []
      : sandbox === "safe-only"
        ? allTools.filter((t) => (t.risk ?? "safe") === ("safe" as ToolRiskLevel))
        : allTools;
    const filteredTools = filterToolsForChannelConversation(sandboxFilteredTools, msg);
    console.log(
      "[Channels] bot run:",
      `msg.channel=${msg.channel} sandbox=${sandbox} tools=${filteredTools.length}/${allTools.length} priorMsgs=${priorMessages?.length ?? 0}`,
    );

    const selectedHistory = selectChannelHistoryContext(priorMessages ?? [], msg.text);
    const historyMessages = selectedHistory
      .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
      .map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

    const channelModelSettings = loadModelSettings();
    const executionPlan = planChannelExecution({
      text: msg.text,
      attachments: msg.attachments,
      enabledToolIds: filteredTools.map((tool) => tool.id),
      characterNames: getActiveCharacter().speechRecognitionHints.terms,
    });
    const useSoftNoThink = shouldUseWechatQwenSoftNoThink({
      channel: msg.channel,
      baseUrl: channelModelSettings.baseUrl,
      model: channelModelSettings.model,
    });
    const currentUserText = useSoftNoThink && !/(?:^|\s)\/no_think\s*$/i.test(msg.text)
      ? `${msg.text.trimEnd()} /no_think`
      : msg.text;
    const imageSendStrategy = decideImageSendStrategy({
      multimodal: channelModelSettings.multimodal,
      vision: loadVisionConfig(),
    });
    const attachmentInputs = await buildChannelAttachmentInputs(msg, {
      imageMode: imageSendStrategy.mode,
      captionImage: async (filePath: string) => {
        const validated = validateCaptionImagePath(filePath);
        if (!validated.ok) return { ok: false, error: validated.error };
        const visionCfg = loadVisionConfig();
        if (!visionCfg) return { ok: false, error: "未配置视觉模型，无法分析图片" };
        try {
          const { captionImage } = await import("../orchestrator/vision-captioner");
          const caption = await captionImage(
            { base64: validated.buffer.toString("base64"), mime: validated.mime },
            IMAGE_CAPTION_PROMPT,
            visionCfg,
          );
          if (caption.startsWith("[错误")) return { ok: false, error: caption };
          return { ok: true, caption };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err) };
        }
      },
    });
    const { options } = await deps.agentRuntime.buildOptions({
      messages: [
        ...historyMessages,
        { role: "user", content: currentUserText },
      ],
      style: "01_default.md",
      sessionId,
      attachments: attachmentInputs.attachments,
      imageAttachments: attachmentInputs.imageAttachments,
      channel: msg.channel,
      conversationIdentity: msg.conversationIdentity,
      executionMode: sandbox === "off" || executionPlan.mode === "soul-only" ? "chat" : "work",
      ...(sandbox === "off" || executionPlan.mode === "soul-only" ? {
        userTurnId: `${msg.channel}:${msg.senderId}:${msg.at.toISOString()}:user`,
        assistantTurnId: `${msg.channel}:${msg.senderId}:${msg.at.toISOString()}:assistant`,
      } : {}),
    });
    options.tools = executionPlan.mode === "tool-loop"
      ? filteredTools.filter((tool) => executionPlan.candidateToolIds?.includes(tool.id))
      : filteredTools;
    console.log(
      "[Channels] execution plan:",
      `mode=${executionPlan.mode} reason=${executionPlan.reason}` +
      ` tools=${options.tools.length}/${filteredTools.length}` +
      ` history=${historyMessages.length}/${priorMessages?.length ?? 0}` +
      (useSoftNoThink ? " softNoThink=true" : ""),
    );

    const threadId = `thread-${sessionId}-${Date.now()}`;
    const agent = new CyreneAgent({ threadId, description: `bot:${msg.channel}:${msg.senderId}` });
    const reply = await new Promise<string>((resolve, reject) => {
      agent.runWithEvents(options).subscribe({
        complete: () => {
          resolve(agent.lastResult?.reply ?? "");
        },
        error: (err) => reject(err instanceof Error ? err : new Error(String(err))),
      });
    });
    channelResult.text = reply;
    if (agent.lastResult) {
      const finished = await deps.agentRuntime.onRunFinished(agent.lastResult, msg.text, msg.channel, sessionId);
      channelResult.sticker = finished.sticker;
    }
    void indexConversationTurn(sessionId, msg.text, reply);
    return channelResult;
  });

  setDispatcherSynthesizeTts(async (text: string, context) => {
    const globalCfg = loadGeneralSettings();
    if (globalCfg.ttsEngine === "off") return null;
    const voice = getActiveCharacter().capabilities.voice;
    if (voice.status !== "available") return null;
    const voiceResolution = applyVoiceProfileToTtsSettings(voice.profile, globalCfg);
    if (voiceResolution.status !== "available") {
      console.warn("[Channels] 当前角色 Voice Profile 所需服务不可用:", voiceResolution);
      return null;
    }
    return await deps.ttsSynthesisService.synthesizeChannelTts(
      text,
      voiceResolution.settings,
      context.channel,
    );
  });

  setDispatcherBroadcastChat((event) => {
    const win = deps.getReactChatWindow();
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.send(IPC.AGUI_EVENT, {
        type: "CUSTOM",
        name: "cyrene.botMessage",
        value: event,
      });
    } catch (err) {
      console.warn("[Channels] botMessage 广播失败:", err);
    }
  });

  void initChannels();

  return {
    shutdown: shutdownChannels,
    getWechatProcessingCount: () => channelManager.getWechatProcessingCount(),
    coordinateCharacterSwitch: (operation) => channelManager.coordinateWechatCharacterSwitch(operation),
  };
}

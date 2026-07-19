import type { MobileMessageSegmentationMode } from "../../shared/preferences";
import type { CharacterTranslationDisplayResult } from "../../shared/character-response";
import type { ChannelManager } from "./manager";
import type { ActiveCharacterResponseService } from "../character/character-response-service";
import { appendHistory as appendChannelHistory } from "./history-log";
import { appendLog as appendChannelLog, type LogEntry } from "./message-log";
import type { ChannelId, IncomingMessage, OutgoingMessage } from "./types";
import {
  buildTextOutgoingParts,
  buildTranslationAnnotationText,
} from "./character-response-presentation";

export type ProactiveMobileChannel = Extract<ChannelId, "wechat" | "feishu">;

export interface RecentProactiveChannelRecipient {
  targetId: string;
  threadId?: string;
  sessionId: string;
  updatedAt: number;
}

export interface ProactiveChannelRecipientRegistry {
  remember(message: IncomingMessage, sessionId: string): void;
  get(channel: ProactiveMobileChannel): RecentProactiveChannelRecipient | null;
}

export function createProactiveChannelRecipientRegistry(): ProactiveChannelRecipientRegistry {
  const recipients = new Map<ProactiveMobileChannel, RecentProactiveChannelRecipient>();
  return {
    remember(message, sessionId): void {
      const targetId = message.chatId.trim();
      if (!targetId || !sessionId) return;
      recipients.set(message.channel, {
        targetId,
        ...(message.threadId ? { threadId: message.threadId } : {}),
        sessionId,
        updatedAt: message.at.getTime(),
      });
    },
    get(channel): RecentProactiveChannelRecipient | null {
      return recipients.get(channel) ?? null;
    },
  };
}

const defaultRecipientRegistry = createProactiveChannelRecipientRegistry();

export function rememberProactiveChannelRecipient(message: IncomingMessage, sessionId: string): void {
  defaultRecipientRegistry.remember(message, sessionId);
}

export function canStartProactiveChannelDelivery(
  channel: ProactiveMobileChannel,
  manager: Pick<ChannelManager, "getAdapter">,
  recipientRegistry: ProactiveChannelRecipientRegistry = defaultRecipientRegistry,
): boolean {
  const adapter = manager.getAdapter(channel);
  return adapter?.getStatus().phase === "running" && recipientRegistry.get(channel) !== null;
}

export type ProactiveChannelDeliveryResult =
  | { kind: "committed"; deliveredParts: number; totalParts: number }
  | { kind: "cancelled"; reason: string };

interface ProactiveChannelDeliveryInput {
  channel: ProactiveMobileChannel;
  text: string;
  /** 真实运行时使用：在原文成功送达后异步生成同一条展示附注。 */
  characterResponse?: ActiveCharacterResponseService;
  mobileMessageSegmentation: MobileMessageSegmentationMode;
  manager: Pick<ChannelManager, "getAdapter">;
  recipientRegistry?: ProactiveChannelRecipientRegistry;
  appendHistory?: typeof appendChannelHistory;
  appendLog?: (entry: Omit<LogEntry, "at">) => void;
  canContinue?: () => boolean;
}

async function sendTranslationAnnotation(
  input: ProactiveChannelDeliveryInput,
  adapter: NonNullable<ReturnType<ProactiveChannelDeliveryInput["manager"]["getAdapter"]>>,
  recipient: RecentProactiveChannelRecipient,
  translation: CharacterTranslationDisplayResult | undefined,
): Promise<boolean> {
  const text = buildTranslationAnnotationText(translation);
  if (!text) return false;
  if (input.canContinue && !input.canContinue()) return false;
  if (adapter.getStatus().phase !== "running") return false;
  try {
    const result = await adapter.send({
      channel: input.channel,
      targetId: recipient.targetId,
      ...(recipient.threadId ? { threadId: recipient.threadId } : {}),
      parts: [{ kind: "text", text }],
    });
    return result.ok;
  } catch {
    return false;
  }
}

function isCurrentProactiveTranslationConfiguration(
  service: ActiveCharacterResponseService,
  expected: ReturnType<ActiveCharacterResponseService["getStatus"]>,
  responseCharacterId: string,
): boolean {
  try {
    const current = service.getStatus();
    return current.enabled
      && current.characterId === expected.characterId
      && current.targetLanguage === expected.targetLanguage
      && responseCharacterId === expected.characterId;
  } catch {
    return false;
  }
}

export async function sendProactiveChannelMessage(
  input: ProactiveChannelDeliveryInput,
): Promise<ProactiveChannelDeliveryResult> {
  const adapter = input.manager.getAdapter(input.channel);
  if (!adapter || adapter.getStatus().phase !== "running") {
    return { kind: "cancelled", reason: "channel_offline" };
  }

  const recipient = (input.recipientRegistry ?? defaultRecipientRegistry).get(input.channel);
  if (!recipient) return { kind: "cancelled", reason: "recipient_unavailable" };

  const originalText = input.text.trim();
  const originalParts = buildTextOutgoingParts(originalText, input.mobileMessageSegmentation)
    .filter((part) => part.text.trim().length > 0);
  if (originalParts.length === 0) return { kind: "cancelled", reason: "empty_text" };

  const deliveredOriginalTexts: string[] = [];
  let deliveredParts = 0;
  for (const part of originalParts) {
    if (input.canContinue && !input.canContinue()) break;
    if (adapter.getStatus().phase !== "running") break;
    const message: OutgoingMessage = {
      channel: input.channel,
      targetId: recipient.targetId,
      ...(recipient.threadId ? { threadId: recipient.threadId } : {}),
      parts: [part],
    };
    try {
      const result = await adapter.send(message);
      if (!result.ok) break;
      deliveredParts += 1;
      deliveredOriginalTexts.push(part.text);
    } catch {
      break;
    }
  }

  if (deliveredOriginalTexts.length === 0) return { kind: "cancelled", reason: "send_failed" };

  const deliveredText = deliveredOriginalTexts.join("");
  (input.appendHistory ?? appendChannelHistory)(recipient.sessionId, "assistant", deliveredText);
  (input.appendLog ?? appendChannelLog)({
    dir: "outgoing",
    channel: input.channel,
    senderId: recipient.targetId,
    chatId: recipient.targetId,
    text: deliveredText,
    hasAttachments: false,
  });

  const service = input.characterResponse;
  let responseStatus: ReturnType<ActiveCharacterResponseService["getStatus"]> | undefined;
  try {
    responseStatus = service?.getStatus();
  } catch {
    responseStatus = undefined;
  }
  if (service && responseStatus?.enabled) {
    void service.complete(originalText)
      .then((response) => {
        if (!isCurrentProactiveTranslationConfiguration(service, responseStatus, response.characterId)) {
          return false;
        }
        return sendTranslationAnnotation(input, adapter, recipient, response.translation);
      })
      .catch(() => false);
  }

  return {
    kind: "committed",
    deliveredParts,
    totalParts: originalParts.length,
  };
}

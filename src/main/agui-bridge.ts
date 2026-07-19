// AG-UI IPC 桥：把 CyreneAgent 的事件流透传给渲染进程。
//
// 架构：
//   渲染进程  ──invoke(AGUI_RUN, input)──>  本桥  ──>  CyreneAgent.runWithEvents()
//     ▲                                        │ 订阅 Observable<BaseEvent>
//     └── send(AGUI_EVENT, baseEvent) ─────────┘ 每个 AG-UI 事件转发给渲染进程
//
// Observable 是内存流、跨不过进程边界，所以必须这层桥：
// 主进程订阅 agent 的 events$，每个 BaseEvent 通过 webContents.send 推给渲染进程。
//
// 本桥只管"跑 agent + 转发事件 + 跑完后做副作用"。
// 上下文构建和副作用由调用方（index.ts）注入回调，保持本模块不依赖 index.ts 内部函数。
import { ipcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { IPC } from "../shared/ipc-channels";
import { Subscription } from "rxjs";
import {
  CyreneAgent,
  type CyreneRunOptions,
  type CyreneRunResult,
} from "./orchestrator/cyrene-agent";
import { indexConversationTurn } from "./orchestrator/history-tools";
import type { RelationshipChannel } from "./relationship/relationship-log";
import type { ActiveCharacterResponse } from "./character/character-response-service";

/** 渲染进程发起 run 时传的输入。 */
export interface AguiRunInput {
  messages: unknown[];   // 原始 {role, content}[]，主进程会 normalize
  style: string;         // 人格 style 文件名
  sessionId?: string;    // 会话 ID，用于历史召回按会话隔离（可选，默认 "default"）
  /** 外部渠道入口。桌面聊天不传；微信/飞书用于注入渠道语气规则。 */
  channel?: RelationshipChannel;
  /** 本轮附件（文本内容，临时注入系统上下文，不存历史）。 */
  attachments?: { name: string; text: string }[];
  /** 本轮图片附件。主进程会安全读取并转成 OpenAI-compatible image_url content block。 */
  imageAttachments?: { name: string; filePath: string; mime?: string }[];
}

/** 调用方（index.ts）注入：把输入转成 agent 需要的 options（含 system prompt 拼接）。 */
export type BuildOptionsFn = (input: AguiRunInput) => Promise<{
  options: CyreneRunOptions;
  /** 跑完后副作用需要的信息。 */
  latestUserText: string;
}>;

/** 调用方注入：agent 跑完后的副作用（记忆/sticker/表情/广播）。 */
export type OnRunFinishedFn = (result: CyreneRunResult, latestUserText: string) => Promise<void> | void;

/** 调用方注入：拿聊天窗口（广播副作用用，可空）。 */
export type GetChatWindowFn = () => { webContents: WebContents; isDestroyed(): boolean } | null;

export interface AguiConversationLifecycle {
  onUserMessage(): void;
  onConversationStarted(): void;
  onConversationEnded(): void;
}

export interface AguiCharacterResponseLifecycle {
  getStatus(): Readonly<{
    enabled: boolean;
    characterId: string;
    targetLanguage?: "zh-CN";
  }>;
  complete(originalText: string, signal?: AbortSignal): Promise<ActiveCharacterResponse>;
}

function isCurrentCharacterTranslationConfiguration(
  lifecycle: AguiCharacterResponseLifecycle,
  expected: ReturnType<AguiCharacterResponseLifecycle["getStatus"]>,
  response?: ActiveCharacterResponse,
): boolean {
  try {
    const current = lifecycle.getStatus();
    return current.enabled
      && current.characterId === expected.characterId
      && current.targetLanguage === expected.targetLanguage
      && (!response || response.characterId === expected.characterId);
  } catch {
    return false;
  }
}

/** 单次对话的活跃订阅（用于取消）。键 = runId。 */
const activeRuns = new Map<string, {
  subscription: Subscription;
  endLifecycle: () => void;
  responseAbortController: AbortController;
}>();

let buildOptionsFn: BuildOptionsFn | null = null;
let getChatWindowFn: GetChatWindowFn = () => null;

/**
 * 注册 AG-UI IPC。由 index.ts 在 app.whenReady() 调一次。
 *
 * @param buildOptions 把渲染进程输入转成 agent options（含上下文构建）
 * @param onRunFinished agent 跑完的副作用（记忆/sticker 等）
 * @param getChatWindow 聊天窗口（事件要发到这里）
 */
export function registerAgUiIpc(
  buildOptions: BuildOptionsFn,
  onRunFinished: OnRunFinishedFn,
  getChatWindow: GetChatWindowFn,
  lifecycle?: AguiConversationLifecycle,
  characterResponse?: AguiCharacterResponseLifecycle,
): void {
  buildOptionsFn = buildOptions;
  getChatWindowFn = getChatWindow;

  const onFinished = onRunFinished;
  ipcMain.handle(IPC.AGUI_RUN, async (event: IpcMainInvokeEvent, rawInput: unknown) => {
    if (!buildOptionsFn || !onFinished) {
      throw new Error("AG-UI 桥未初始化");
    }
    lifecycle?.onUserMessage();
    lifecycle?.onConversationStarted();
    const input = rawInput as AguiRunInput;
    let built;
    try {
      built = await buildOptionsFn(input);
    } catch (error) {
      lifecycle?.onConversationEnded();
      throw error;
    }
    const { options, latestUserText } = built;

    const threadId = `thread-${Date.now()}`;
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agent = new CyreneAgent({ threadId, description: "Cyrene 主聊天" });

    // 事件转发目标：优先用 invoke 的 sender（发起 run 的窗口），兜底用聊天窗口
    const sender = event.sender;

    const send = (baseEvent: unknown): void => {
      const targets: WebContents[] = [];
      if (!sender.isDestroyed()) targets.push(sender);
      const chatWin = getChatWindowFn();
      if (chatWin && !chatWin.isDestroyed() && chatWin.webContents !== sender) {
        targets.push(chatWin.webContents);
      }
      for (const t of targets) {
        try {
          t.send(IPC.AGUI_EVENT, baseEvent);
        } catch (err) {
          console.error("[AgUiBridge] send 失败:", (err instanceof Error ? err.message : String(err)), "事件类型=", (baseEvent as { type?: string })?.type);
        }
      }
    };

    let pendingRunFinishedEvent: unknown | null = null;
    const responseAbortController = new AbortController();
    let lifecycleEnded = false;
    const endLifecycle = (): void => {
      if (lifecycleEnded) return;
      lifecycleEnded = true;
      lifecycle?.onConversationEnded();
    };

    // 订阅 agent 事件流：每个事件透传渲染端；
    // complete/error 时做副作用，并补发一个终态事件让渲染端知道这轮结束。
    const sub = agent.runWithEvents(options).subscribe({
      next: (baseEvent) => {
        // sticker / memory 等副作用在 complete 回调里执行。前端收到 RUN_FINISHED 后会收尾并取消监听，
        // 所以必须把 RUN_FINISHED 延后到副作用事件之后发送，否则 cyrene.sticker 会晚到而被丢掉。
        if ((baseEvent as { type?: string })?.type === "RUN_FINISHED") {
          pendingRunFinishedEvent = baseEvent;
          return;
        }
        send(baseEvent);
      },
      error: (err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[AgUiBridge] run 失败:", message);
        // 补发 RUN_ERROR 事件，渲染端据此收尾（invoke 早已 resolve，靠事件驱动）
        send({ type: "RUN_ERROR", error: message, threadId, runId });
        activeRuns.delete(runId);
        endLifecycle();
      },
      complete: async () => {
        const result = agent.lastResult;
        if (result) {
          try {
            await onFinished(result, latestUserText);
            // 历史召回用：把这轮对话存入向量库（异步，不阻塞，失败不影响主流程）
            // 放在 onFinished 之后，确保记忆/sticker 等副作用先跑完
            void indexConversationTurn(
              input.sessionId || "default",
              latestUserText,
              result.reply,
            );
          } catch (err) {
            console.warn("[AgUiBridge] 原回复副作用失败（不影响结果）:", err);
          }

          const responseLifecycle = characterResponse;
          let responseStatus: ReturnType<AguiCharacterResponseLifecycle["getStatus"]> | undefined;
          try {
            responseStatus = responseLifecycle?.getStatus();
          } catch (err) {
            console.warn("[AgUiBridge] 读取角色翻译状态失败（不影响原回复）:", err);
          }
          if (responseLifecycle && responseStatus?.enabled) {
            send({
              type: "CUSTOM",
              name: "character.translation.started",
              value: responseStatus,
              threadId,
              runId,
            });
          }

          // 原回复已经完成并执行完必要副作用；先释放桌面轮次，再异步补充译文。
          if (pendingRunFinishedEvent && !responseAbortController.signal.aborted) {
            send(pendingRunFinishedEvent);
            pendingRunFinishedEvent = null;
          }

          if (responseLifecycle && responseStatus?.enabled) {
            try {
              const response = await responseLifecycle.complete(
                result.reply,
                responseAbortController.signal,
              );
              if (!responseAbortController.signal.aborted) {
                // 设置或角色在异步 Translation Pass 期间发生变化时，也要收束已经发送的 loading 状态。
                const stillCurrent = isCurrentCharacterTranslationConfiguration(
                  responseLifecycle,
                  responseStatus,
                  response,
                );
                const translation = stillCurrent && response.translation
                  ? response.translation
                  : {
                  status: "failed" as const,
                  targetLanguage: responseStatus.targetLanguage ?? "zh-CN",
                  code: "cancelled" as const,
                  message: stillCurrent ? "翻译已关闭" : "翻译设置已变更或角色已切换",
                  };
                send({
                  type: "CUSTOM",
                  name: translation.status === "ready"
                    ? "character.translation.ready"
                    : "character.translation.failed",
                  value: { ...response, translation },
                  threadId,
                  runId,
                });
              }
            } catch (err) {
              if (!responseAbortController.signal.aborted) {
                const stillCurrent = isCurrentCharacterTranslationConfiguration(
                  responseLifecycle,
                  responseStatus,
                );
                send({
                  type: "CUSTOM",
                  name: "character.translation.failed",
                  value: {
                    characterId: responseStatus.characterId,
                    original: { text: result.reply, language: "und" },
                    translation: {
                      status: "failed" as const,
                      targetLanguage: responseStatus.targetLanguage ?? "zh-CN",
                      code: stillCurrent ? "provider-error" : "cancelled",
                      message: stillCurrent
                        ? (err instanceof Error ? err.message : String(err))
                        : "翻译设置已变更或角色已切换",
                    },
                  },
                  threadId,
                  runId,
                });
              }
            }
          }
        }
        if (pendingRunFinishedEvent && !responseAbortController.signal.aborted) {
          send(pendingRunFinishedEvent);
        }
        activeRuns.delete(runId);
        endLifecycle();
      },
    });
    activeRuns.set(runId, { subscription: sub, endLifecycle, responseAbortController });

    // invoke 立刻返回 ack，不等 Observable 结束。
    // 终态（RUN_FINISHED/RUN_ERROR）由事件流承载，渲染端据此 offEvent + 收尾。
    // 这样避免 invoke reply 与 send 事件的投递顺序竞争导致 offEvent 提前取消监听。
    return { success: true, runId };
  });

  ipcMain.handle(IPC.AGUI_CANCEL, () => {
    for (const run of activeRuns.values()) {
      run.responseAbortController.abort(new Error("用户取消了回复"));
      run.subscription.unsubscribe();
      run.endLifecycle();
    }
    activeRuns.clear();
    return true;
  });
}

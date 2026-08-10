// Channels 面板业务逻辑：渠道状态 / 配置加载 / 飞书&微信交互 / 消息日志
// 从 settings.ts 抽离。依赖 channels DOM 引用（./dom）、channelsState（./state）、
// general/dom 的 proactiveDeliverySelect + shared 的 normalize/isProactiveDeliveryTargetSelectable。

import { channelsState } from "./state";
import {
  channelsWechatEnabledEl, channelsFeishuEnabledEl,
  channelsRateUserEl, channelsRateChannelEl,
  channelsTtsEl, channelsStickerEl, channelsMirrorEl,
  channelsToolSandboxOffEl, channelsToolSandboxAllEl, channelsToolSandboxSafeEl,
  channelsFeishuAppIdEl, channelsFeishuAppSecretEl, channelsFeishuAppSecretRevealBtn,
  channelsFeishuSaveBtn, channelsFeishuFeedbackEl,
  channelsWechatStatusEl, channelsFeishuStatusEl,
  channelsWechatLoginBtn, channelsWechatAccountsEl, channelsWechatFeedbackEl,
  channelsLogListEl, channelsLogRefreshBtn, channelsLogClearBtn,
} from "./dom";
import {
  renderWechatAccountListMarkup,
  type WechatAccountSettingsViewItem,
} from "../wechat-account-settings-view";
import type { WechatLoginSessionView } from "../shared/types";
import { proactiveDeliverySelect } from "../general/dom";
import { normalizeProactiveDeliveryTarget } from "../../../shared/preferences";
import { isProactiveDeliveryTargetSelectable } from "../../../shared/proactive-delivery";

// 通用：根据渠道状态更新"主动投递目标"选项的可选择性
// （从 settings.ts 移过来；settings.ts 反向 import 此函数以保持其他面板调用不变）
export function renderProactiveDeliveryAvailability(statuses: Record<string, { phase?: string }>): void {
  proactiveDeliverySelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
    const target = normalizeProactiveDeliveryTarget(button.dataset.value);
    const status = target === "local" ? undefined : statuses[target];
    button.disabled = !isProactiveDeliveryTargetSelectable(target, status);
  });
}

function renderChannelStatus(el: HTMLElement | null, phase: string, message?: string): void {
  if (!el) return;
  const dot = el.querySelector(".channels-status__dot");
  const text = el.querySelector(".channels-status__text");
  if (dot) {
    dot.className = "channels-status__dot";
    if (phase === "running") dot.classList.add("channels-status__dot--running");
    else if (phase === "starting") dot.classList.add("channels-status__dot--starting");
    else if (phase === "error") dot.classList.add("channels-status__dot--error");
    else if (phase === "config_missing") dot.classList.add("channels-status__dot--config_missing");
    else dot.classList.add("channels-status__dot--offline");
  }
  if (text) text.textContent = message ?? (phase === "running" ? "运行中" : phase === "starting" ? "启动中" : phase === "config_missing" ? "配置缺失" : phase === "error" ? "错误" : "未启用");
}

function setFeishuFeedback(kind: "info" | "ok" | "err", msg: string): void {
  if (!channelsFeishuFeedbackEl) return;
  channelsFeishuFeedbackEl.textContent = msg;
  channelsFeishuFeedbackEl.className = "channels-feedback";
  if (kind === "ok") channelsFeishuFeedbackEl.classList.add("channels-feedback--ok");
  else if (kind === "err") channelsFeishuFeedbackEl.classList.add("channels-feedback--err");
  else channelsFeishuFeedbackEl.classList.add("channels-feedback--info");
}

export interface LogEntry {
  at: string;
  dir: "incoming" | "outgoing";
  channel: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  text: string;
  hasAttachments?: boolean;
}

export function renderChannelsLog(entries: LogEntry[]): void {
  if (!channelsLogListEl) return;
  if (entries.length === 0) {
    channelsLogListEl.innerHTML = '<p class="empty-hint">暂无消息。</p>';
    return;
  }
  const html = entries
    .map((e) => {
      const t = new Date(e.at);
      const hh = String(t.getHours()).padStart(2, "0");
      const mm = String(t.getMinutes()).padStart(2, "0");
      const ss = String(t.getSeconds()).padStart(2, "0");
      const dir = e.dir === "incoming" ? "← 收到" : "→ 回复";
      const who = e.senderName ? `${e.senderName} (${e.senderId})` : e.senderId;
      const safe = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const text = e.text.length > 280 ? safe(e.text.slice(0, 280)) + "…" : safe(e.text);
      return `<div class="channels-log__entry channels-log__entry--${e.dir}">
        <div class="channels-log__meta">${hh}:${mm}:${ss} · ${dir} · ${safe(e.channel)} · ${safe(who)}</div>
        <div class="channels-log__text">${text}</div>
      </div>`;
    })
    .join("");
  channelsLogListEl.innerHTML = html;
}

export async function refreshChannelsLog(): Promise<void> {
  try {
    const entries = (await window.settings.channelsLogGet(100)) as LogEntry[];
    renderChannelsLog(entries);
  } catch (err) {
    console.warn("[Channels] refreshChannelsLog 失败:", err);
  }
}

let wechatAccounts: WechatAccountSettingsViewItem[] = [];

async function refreshWechatAccounts(): Promise<void> {
  if (!channelsWechatAccountsEl) return;
  try {
    wechatAccounts = await window.settings.channelsWechatAccountsList();
    channelsWechatAccountsEl.innerHTML = renderWechatAccountListMarkup(wechatAccounts);
  } catch (error) {
    channelsWechatAccountsEl.innerHTML = '<p class="wechat-account-empty">微信账号读取失败，请稍后重试。</p>';
    console.warn("[WechatSettings] 读取账号失败:", error);
  }
}

export async function loadChannelsPanel(): Promise<void> {
  if (channelsState.initialized) return;
  channelsState.initialized = true;
  try {
    const cfg = await window.settings.channelsGetConfig();
    if (channelsFeishuEnabledEl) channelsFeishuEnabledEl.checked = !!cfg.feishu.enabled;
    if (channelsRateUserEl) channelsRateUserEl.value = String(cfg.rateLimitPerUser ?? 10);
    if (channelsRateChannelEl) channelsRateChannelEl.value = String(cfg.rateLimitPerChannel ?? 100);
    if (channelsTtsEl) channelsTtsEl.checked = cfg.ttsEnabled !== false;
    if (channelsStickerEl) channelsStickerEl.checked = cfg.stickerEnabled !== false;
    if (channelsMirrorEl) channelsMirrorEl.checked = cfg.mirrorToDesktop !== false;
    if (channelsToolSandboxOffEl) channelsToolSandboxOffEl.checked = cfg.toolSandbox === "off";
    if (channelsToolSandboxAllEl) channelsToolSandboxAllEl.checked = cfg.toolSandbox === "all";
    if (channelsToolSandboxSafeEl) channelsToolSandboxSafeEl.checked = cfg.toolSandbox === "safe-only";

    // 飞书字段填充（长连接模式只需要 App ID；secret 加密存盘，UI 不回填明文）
    if (channelsFeishuAppIdEl) channelsFeishuAppIdEl.value = cfg.feishu.appId ?? "";
    if (channelsFeishuAppSecretEl) {
      channelsFeishuAppSecretEl.value = "";
      channelsFeishuAppSecretEl.placeholder = cfg.feishu.appSecret
        ? "已保存（输入新值会覆盖）"
        : "点击保存配置时加密保存";
    }

    // 拉一次渠道状态
    const status = (await window.settings.channelsGetStatus()) as Record<string, { phase: string; message?: string }>;
    renderProactiveDeliveryAvailability(status);
    renderChannelStatus(channelsWechatStatusEl, status.wechat?.phase ?? "offline", status.wechat?.message);
    renderChannelStatus(channelsFeishuStatusEl, status.feishu?.phase ?? "offline", status.feishu?.message);
    await refreshWechatAccounts();
    // Phase 3.4：拉一次消息日志
    void refreshChannelsLog();
  } catch (err) {
    console.warn("[Channels] loadChannelsPanel 失败:", err);
  }

  // 自动保存（debounce 200ms）
  const scheduleSave = () => {
    if (channelsState.saveTimer != null) window.clearTimeout(channelsState.saveTimer);
    channelsState.saveTimer = window.setTimeout(() => {
      void window.settings.channelsSaveConfig({
        feishu: { enabled: channelsFeishuEnabledEl?.checked ?? false },
        rateLimitPerUser: Number(channelsRateUserEl?.value) || 10,
        rateLimitPerChannel: Number(channelsRateChannelEl?.value) || 100,
        ttsEnabled: channelsTtsEl?.checked ?? true,
        stickerEnabled: channelsStickerEl?.checked ?? true,
        mirrorToDesktop: channelsMirrorEl?.checked ?? true,
        toolSandbox: channelsToolSandboxOffEl?.checked
          ? "off"
          : channelsToolSandboxSafeEl?.checked
            ? "safe-only"
            : "all",
      });
    }, 200);
  };
  for (const el of [
    channelsFeishuEnabledEl,
    channelsRateUserEl,
    channelsRateChannelEl,
    channelsTtsEl,
    channelsStickerEl,
    channelsMirrorEl,
    channelsToolSandboxOffEl,
    channelsToolSandboxAllEl,
    channelsToolSandboxSafeEl,
  ]) {
    el?.addEventListener("change", scheduleSave);
  }

  // 监听安装进度（Phase 1+ 才会收到）
  window.settings.onChannelsInstallProgress((progress) => {
    const target = progress.channel === "wechat" ? channelsWechatStatusEl : progress.channel === "feishu" ? channelsFeishuStatusEl : null;
    if (target) renderChannelStatus(target, "starting", `${progress.phase} ${progress.pct}%`);
  });
  window.settings.onChannelsStatusChanged((status) => {
    const s = status as Record<string, { phase: string; message?: string }>;
    renderProactiveDeliveryAvailability(s);
    renderChannelStatus(channelsWechatStatusEl, s.wechat?.phase ?? "offline", s.wechat?.message);
    renderChannelStatus(channelsFeishuStatusEl, s.feishu?.phase ?? "offline", s.feishu?.message);
    void refreshWechatAccounts();
  });

  // ===== 飞书交互（Phase 2 长连接版） =====

  // 显示/隐藏 App Secret
  channelsFeishuAppSecretRevealBtn?.addEventListener("click", () => {
    if (!channelsFeishuAppSecretEl) return;
    channelsFeishuAppSecretEl.type =
      channelsFeishuAppSecretEl.type === "password" ? "text" : "password";
  });

  // 保存配置（secret 用 safeStorage 加密后落盘 + 触发长连接重连）
  channelsFeishuSaveBtn?.addEventListener("click", async () => {
    setFeishuFeedback("info", "保存并连接中...");
    const patch: Record<string, unknown> = {
      feishu: {
        enabled: channelsFeishuEnabledEl?.checked ?? false,
        appId: channelsFeishuAppIdEl?.value.trim() || undefined,
      },
    };
    // 仅在用户输入了新值时才覆盖 secret（避免误清空）
    if (channelsFeishuAppSecretEl?.value) {
      (patch.feishu as Record<string, unknown>).appSecret = channelsFeishuAppSecretEl.value;
    }
    try {
      await window.settings.channelsSaveConfig(patch);
      // 保存后立即触发飞书 adapter 重建 + 重连长连接
      await window.settings.channelsRestart();
      setFeishuFeedback("ok", "已保存，飞书长连接正在建立…");
      // 清空输入框（已落盘），并把 placeholder 切到"已保存"
      if (channelsFeishuAppSecretEl) {
        channelsFeishuAppSecretEl.value = "";
        channelsFeishuAppSecretEl.placeholder = "已保存（输入新值会覆盖）";
      }
    } catch (err) {
      setFeishuFeedback("err", err instanceof Error ? err.message : String(err));
    }
  });

  // ===== 微信交互（扫码登录走 iLink HTTP API，详见 src/main/channels/adapters/wechat/） =====

  function setWechatFeedback(kind: "info" | "ok" | "err", msg: string): void {
    if (!channelsWechatFeedbackEl) return;
    channelsWechatFeedbackEl.textContent = msg;
    channelsWechatFeedbackEl.className = "channels-feedback";
    if (kind === "ok") channelsWechatFeedbackEl.classList.add("channels-feedback--ok");
    else if (kind === "err") channelsWechatFeedbackEl.classList.add("channels-feedback--err");
    else channelsWechatFeedbackEl.classList.add("channels-feedback--info");
  }

  // 扫码登录：Main Process 生成 PNG → 推到 Renderer → modal 弹窗
  const channelsWechatQrEl = document.getElementById("channels-wechat-qr");
  const channelsWechatQrImgEl = document.getElementById("channels-wechat-qr-img") as HTMLImageElement | null;
  const channelsWechatQrCloseBtn = document.getElementById("channels-wechat-qr-close");
  const channelsWechatQrCancelBtn = document.getElementById("channels-wechat-qr-cancel");
  const channelsWechatQrRefreshBtn = document.getElementById("channels-wechat-qr-refresh");
  const channelsWechatQrBackdrop = document.getElementById("channels-wechat-qr-backdrop");

  function showWechatQr(dataUrl: string): void {
    if (channelsWechatQrImgEl) {
      channelsWechatQrImgEl.src = dataUrl;
      channelsWechatQrImgEl.classList.remove("is-empty");
    }
    channelsWechatQrEl?.removeAttribute("hidden");
  }
  function hideWechatQr(): void {
    channelsWechatQrEl?.setAttribute("hidden", "");
    if (channelsWechatQrImgEl) {
      channelsWechatQrImgEl.src = "";
      channelsWechatQrImgEl.classList.add("is-empty");
    }
  }

  function applyWechatLoginSession(session: WechatLoginSessionView | undefined): void {
    if (!session) return;
    if (session.state === "waiting" && session.qrDataUrl) {
      showWechatQr(session.qrDataUrl);
      setWechatFeedback("info", "等待扫码确认。隐藏二维码不会取消本次登录。");
      return;
    }
    if (session.state === "confirmed") {
      hideWechatQr();
      setWechatFeedback("ok", "微信账号登录成功");
      void refreshWechatAccounts();
      return;
    }
    if (session.state === "expired" || session.state === "error") {
      setWechatFeedback("err", session.error ?? "二维码已失效，请刷新后重试");
      return;
    }
    if (session.state === "cancelled") {
      hideWechatQr();
      setWechatFeedback("info", "已取消扫码登录");
    }
  }

  // 关闭交互：点按钮 / 点背景 / 按 ESC
  channelsWechatQrCloseBtn?.addEventListener("click", hideWechatQr);
  channelsWechatQrBackdrop?.addEventListener("click", hideWechatQr);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && channelsWechatQrEl && !channelsWechatQrEl.hasAttribute("hidden")) {
      hideWechatQr();
    }
  });

  // 订阅 Main 推送的二维码（每次登录会推一次）
  window.settings.onChannelsWechatQrcode((dataUrl) => {
    console.log("[WechatSettings] QR event received, dataUrl prefix:", dataUrl?.slice(0, 40), "len:", dataUrl?.length);
    showWechatQr(dataUrl);
    setWechatFeedback("info", "请用微信扫描二维码");
  });
  // 订阅 Main 推送的登录结果（成功 / 失败 / 二维码过期）
  window.settings.onChannelsWechatLoginDone((payload) => {
    if (payload.ok) {
      hideWechatQr();
      setWechatFeedback("ok", "微信账号登录成功");
      void refreshWechatAccounts();
    } else {
      setWechatFeedback("err", `登录失败：${payload.error ?? "未知错误"}`);
    }
  });
  window.settings.onChannelsWechatLoginState(applyWechatLoginSession);
  void window.settings.channelsWechatLoginResult()
    .then((result) => applyWechatLoginSession(result.loginSession))
    .catch((error) => console.warn("[WechatSettings] 恢复扫码状态失败:", error));

  channelsWechatLoginBtn?.addEventListener("click", async () => {
    hideWechatQr();
    setWechatFeedback("info", "正在启动扫码…");
    try {
      const result = await window.settings.channelsWechatLoginStart();
      if (result.ok) {
        if (result.qrDataUrl) showWechatQr(result.qrDataUrl);
        setWechatFeedback("info", "请用微信扫描二维码");
      } else {
        setWechatFeedback("err", result.error ?? "启动失败");
      }
    } catch (err) {
      setWechatFeedback("err", err instanceof Error ? err.message : String(err));
    }
  });

  channelsWechatQrCancelBtn?.addEventListener("click", async () => {
    try {
      const result = await window.settings.channelsWechatLoginCancel();
      if (!result.ok) throw new Error(result.error ?? "取消扫码失败");
      hideWechatQr();
      setWechatFeedback("info", "已取消扫码登录");
    } catch (err) {
      setWechatFeedback("err", err instanceof Error ? err.message : String(err));
    }
  });

  channelsWechatQrRefreshBtn?.addEventListener("click", async () => {
    setWechatFeedback("info", "正在刷新二维码…");
    try {
      const result = await window.settings.channelsWechatLoginRefresh();
      if (!result.ok) throw new Error(result.error ?? "刷新二维码失败");
      if (result.qrDataUrl) showWechatQr(result.qrDataUrl);
      setWechatFeedback("info", "二维码已刷新，请重新扫描");
    } catch (err) {
      setWechatFeedback("err", err instanceof Error ? err.message : String(err));
    }
  });

  channelsWechatAccountsEl?.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-wechat-action]");
    const article = button?.closest<HTMLElement>("[data-account-index]");
    if (!button || !article) return;
    const account = wechatAccounts[Number(article.dataset.accountIndex)];
    if (!account) return;
    const action = button.dataset.wechatAction;
    const renameInput = article.querySelector<HTMLInputElement>("[data-wechat-rename-input]");
    if (action === "rename") {
      article.classList.add("is-renaming");
      renameInput?.focus();
      renameInput?.select();
      return;
    }
    if (action === "rename-cancel") {
      if (renameInput) renameInput.value = account.label;
      article.classList.remove("is-renaming");
      return;
    }
    button.disabled = true;
    try {
      let result: { ok: boolean; error?: string; qrDataUrl?: string };
      if (action === "rename-save") {
        const label = renameInput?.value.trim() ?? "";
        if (!label) {
          setWechatFeedback("err", "微信账号备注不能为空");
          renameInput?.focus();
          return;
        }
        if (label === account.label) {
          article.classList.remove("is-renaming");
          return;
        }
        result = await window.settings.channelsWechatAccountRename(account.ilinkBotId, label);
      } else if (action === "toggle") {
        result = await window.settings.channelsWechatAccountSetEnabled(account.ilinkBotId, !account.enabled);
      } else if (action === "reconnect") {
        result = await window.settings.channelsWechatAccountReconnect(account.ilinkBotId);
      } else if (action === "rescan") {
        result = await window.settings.channelsWechatAccountRescan(account.ilinkBotId);
        if (result.qrDataUrl) showWechatQr(result.qrDataUrl);
      } else if (action === "logout") {
        if (!window.confirm(`退出“${account.label}”的微信登录？\n账号条目和历史归档会保留，之后可以重新扫码。`)) return;
        result = await window.settings.channelsWechatLogout(account.ilinkBotId);
      } else if (action === "delete") {
        if (!window.confirm(`删除微信账号“${account.label}”？\n账号配置和登录凭据会被删除，历史归档不会永久清除。`)) return;
        result = await window.settings.channelsWechatAccountDelete(account.ilinkBotId);
      } else {
        return;
      }
      if (!result.ok) throw new Error(result.error ?? "微信账号操作失败");
      setWechatFeedback("ok", action === "delete" ? "账号已删除" : "账号设置已更新");
      await refreshWechatAccounts();
    } catch (error) {
      setWechatFeedback("err", error instanceof Error ? error.message : String(error));
    } finally {
      button.disabled = false;
    }
  });

  channelsWechatAccountsEl?.addEventListener("keydown", (event) => {
    const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>("[data-wechat-rename-input]");
    if (!input) return;
    const article = input.closest<HTMLElement>("[data-account-index]");
    if (event.key === "Enter") {
      event.preventDefault();
      article?.querySelector<HTMLButtonElement>('[data-wechat-action="rename-save"]')?.click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      article?.querySelector<HTMLButtonElement>('[data-wechat-action="rename-cancel"]')?.click();
    }
  });

  // ===== Phase 3.4：消息日志事件绑定 =====
  channelsLogRefreshBtn?.addEventListener("click", () => void refreshChannelsLog());
  channelsLogClearBtn?.addEventListener("click", async () => {
    if (!confirm("确认清空所有 bot 消息日志？")) return;
    await window.settings.channelsLogClear();
    await refreshChannelsLog();
  });
}

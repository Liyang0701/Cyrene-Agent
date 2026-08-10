// ASR 面板业务逻辑：配置加载 / 保存 / 字段可见性同步
// 从 settings.ts 抽离。依赖 asr DOM 引用（./dom）、asrState（./state）。
// 备注：window.tts 同时承担 ASR 与 TTS 的设置存储（preload 复用同一通道）。

import { asrState } from "./state";
import {
  asrEngineSelect, asrAliyunConfig, asrLocalConfig,
  asrLocalRootInput, asrLocalModelPathInput, asrLocalSystemPromptInput,
  asrLocalStatus, asrLocalTestButton,
  asrAliyunAppKeyInput, asrAliyunAccessKeyIdInput, asrAliyunAccessKeySecretInput,
  asrLanguageSelect,
  asrVadSilenceInput, asrVadThresholdInput, asrVadThresholdValue,
  asrShowTranscriptCheckbox,
} from "./dom";

export function syncAsrVisibility(): void {
  if (asrAliyunConfig) {
    (asrAliyunConfig as HTMLElement).style.display = asrEngineSelect?.value === "aliyun" ? "block" : "none";
  }
  if (asrLocalConfig) {
    (asrLocalConfig as HTMLElement).style.display = asrEngineSelect?.value === "local" ? "block" : "none";
  }
}

export async function saveAsrField(field: string, value: unknown): Promise<void> {
  if (!window.tts) return;
  try {
    await window.tts.saveSettings({ [field]: value });
  } catch (err) {
    console.warn("[asr] 保存 ASR 配置失败:", field, err);
  }
}

export async function loadAsrConfig(): Promise<void> {
  try {
    const cfg = await window.tts?.loadSettings();
    if (cfg) {
      if (asrEngineSelect) asrEngineSelect.value = String(cfg.asrEngine ?? "off");
      if (asrAliyunAppKeyInput) asrAliyunAppKeyInput.value = String(cfg.asrAliyunAppKey ?? "");
      if (asrAliyunAccessKeyIdInput) asrAliyunAccessKeyIdInput.value = String(cfg.asrAliyunAccessKeyId ?? "");
      if (asrAliyunAccessKeySecretInput) asrAliyunAccessKeySecretInput.value = String(cfg.asrAliyunAccessKeySecret ?? "");
      if (asrLocalRootInput) asrLocalRootInput.value = String(cfg.asrLocalRoot ?? "");
      if (asrLocalModelPathInput) asrLocalModelPathInput.value = String(cfg.asrLocalModelPath ?? "");
      if (asrLocalSystemPromptInput) asrLocalSystemPromptInput.value = String(cfg.asrLocalSystemPrompt ?? "");
      if (asrLanguageSelect) asrLanguageSelect.value = String(cfg.asrLanguage ?? "zh");
      if (asrVadSilenceInput) asrVadSilenceInput.value = String(cfg.asrVadSilenceMs ?? 1000);
      if (asrVadThresholdInput) {
        const v = Number(cfg.asrVadThreshold) || 0.01;
        asrVadThresholdInput.value = String(v);
        if (asrVadThresholdValue) asrVadThresholdValue.textContent = String(v);
      }
      if (asrShowTranscriptCheckbox) asrShowTranscriptCheckbox.checked = Boolean(cfg.asrShowTranscript);
    }
    syncAsrVisibility();
    if (asrEngineSelect?.value === "local") await refreshLocalAsrStatus(false);
  } catch (err) {
    console.warn("[asr] 加载 ASR 配置失败", err);
  }
}

// ===== 事件绑定（模块加载时执行） =====
asrEngineSelect?.addEventListener("change", () => {
  syncAsrVisibility();
  void saveAsrField("asrEngine", asrEngineSelect.value);
  if (asrEngineSelect.value === "local") void refreshLocalAsrStatus(false);
});
// 防抖保存：每个字段独立 timer，避免连续填写多个字段时只有最后一个被保存
asrAliyunAppKeyInput?.addEventListener("input", () => { clearTimeout(asrState.aliyunAppKeyTimer); asrState.aliyunAppKeyTimer = setTimeout(() => void saveAsrField("asrAliyunAppKey", asrAliyunAppKeyInput.value.trim()), 800); });
asrAliyunAccessKeyIdInput?.addEventListener("input", () => { clearTimeout(asrState.aliyunAccessKeyIdTimer); asrState.aliyunAccessKeyIdTimer = setTimeout(() => void saveAsrField("asrAliyunAccessKeyId", asrAliyunAccessKeyIdInput.value.trim()), 800); });
asrAliyunAccessKeySecretInput?.addEventListener("input", () => { clearTimeout(asrState.aliyunAccessKeySecretTimer); asrState.aliyunAccessKeySecretTimer = setTimeout(() => void saveAsrField("asrAliyunAccessKeySecret", asrAliyunAccessKeySecretInput.value.trim()), 800); });
asrLocalRootInput?.addEventListener("input", () => { clearTimeout(asrState.localRootTimer); asrState.localRootTimer = setTimeout(() => void saveAsrField("asrLocalRoot", asrLocalRootInput.value.trim()), 800); });
asrLocalModelPathInput?.addEventListener("input", () => { clearTimeout(asrState.localModelPathTimer); asrState.localModelPathTimer = setTimeout(() => void saveAsrField("asrLocalModelPath", asrLocalModelPathInput.value.trim()), 800); });
asrLocalSystemPromptInput?.addEventListener("input", () => { clearTimeout(asrState.localSystemPromptTimer); asrState.localSystemPromptTimer = setTimeout(() => void saveAsrField("asrLocalSystemPrompt", asrLocalSystemPromptInput.value), 800); });
asrLanguageSelect?.addEventListener("change", () => void saveAsrField("asrLanguage", asrLanguageSelect.value));
asrVadSilenceInput?.addEventListener("input", () => {
  void saveAsrField("asrVadSilenceMs", Number(asrVadSilenceInput.value) || 1000);
});
asrVadThresholdInput?.addEventListener("input", () => {
  const v = Number(asrVadThresholdInput.value) || 0.01;
  if (asrVadThresholdValue) asrVadThresholdValue.textContent = String(v);
  void saveAsrField("asrVadThreshold", v);
});
asrShowTranscriptCheckbox?.addEventListener("change", () => void saveAsrField("asrShowTranscript", asrShowTranscriptCheckbox.checked));

async function refreshLocalAsrStatus(startWorker: boolean): Promise<void> {
  if (!asrLocalStatus || !window.tts?.getLocalAsrStatus) return;
  asrLocalStatus.textContent = startWorker ? "正在加载本地模型…" : "正在检查安装状态…";
  try {
    const status = await window.tts.getLocalAsrStatus(startWorker) as {
      installed?: boolean; ready?: boolean; loading?: boolean; loadTimeSec?: number; rssBytes?: number; error?: string;
    };
    const memory = status.rssBytes ? `，常驻 ${(status.rssBytes / 1024 ** 3).toFixed(2)} GiB` : "";
    if (status.ready) asrLocalStatus.textContent = `已安装并就绪，加载 ${Number(status.loadTimeSec ?? 0).toFixed(2)} 秒${memory}`;
    else if (status.loading) asrLocalStatus.textContent = "已安装，模型正在加载…";
    else if (status.installed) asrLocalStatus.textContent = status.error ? `已安装，但启动失败：${status.error}` : "已安装，尚未加载模型";
    else asrLocalStatus.textContent = `未检测到完整独立环境${status.error ? `：${status.error}` : ""}`;
  } catch (error) {
    asrLocalStatus.textContent = `状态检查失败：${error instanceof Error ? error.message : String(error)}`;
  }
}

asrLocalTestButton?.addEventListener("click", async () => {
  if (!window.tts?.testLocalAsr || !asrLocalStatus) return;
  asrLocalTestButton.disabled = true;
  asrLocalStatus.textContent = "正在加载模型并识别本地测试音频…";
  try {
    const result = await window.tts.testLocalAsr() as { text?: string; elapsedSec?: number; rtf?: number };
    asrLocalStatus.textContent = `测试成功：“${result.text ?? ""}”（${Number(result.elapsedSec ?? 0).toFixed(2)} 秒，RTF ${Number(result.rtf ?? 0).toFixed(2)}）`;
  } catch (error) {
    asrLocalStatus.textContent = `测试失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    asrLocalTestButton.disabled = false;
  }
});

// 模块加载时拉一次配置
void loadAsrConfig();

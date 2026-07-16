const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const outputRoot = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length)
  || fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-character-settings-visual-"));
const { IPC } = require(path.join(repoRoot, "dist", "main", "shared", "ipc-channels.js"));
let blockingActivities = [];
const rendererLogs = [];

const packages = [
  {
    id: "cyrene",
    displayName: "昔涟",
    version: "1.0.0",
    source: "builtin",
    readOnly: true,
    distributionStatus: "redistributable",
    capabilities: {
      worldbook: "available",
      live2d: "available",
      semanticActions: "available",
      voice: "available",
      stickers: "unavailable",
      openers: "unavailable",
    },
    health: { status: "healthy", diagnostics: [] },
  },
  {
    id: "fixture.lumen",
    displayName: "流明",
    version: "1.0.0",
    source: "local",
    readOnly: false,
    distributionStatus: "redistributable",
    capabilities: {
      worldbook: "available",
      live2d: "unavailable",
      semanticActions: "unavailable",
      voice: "available",
      stickers: "unavailable",
      openers: "unavailable",
    },
    health: { status: "healthy", diagnostics: [] },
  },
];

function register(channel, handler) {
  ipcMain.handle(channel, handler);
}

app.setPath("userData", path.join(outputRoot, "user-data"));
app.whenReady().then(async () => {
  fs.mkdirSync(outputRoot, { recursive: true });
  register(IPC.SETTINGS_GET_CONFIG, () => ({
    provider: "openai",
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "qwen3.5-9b",
    apiKey: "",
    perProvider: {},
  }));
  register(IPC.SETTINGS_GET_GENERAL, () => ({}));
  register(IPC.CHARACTER_LIST, () => ({
    status: "ready",
    activeCharacter: { id: "cyrene", displayName: "昔涟" },
    packages,
    switching: { blockingActivities },
  }));
  register(IPC.CHARACTER_PICK_IMPORT_FOLDER, () => null);
  register(IPC.CHARACTER_IMPORT, () => ({ ok: false, diagnostics: [] }));
  register(IPC.CHARACTER_SWITCH, () => ({ ok: true, status: "relaunch-requested", unavailableCapabilities: [] }));
  register(IPC.UI_THEME_GET, () => "dark");
  register(IPC.UI_FONT_GET, () => ({ kind: "system", family: "" }));

  const window = new BrowserWindow({
    width: 1120,
    height: 820,
    show: false,
    backgroundColor: "#17131f",
    webPreferences: {
      preload: path.join(repoRoot, "dist", "preload", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  window.webContents.on("console-message", (_event, level, message) => {
    rendererLogs.push({ level, message });
  });
  await window.loadFile(path.join(repoRoot, "dist", "renderer", "settings", "index.html"));
  const navigationState = await window.webContents.executeJavaScript(`(() => {
    const target = document.querySelector('[data-section="characters"]');
    if (!target) return { ok: false, body: document.body.innerText.slice(0, 1000) };
    target.click();
    return { ok: true };
  })()`);
  if (!navigationState.ok) {
    throw new Error(`找不到角色设置导航：${JSON.stringify({ navigationState, rendererLogs })}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));

  const readyState = await window.webContents.executeJavaScript(`({
    current: document.querySelector('#character-current-name')?.textContent,
    target: document.querySelector('[data-character-switch="fixture.lumen"]')?.textContent,
    disabled: document.querySelector('[data-character-switch="fixture.lumen"]')?.disabled,
  })`);
  fs.writeFileSync(path.join(outputRoot, "character-settings.png"), (await window.webContents.capturePage()).toPNG());

  await window.webContents.executeJavaScript(
    `document.querySelector('[data-character-switch="fixture.lumen"]').click()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  const confirmationState = await window.webContents.executeJavaScript(`({
    title: document.querySelector('#cy-modal-title')?.textContent,
    message: document.querySelector('#cy-modal-message')?.textContent,
    confirm: document.querySelector('#cy-modal-confirm')?.textContent,
  })`);
  fs.writeFileSync(path.join(outputRoot, "character-switch-confirmation.png"), (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('#cy-modal-cancel').click()`);

  blockingActivities = [{ kind: "voice-call", reason: "语音通话正在进行" }];
  await new Promise((resolve) => setTimeout(resolve, 2_200));
  const busyState = await window.webContents.executeJavaScript(`({
    label: document.querySelector('[data-character-switch="fixture.lumen"]')?.textContent,
    disabled: document.querySelector('[data-character-switch="fixture.lumen"]')?.disabled,
    reason: document.querySelector('.character-switch-reason')?.textContent,
  })`);
  fs.writeFileSync(path.join(outputRoot, "character-switch-busy.png"), (await window.webContents.capturePage()).toPNG());

  const report = {
    ok: readyState.current === "昔涟"
      && readyState.target === "切换到流明"
      && readyState.disabled === false
      && confirmationState.title === "切换到「流明」？"
      && confirmationState.confirm === "切换并重启"
      && confirmationState.message.includes("Live2D、语义动作、表情包、主动开口")
      && busyState.label === "暂不可切换"
      && busyState.disabled === true
      && busyState.reason === "语音通话正在进行",
    readyState,
    confirmationState,
    busyState,
    screenshots: [
      path.join(outputRoot, "character-settings.png"),
      path.join(outputRoot, "character-switch-confirmation.png"),
      path.join(outputRoot, "character-switch-busy.png"),
    ],
  };
  fs.writeFileSync(path.join(outputRoot, "visual-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  window.destroy();
  app.exit(report.ok ? 0 : 1);
}).catch((error) => {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "visual-report.json"), `${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.stack : String(error),
    rendererLogs,
  }, null, 2)}\n`);
  app.exit(1);
});

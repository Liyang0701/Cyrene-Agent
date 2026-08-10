import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  powerMonitor,
  safeStorage,
} from "electron";
import * as path from "path";
import { IPC } from "../../shared/ipc-channels";
import type { MobileCallStatus } from "../../shared/mobile-call-status";
import {
  assertRemoteMobileCallReadiness,
  startMobileCall,
  startRemoteMobileCall,
  stopMobileCall,
} from "../call/call-manager";
import { getActiveCharacter } from "../character/active-character";
import { loadGeneralSettings } from "../settings/settings-facade";
import { DesktopAvailabilityCoordinator } from "./desktop-availability-coordinator";
import {
  createDesktopAuthorizationRequest,
  DesktopDeviceAuthorizationClient,
} from "./desktop-device-authorization-client";
import { DesktopDeviceCredentialVault } from "./desktop-device-credential-vault";
import { DesktopRemoteCallCoordinator } from "./desktop-remote-call-coordinator";
import { registerDevicePairingIpc } from "./device-pairing-ipc";

export interface RemoteAccessSubsystem {
  stop(): Promise<void>;
}

/**
 * Wires the Android control plane into the modular desktop bootstrap.
 * Credentials remain in the main process and are encrypted by Electron
 * safeStorage; renderer windows only receive display-safe pairing data.
 */
export function bootstrapRemoteAccess(): RemoteAccessSubsystem {
  const vault = new DesktopDeviceCredentialVault({
    rootDir: path.join(app.getPath("userData"), "remote-access"),
    safeStorage,
  });
  const client = new DesktopDeviceAuthorizationClient({
    vault,
    request: createDesktopAuthorizationRequest((url, request) => net.fetch(url, request)),
  });

  const availability = new DesktopAvailabilityCoordinator({
    client,
    onFailure: () => {
      // Availability uses a short lease. A transient failure is repaired by
      // the next renewal and must not expose transport details to renderer UI.
    },
  });
  void availability.start();

  const remoteCalls = new DesktopRemoteCallCoordinator({
    client,
    getActiveCharacter: () => {
      const character = getActiveCharacter();
      return { id: character.id, displayName: character.displayName };
    },
    assertReady: assertRemoteMobileCallReadiness,
    startRemoteCall: async (grant, onStatus) => {
      const settings = loadGeneralSettings();
      await startRemoteMobileCall(
        grant,
        {
          silenceMs: settings.asrVadSilenceMs,
          threshold: settings.asrVadThreshold,
        },
        onStatus,
      );
    },
    stopRemoteCall: stopMobileCall,
  });
  remoteCalls.start();

  const onSuspend = (): void => {
    void availability.suspend();
    void remoteCalls.suspend();
  };
  const onResume = (): void => {
    void availability.resume();
    remoteCalls.resume();
  };
  powerMonitor.on("suspend", onSuspend);
  powerMonitor.on("resume", onResume);

  const qrCode = require("qrcode") as {
    toDataURL(
      text: string,
      options?: { width?: number; margin?: number; errorCorrectionLevel?: string },
    ): Promise<string>;
  };
  registerDevicePairingIpc({ ipcMain, client, toDataUrl: qrCode.toDataURL });

  const broadcastStatus = (status: MobileCallStatus): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send(IPC.CALL_MOBILE_STATUS, status);
      } catch {
        // A closing window may reject sends; the call lifecycle continues.
      }
    }
  };

  ipcMain.handle(IPC.CALL_MOBILE_START, async () => {
    const settings = loadGeneralSettings();
    const pairing = await startMobileCall(
      {
        serverUrl: settings.mobileCallLiveKitUrl,
        apiKey: settings.mobileCallLiveKitApiKey,
        apiSecret: settings.mobileCallLiveKitApiSecret,
      },
      undefined,
      {
        silenceMs: settings.asrVadSilenceMs,
        threshold: settings.asrVadThreshold,
      },
      broadcastStatus,
    );
    try {
      return {
        callId: pairing.callId,
        roomName: pairing.roomName,
        expiresAt: pairing.expiresAt,
        qrDataUrl: await qrCode.toDataURL(pairing.mobileLink, {
          width: 260,
          margin: 1,
          errorCorrectionLevel: "M",
        }),
      };
    } catch (error) {
      await stopMobileCall();
      throw error;
    }
  });
  ipcMain.handle(IPC.CALL_MOBILE_STOP, async () => {
    await stopMobileCall();
    broadcastStatus({ state: "ended" });
    return { ok: true };
  });

  let stopped = false;
  return {
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      powerMonitor.removeListener("suspend", onSuspend);
      powerMonitor.removeListener("resume", onResume);
      await Promise.allSettled([
        availability.stop(),
        remoteCalls.stop(),
        stopMobileCall(),
      ]);
    },
  };
}

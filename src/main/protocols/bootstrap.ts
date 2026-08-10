import { app, net, protocol } from "electron";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { getUiFontResponseHeaders, isSafeUiFontRequest } from "../ui-font-protocol";
import { getStickersDir } from "../sticker-storage";
import { parseLocalStickerFileFromUrl, resolveLocalStickerPath } from "../sticker-protocol";
import { getActiveCharacter } from "../character/active-character";
import {
  prepareLive2dModelJsonForProtocol,
  resolveCharacterResourceRequest,
} from "../character/character-resource";

/**
 * 注册自定义协议的特权。
 *
 * 注意：必须在 app.ready 之前调用，否则 scheme 无法被渲染进程识别。
 */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: "local-sticker", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
    { scheme: "local-font", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
    { scheme: "local-character", privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    } },
  ]);
}

function getUiFontsDir(): string {
  return path.join(app.getPath("userData"), "ui-fonts");
}

/**
 * 注册本地用户资源协议的实际处理器。
 *
 * - local-sticker:// 将请求映射到 userData/stickers/ 下的文件
 * - local-font:// 将请求映射到 userData/ui-fonts/ 下的文件
 */
export function registerProtocolHandlers(): void {
  protocol.handle("local-sticker", (request) => {
    const file = parseLocalStickerFileFromUrl(request.url);
    if (!file) return new Response("Invalid sticker URL", { status: 404 });

    const filePath = resolveLocalStickerPath(getStickersDir(), file);
    if (!filePath) return new Response("Invalid sticker path", { status: 403 });

    return net.fetch(pathToFileURL(filePath).toString());
  });

  protocol.handle("local-font", (request) => {
    let fileName: string;
    try {
      fileName = decodeURIComponent(new URL(request.url).hostname);
    } catch {
      return new Response("Invalid font URL", { status: 404 });
    }
    if (!isSafeUiFontRequest(fileName)) return new Response("Invalid font URL", { status: 404 });
    const filePath = path.join(getUiFontsDir(), fileName);
    if (path.dirname(filePath) !== getUiFontsDir() || !fs.existsSync(filePath)) return new Response("Font not found", { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString()).then((response) => new Response(response.body, {
      headers: getUiFontResponseHeaders(fileName),
    }));
  });

  protocol.handle("local-character", (request) => {
    const active = getActiveCharacter();
    const resolved = resolveCharacterResourceRequest(active, request.url);
    if (!resolved.ok) {
      return new Response("Invalid character resource", { status: resolved.status });
    }
    if (!fs.existsSync(resolved.filePath) || !fs.statSync(resolved.filePath).isFile()) {
      return new Response("Character resource not found", { status: 404 });
    }
    if (active.capabilities.live2d.status === "available"
      && resolved.filePath === active.capabilities.live2d.modelPath) {
      return new Response(prepareLive2dModelJsonForProtocol(fs.readFileSync(resolved.filePath, "utf8")), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    return net.fetch(pathToFileURL(resolved.filePath).toString());
  });
}

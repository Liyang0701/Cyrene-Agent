#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function nextPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`星野包版本不是 SemVer：${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  fail("用法：npm run prepare:hoshino-response -- <现有星野包目录> <新包输出目录>");
} else {
  const source = path.resolve(sourceArg);
  const output = path.resolve(outputArg);
  try {
    if (source === output) throw new Error("输出目录不能覆盖原始星野包");
    if (!fs.statSync(source).isDirectory()) throw new Error("星野包来源不是目录");
    if (fs.existsSync(output)) throw new Error(`输出目录已存在：${output}`);

    const manifestPath = path.join(source, "character.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.id !== "local.hoshino") {
      throw new Error(`只允许处理 local.hoshino，实际为：${String(manifest.id)}`);
    }
    if (typeof manifest.version !== "string") throw new Error("星野包缺少 version");

    const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    try {
      fs.cpSync(source, temporary, { recursive: true, errorOnExist: true });
      const upgraded = {
        ...manifest,
        version: nextPatchVersion(manifest.version),
        response: {
          language: "ja",
          translation: { targetLanguage: "zh-CN" },
        },
      };
      fs.writeFileSync(
        path.join(temporary, "character.json"),
        `${JSON.stringify(upgraded, null, 2)}\n`,
        { flag: "w" },
      );
      fs.renameSync(temporary, output);
      process.stdout.write(`${JSON.stringify({
        ok: true,
        id: upgraded.id,
        version: upgraded.version,
        output,
        response: upgraded.response,
      })}\n`);
    } finally {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

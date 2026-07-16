import fs from "fs";
import path from "path";

export const CHARACTER_PACKAGE_SCHEMA_VERSION = 1 as const;
export const BUILT_IN_CYRENE_ID = "cyrene" as const;

export type CharacterCapabilityName =
  | "worldbook"
  | "live2d"
  | "semanticActions"
  | "voice"
  | "stickers"
  | "openers";

export type CharacterPackageManifest = Readonly<{
  schemaVersion: typeof CHARACTER_PACKAGE_SCHEMA_VERSION;
  id: string;
  version: string;
  displayName: string;
  distributionStatus: "redistributable" | "local-only";
  compatibility: Readonly<{
    minimumAppVersion: string;
    maximumAppVersion?: string;
  }>;
  assetProvenance: readonly Readonly<{
    assetClass: "character-content" | "avatar" | "live2d" | "voice" | "stickers" | "other";
    source: string;
    license: string;
    distributionStatus: "redistributable" | "local-only";
  }>[];
  content: Readonly<{
    identity: string;
    soul: string;
    avatar: string;
  }>;
  capabilities?: Readonly<{
    worldbook?: Readonly<{ directory: string }>;
    live2d?: Readonly<{ model: string }>;
    semanticActions?: Readonly<{ mapping: string }>;
    voice?: Readonly<{ profile: string }>;
    stickers?: Readonly<{ directory: string }>;
    openers?: Readonly<{ directory: string }>;
  }>;
}>;

export type CharacterRuntimeDiagnostic = Readonly<{
  code: string;
  message: string;
  characterId?: string;
  field?: string;
  resourcePath?: string;
  capability?: CharacterCapabilityName;
}>;

type UnavailableCapability = Readonly<{ status: "unavailable" }>;
type WorldbookCapability = Readonly<{ status: "available"; directoryPath: string }>;
type Live2dCapability = Readonly<{ status: "available"; modelPath: string }>;
type FileCapability = Readonly<{ status: "available"; filePath: string }>;
type DirectoryCapability = Readonly<{ status: "available"; directoryPath: string }>;

export type ActiveCharacterContext = Readonly<{
  id: string;
  displayName: string;
  version: string;
  source: "builtin" | "local";
  readOnly: boolean;
  distributionStatus: "redistributable" | "local-only";
  packageRoot: string;
  content: Readonly<{
    identityPath: string;
    soulPath: string;
    avatarPath: string;
  }>;
  stateRoot: string;
  capabilities: Readonly<{
    worldbook: WorldbookCapability | UnavailableCapability;
    live2d: Live2dCapability | UnavailableCapability;
    semanticActions: FileCapability | UnavailableCapability;
    voice: FileCapability | UnavailableCapability;
    stickers: DirectoryCapability | UnavailableCapability;
    openers: DirectoryCapability | UnavailableCapability;
  }>;
}>;

export type CharacterPackageHealth = Readonly<{
  status: "healthy" | "unhealthy";
  diagnostics: readonly CharacterRuntimeDiagnostic[];
}>;

export type CharacterPackageSnapshot = Readonly<{
  id: string;
  displayName: string;
  version: string;
  source: "builtin" | "local";
  readOnly: boolean;
  health: CharacterPackageHealth;
}>;

export type CharacterRuntimeSnapshot = Readonly<{
  status: "ready" | "failed";
  activeCharacter: ActiveCharacterContext | null;
  packages: readonly CharacterPackageSnapshot[];
  diagnostics: readonly CharacterRuntimeDiagnostic[];
}>;

export type CharacterPackageSource = Readonly<{
  source: "builtin" | "local";
  rootPath: string;
  manifest: CharacterPackageManifest;
}>;

export interface CreateCharacterRuntimeOptions {
  userDataRoot: string;
  activeCharacterId: string;
  packages: readonly CharacterPackageSource[];
}

export interface CreateDefaultCharacterRuntimeOptions {
  appRoot: string;
  userDataRoot: string;
}

type EvaluatedPackage = Readonly<{
  source: CharacterPackageSource;
  health: CharacterPackageHealth;
}>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function resourceDiagnostic(
  source: CharacterPackageSource,
  field: string,
  relativePath: string,
): CharacterRuntimeDiagnostic {
  const resourcePath = path.resolve(source.rootPath, relativePath);
  return {
    code: "character.core_resource.missing",
    message: `角色包核心资源不存在：${field}`,
    characterId: source.manifest.id,
    field,
    resourcePath,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function evaluatePackage(
  source: CharacterPackageSource,
  reservedCharacterIds: ReadonlySet<string>,
): EvaluatedPackage {
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  const rawManifest = source.manifest as unknown as Record<string, unknown>;
  const rawContent = isRecord(rawManifest.content) ? rawManifest.content : {};
  const characterId = typeof rawManifest.id === "string" ? rawManifest.id : undefined;
  const invalidField = (field: string): void => {
    diagnostics.push({
      code: "character.manifest.invalid_field",
      message: `角色包 manifest 字段无效：${field}`,
      characterId,
      field,
    });
  };

  if (source.manifest.schemaVersion !== CHARACTER_PACKAGE_SCHEMA_VERSION) {
    diagnostics.push({
      code: "character.manifest.unsupported_schema",
      message: `不支持的角色包 schemaVersion：${source.manifest.schemaVersion}`,
      characterId: source.manifest.id,
      field: "schemaVersion",
    });
  }
  if (!isNonEmptyString(rawManifest.id) || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(rawManifest.id)) {
    invalidField("id");
  }
  if (!isNonEmptyString(rawManifest.version) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(rawManifest.version)) {
    invalidField("version");
  }
  if (!isNonEmptyString(rawManifest.displayName) || rawManifest.displayName.trim().length > 80) {
    invalidField("displayName");
  }
  if (rawManifest.distributionStatus !== "redistributable" && rawManifest.distributionStatus !== "local-only") {
    invalidField("distributionStatus");
  }
  const rawCompatibility = isRecord(rawManifest.compatibility) ? rawManifest.compatibility : {};
  if (!isNonEmptyString(rawCompatibility.minimumAppVersion)
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(rawCompatibility.minimumAppVersion)) {
    invalidField("compatibility.minimumAppVersion");
  }
  if (rawCompatibility.maximumAppVersion !== undefined
    && (!isNonEmptyString(rawCompatibility.maximumAppVersion)
      || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(rawCompatibility.maximumAppVersion))) {
    invalidField("compatibility.maximumAppVersion");
  }
  const allowedAssetClasses = new Set([
    "character-content", "avatar", "live2d", "voice", "stickers", "other",
  ]);
  if (!Array.isArray(rawManifest.assetProvenance) || rawManifest.assetProvenance.length === 0) {
    invalidField("assetProvenance");
  } else {
    rawManifest.assetProvenance.forEach((entry, index) => {
      if (!isRecord(entry)) {
        invalidField(`assetProvenance.${index}`);
        return;
      }
      if (!isNonEmptyString(entry.assetClass) || !allowedAssetClasses.has(entry.assetClass)) {
        invalidField(`assetProvenance.${index}.assetClass`);
      }
      if (!isNonEmptyString(entry.source)) invalidField(`assetProvenance.${index}.source`);
      if (!isNonEmptyString(entry.license)) invalidField(`assetProvenance.${index}.license`);
      if (entry.distributionStatus !== "redistributable" && entry.distributionStatus !== "local-only") {
        invalidField(`assetProvenance.${index}.distributionStatus`);
      }
    });
  }
  if (!isRecord(rawManifest.content)) {
    invalidField("content");
  }
  if (!isNonEmptyString(rawContent.identity)) invalidField("content.identity");
  if (!isNonEmptyString(rawContent.soul)) invalidField("content.soul");
  if (!isNonEmptyString(rawContent.avatar)) invalidField("content.avatar");
  const rawCapabilities = rawManifest.capabilities === undefined
    ? undefined
    : isRecord(rawManifest.capabilities)
      ? rawManifest.capabilities
      : null;
  if (rawCapabilities === null) invalidField("capabilities");
  if (source.source === "local" && reservedCharacterIds.has(source.manifest.id)) {
    diagnostics.push({
      code: "character.id.reserved",
      message: `本地角色包不能使用内置 Character ID：${source.manifest.id}`,
      characterId: source.manifest.id,
      field: "id",
    });
  }
  const coreResources: Array<readonly [string, string]> = [];
  if (isNonEmptyString(rawContent.identity)) coreResources.push(["content.identity", rawContent.identity]);
  if (isNonEmptyString(rawContent.soul)) coreResources.push(["content.soul", rawContent.soul]);
  if (isNonEmptyString(rawContent.avatar)) coreResources.push(["content.avatar", rawContent.avatar]);

  for (const [field, relativePath] of coreResources) {
    const resourcePath = path.resolve(source.rootPath, relativePath);
    if (!fs.existsSync(resourcePath) || !fs.statSync(resourcePath).isFile()) {
      diagnostics.push(resourceDiagnostic(source, field, relativePath));
    }
  }

  const declaredCapabilities: Array<{
    capability: CharacterCapabilityName;
    field: string;
    relativePath: string;
    kind: "file" | "directory";
  }> = [];
  const addCapabilityResource = (
    capability: CharacterCapabilityName,
    resourceField: string,
    kind: "file" | "directory",
  ): void => {
    if (!rawCapabilities) return;
    const rawCapability = rawCapabilities[capability];
    if (rawCapability === undefined) return;
    if (!isRecord(rawCapability)) {
      invalidField(`capabilities.${capability}`);
      return;
    }
    const field = `capabilities.${capability}.${resourceField}`;
    const relativePath = rawCapability[resourceField];
    if (!isNonEmptyString(relativePath)) {
      invalidField(field);
      return;
    }
    declaredCapabilities.push({ capability, field, relativePath, kind });
  };
  addCapabilityResource("worldbook", "directory", "directory");
  addCapabilityResource("live2d", "model", "file");
  addCapabilityResource("semanticActions", "mapping", "file");
  addCapabilityResource("voice", "profile", "file");
  addCapabilityResource("stickers", "directory", "directory");
  addCapabilityResource("openers", "directory", "directory");

  for (const declared of declaredCapabilities) {
    const resourcePath = path.resolve(source.rootPath, declared.relativePath);
    const exists = fs.existsSync(resourcePath);
    const hasExpectedKind = exists && (declared.kind === "file"
      ? fs.statSync(resourcePath).isFile()
      : fs.statSync(resourcePath).isDirectory());
    if (!hasExpectedKind) {
      diagnostics.push({
        code: "character.capability_resource.missing",
        message: `角色包声明的能力资源无效：${declared.field}`,
        characterId: source.manifest.id,
        capability: declared.capability,
        field: declared.field,
        resourcePath,
      });
    }
  }

  return {
    source,
    health: {
      status: diagnostics.length === 0 ? "healthy" : "unhealthy",
      diagnostics,
    },
  };
}

function unavailable(): UnavailableCapability {
  return { status: "unavailable" };
}

function buildActiveContext(
  evaluated: EvaluatedPackage,
  userDataRoot: string,
): ActiveCharacterContext {
  const { source } = evaluated;
  const { manifest } = source;
  const capabilities = manifest.capabilities;
  return {
    id: manifest.id,
    displayName: manifest.displayName,
    version: manifest.version,
    source: source.source,
    readOnly: source.source === "builtin",
    distributionStatus: manifest.distributionStatus,
    packageRoot: path.resolve(source.rootPath),
    content: {
      identityPath: path.resolve(source.rootPath, manifest.content.identity),
      soulPath: path.resolve(source.rootPath, manifest.content.soul),
      avatarPath: path.resolve(source.rootPath, manifest.content.avatar),
    },
    stateRoot: path.join(userDataRoot, "characters", manifest.id),
    capabilities: {
      worldbook: capabilities?.worldbook
        ? { status: "available", directoryPath: path.resolve(source.rootPath, capabilities.worldbook.directory) }
        : unavailable(),
      live2d: capabilities?.live2d
        ? { status: "available", modelPath: path.resolve(source.rootPath, capabilities.live2d.model) }
        : unavailable(),
      semanticActions: capabilities?.semanticActions
        ? { status: "available", filePath: path.resolve(source.rootPath, capabilities.semanticActions.mapping) }
        : unavailable(),
      voice: capabilities?.voice
        ? { status: "available", filePath: path.resolve(source.rootPath, capabilities.voice.profile) }
        : unavailable(),
      stickers: capabilities?.stickers
        ? { status: "available", directoryPath: path.resolve(source.rootPath, capabilities.stickers.directory) }
        : unavailable(),
      openers: capabilities?.openers
        ? { status: "available", directoryPath: path.resolve(source.rootPath, capabilities.openers.directory) }
        : unavailable(),
    },
  };
}

function toPackageSnapshot(evaluated: EvaluatedPackage): CharacterPackageSnapshot {
  const { source, health } = evaluated;
  return {
    id: source.manifest.id,
    displayName: source.manifest.displayName,
    version: source.manifest.version,
    source: source.source,
    readOnly: source.source === "builtin",
    health,
  };
}

export class CharacterRuntime {
  private snapshot: CharacterRuntimeSnapshot | null = null;

  constructor(private readonly options: CreateCharacterRuntimeOptions) {}

  async initialize(): Promise<CharacterRuntimeSnapshot> {
    if (this.snapshot) return this.snapshot;

    const reservedCharacterIds = new Set(
      this.options.packages
        .filter(({ source }) => source === "builtin")
        .map(({ manifest }) => manifest.id),
    );
    const evaluated = this.options.packages.map((source) => evaluatePackage(source, reservedCharacterIds));
    const matchingActivePackages = evaluated.filter(
      ({ source }) => source.manifest.id === this.options.activeCharacterId,
    );
    const active = matchingActivePackages.find(({ source }) => source.source === "builtin")
      ?? matchingActivePackages[0];
    const diagnostics: CharacterRuntimeDiagnostic[] = evaluated.flatMap(({ health }) => health.diagnostics);
    if (!active) {
      diagnostics.push({
        code: "character.active.missing",
        message: `找不到活动角色：${this.options.activeCharacterId}`,
        characterId: this.options.activeCharacterId,
      });
    }

    const ready = Boolean(active && active.health.status === "healthy");
    this.snapshot = deepFreeze({
      status: ready ? "ready" : "failed",
      activeCharacter: ready && active ? buildActiveContext(active, this.options.userDataRoot) : null,
      packages: evaluated.map(toPackageSnapshot),
      diagnostics,
    });
    return this.snapshot;
  }

  getSnapshot(): CharacterRuntimeSnapshot {
    if (!this.snapshot) throw new Error("CharacterRuntime 尚未初始化");
    return this.snapshot;
  }
}

export function createCharacterRuntime(options: CreateCharacterRuntimeOptions): CharacterRuntime {
  return new CharacterRuntime(options);
}

export function createDefaultCharacterRuntime(
  options: CreateDefaultCharacterRuntimeOptions,
): CharacterRuntime {
  const { appRoot, userDataRoot } = options;
  const manifest: CharacterPackageManifest = {
    schemaVersion: CHARACTER_PACKAGE_SCHEMA_VERSION,
    id: BUILT_IN_CYRENE_ID,
    version: "1.0.0",
    displayName: "昔涟",
    distributionStatus: "redistributable",
    compatibility: { minimumAppVersion: "0.1.0" },
    assetProvenance: [
      {
        assetClass: "character-content",
        source: "Cyrene Agent 内置角色内容",
        license: "仓库授权与非商业同人使用边界",
        distributionStatus: "redistributable",
      },
      {
        assetClass: "avatar",
        source: "Cyrene Agent 内置图标资源",
        license: "仓库授权与非商业同人使用边界",
        distributionStatus: "redistributable",
      },
      {
        assetClass: "live2d",
        source: "Bilibili 创作者 是依七哒",
        license: "MODEL_LICENSE.md 中记录的再分发授权与非商业同人使用边界",
        distributionStatus: "redistributable",
      },
    ],
    content: {
      identity: "prompts/identity.md",
      soul: "prompts/soul.md",
      avatar: "assets/icon-presets/cyrene-sun.png",
    },
    capabilities: {
      worldbook: { directory: "prompts/worldbook" },
      live2d: { model: "assets/models/cyrene/Cyrene.model3.json" },
    },
  };
  return createCharacterRuntime({
    userDataRoot,
    activeCharacterId: BUILT_IN_CYRENE_ID,
    packages: [{ source: "builtin", rootPath: appRoot, manifest }],
  });
}

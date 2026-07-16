import type { ActiveCharacterContext } from "./character-runtime";
import {
  loadActiveCharacterTextContext,
  type ActiveCharacterTextContext,
} from "./character-text-context";

export type ActiveCharacterPublicIdentity = Readonly<{
  id: string;
  displayName: string;
  avatarUrl: string;
}>;

let activeContext: ActiveCharacterContext | null = null;
let activeTextContext: ActiveCharacterTextContext | null = null;

export function configureActiveCharacter(context: ActiveCharacterContext): void {
  activeContext = context;
  activeTextContext = loadActiveCharacterTextContext(context);
}

export function getActiveCharacter(): ActiveCharacterContext {
  if (!activeContext) throw new Error("活动角色尚未就绪");
  return activeContext;
}

export function getActiveCharacterText(): ActiveCharacterTextContext {
  if (!activeTextContext) throw new Error("活动角色文本上下文尚未就绪");
  return activeTextContext;
}

export function peekActiveCharacterText(): ActiveCharacterTextContext | null {
  return activeTextContext;
}

export function getActiveCharacterPublicIdentity(): ActiveCharacterPublicIdentity {
  const active = getActiveCharacter();
  return Object.freeze({
    id: active.id,
    displayName: active.displayName,
    avatarUrl: `local-character://active/avatar?character=${encodeURIComponent(active.id)}`,
  });
}

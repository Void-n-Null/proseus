import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const DATA_DIR_ENV = "PROSEUS_DATA_DIR";

export function getAppRootDir(): string {
  return APP_ROOT_DIR;
}

export function getDataDir(): string {
  const configured = process.env[DATA_DIR_ENV]?.trim();
  return configured ? resolve(configured) : APP_ROOT_DIR;
}

export function ensureDirectoryExists(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function ensureParentDirectoryExists(path: string): void {
  ensureDirectoryExists(dirname(path));
}

export function getDatabasePath(path?: string): string {
  if (path === ":memory:") return path;
  if (!path) return join(getDataDir(), "proseus.db");
  return isAbsolute(path) ? path : resolve(path);
}

export function getEncryptionKeyPath(): string {
  return join(getDataDir(), ".proseus-key");
}

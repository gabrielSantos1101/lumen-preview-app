import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const memoryStore: Record<string, string> = {};

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    memoryStore[key] = value;
    try { localStorage.setItem(key, value); } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key); } catch {}
    return memoryStore[key] ?? null;
  }
  return await SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    delete memoryStore[key];
    try { localStorage.removeItem(key); } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

const CREDENTIALS_KEY = "lumen_desktop_credentials_v2";
const ACTIVE_SERVER_IP_KEY = "lumen_active_server_ip";
const DEVICE_NAME_KEY = "lumen_device_name";

const LEGACY_KEYS = {
  PRIVATE_KEY: "lumen_private_key",
  PUBLIC_KEY: "lumen_public_key",
  ACCESS_TOKEN: "lumen_access_token",
  REFRESH_TOKEN: "lumen_refresh_token",
  DEVICE_ID: "lumen_device_id",
  SERVER_IP: "lumen_server_ip",
} as const;

export interface DesktopCredentials {
  serverIp: string;
  privateKey: string;
  publicKey: string;
  deviceId: string;
  accessToken?: string;
  refreshToken?: string;
  desktopName?: string;
  customDesktopName?: string;
  updatedAt: number;
}

type CredentialsPatch = {
  privateKey?: string;
  publicKey?: string;
  accessToken?: string;
  refreshToken?: string;
  deviceId?: string;
  serverIp?: string;
  desktopName?: string;
};

const EMPTY_CREDENTIALS = {
  privateKey: null,
  publicKey: null,
  accessToken: null,
  refreshToken: null,
  deviceId: null,
  serverIp: null,
} as const;

function normalizeServerIp(ip: string | null | undefined): string | null {
  const trimmed = ip?.trim();
  return trimmed ? trimmed : null;
}

function normalizeDesktopLabel(label: string | undefined): string | undefined {
  const trimmed = label?.trim();
  return trimmed ? trimmed : undefined;
}

async function saveProfiles(profiles: DesktopCredentials[]) {
  await setItem(CREDENTIALS_KEY, JSON.stringify(profiles));
}

async function loadLegacyCredentials(): Promise<DesktopCredentials[]> {
  const [privateKey, publicKey, accessToken, refreshToken, deviceId, serverIp] = await Promise.all([
    getItem(LEGACY_KEYS.PRIVATE_KEY),
    getItem(LEGACY_KEYS.PUBLIC_KEY),
    getItem(LEGACY_KEYS.ACCESS_TOKEN),
    getItem(LEGACY_KEYS.REFRESH_TOKEN),
    getItem(LEGACY_KEYS.DEVICE_ID),
    getItem(LEGACY_KEYS.SERVER_IP),
  ]);

  const legacyIp = normalizeServerIp(serverIp);
  if (!privateKey || !publicKey || !deviceId || !legacyIp) return [];

  return [
    {
      serverIp: legacyIp,
      privateKey,
      publicKey,
      deviceId,
      accessToken: accessToken ?? undefined,
      refreshToken: refreshToken ?? undefined,
      updatedAt: Date.now(),
    },
  ];
}

async function clearLegacyCredentials() {
  await Promise.all(Object.values(LEGACY_KEYS).map((k) => deleteItem(k)));
}

async function loadProfiles(): Promise<DesktopCredentials[]> {
  const raw = await getItem(CREDENTIALS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry): entry is DesktopCredentials => {
            if (!entry || typeof entry !== "object") return false;
            const value = entry as Record<string, unknown>;
            return (
              typeof value.serverIp === "string" &&
              typeof value.privateKey === "string" &&
              typeof value.publicKey === "string" &&
              typeof value.deviceId === "string"
            );
          })
          .map((entry) => ({
            ...entry,
            serverIp: entry.serverIp.trim(),
            updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now(),
          }))
          .filter((entry) => entry.serverIp.length > 0);
      }
    } catch {}
  }

  const migrated = await loadLegacyCredentials();
  if (migrated.length > 0) {
    await saveProfiles(migrated);
    await setItem(ACTIVE_SERVER_IP_KEY, migrated[0].serverIp);
  }
  await clearLegacyCredentials();
  return migrated;
}

export async function listCredentials(): Promise<DesktopCredentials[]> {
  const profiles = await loadProfiles();
  return profiles.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function setActiveServerIp(serverIp: string | null) {
  const normalized = normalizeServerIp(serverIp);
  if (!normalized) {
    await deleteItem(ACTIVE_SERVER_IP_KEY);
    return;
  }
  await setItem(ACTIVE_SERVER_IP_KEY, normalized);
}

export async function getActiveServerIp() {
  const ip = await getItem(ACTIVE_SERVER_IP_KEY);
  return normalizeServerIp(ip);
}

export async function saveCredentials(data: CredentialsPatch) {
  const profiles = await loadProfiles();
  const serverIp = normalizeServerIp(data.serverIp) ?? (await getActiveServerIp());
  const normalizedDesktopName = normalizeDesktopLabel(data.desktopName);
  if (!serverIp) return;

  const index = profiles.findIndex((profile) => profile.serverIp === serverIp);
  if (index === -1) {
    if (!data.privateKey || !data.publicKey || !data.deviceId) return;

    profiles.push({
      serverIp,
      privateKey: data.privateKey,
      publicKey: data.publicKey,
      deviceId: data.deviceId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      desktopName: normalizedDesktopName,
      updatedAt: Date.now(),
    });
  } else {
    const current = profiles[index];
    profiles[index] = {
      ...current,
      privateKey: data.privateKey ?? current.privateKey,
      publicKey: data.publicKey ?? current.publicKey,
      deviceId: data.deviceId ?? current.deviceId,
      accessToken: data.accessToken ?? current.accessToken,
      refreshToken: data.refreshToken ?? current.refreshToken,
      desktopName: normalizedDesktopName ?? current.desktopName,
      updatedAt: Date.now(),
    };
  }

  await saveProfiles(profiles);
  await setActiveServerIp(serverIp);
}

export async function loadCredentials(serverIp?: string | null) {
  const profiles = await loadProfiles();
  const targetIp = normalizeServerIp(serverIp) ?? (await getActiveServerIp()) ?? profiles[0]?.serverIp ?? null;
  if (!targetIp) return { ...EMPTY_CREDENTIALS };

  const profile = profiles.find((entry) => entry.serverIp === targetIp);
  if (!profile) return { ...EMPTY_CREDENTIALS };

  await setActiveServerIp(profile.serverIp);
  return {
    privateKey: profile.privateKey,
    publicKey: profile.publicKey,
    accessToken: profile.accessToken ?? null,
    refreshToken: profile.refreshToken ?? null,
    deviceId: profile.deviceId,
    serverIp: profile.serverIp,
  };
}

export async function clearCredentials(serverIp?: string | null) {
  const targetIp = normalizeServerIp(serverIp);
  if (!targetIp) {
    await deleteItem(CREDENTIALS_KEY);
    await deleteItem(ACTIVE_SERVER_IP_KEY);
    await clearLegacyCredentials();
    return;
  }

  const profiles = await loadProfiles();
  const remaining = profiles.filter((profile) => profile.serverIp !== targetIp);
  await saveProfiles(remaining);

  const activeIp = await getActiveServerIp();
  if (activeIp === targetIp) {
    await setActiveServerIp(remaining[0]?.serverIp ?? null);
  }
}

export async function renameDesktop(serverIp: string, customDesktopName: string) {
  const targetIp = normalizeServerIp(serverIp);
  if (!targetIp) return;

  const profiles = await loadProfiles();
  const index = profiles.findIndex((profile) => profile.serverIp === targetIp);
  if (index === -1) return;

  const nextName = customDesktopName.trim();
  profiles[index] = {
    ...profiles[index],
    customDesktopName: nextName.length > 0 ? nextName : undefined,
    updatedAt: Date.now(),
  };
  await saveProfiles(profiles);
}

export async function saveDeviceName(deviceName: string) {
  await setItem(DEVICE_NAME_KEY, deviceName);
}

export async function loadDeviceName() {
  return await getItem(DEVICE_NAME_KEY);
}

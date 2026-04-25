import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import * as Application from "expo-application";

import {
  generateKeyPair,
  generateChallenge,
  signChallenge,
  uint8ToBase64,
  base64ToUint8,
} from "@/utils/crypto";
import type { RemoteEvent, RemotePayload } from "@/utils/remoteCommands";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  listCredentials,
  setActiveServerIp,
  getActiveServerIp,
  renameDesktop as renameDesktopLabel,
} from "@/utils/storage";
import type { Permissions } from "@/utils/remoteTypes";
import { useRemoteControlStore } from "@/stores/remoteControlStore";

export type WSState =
  | "idle"
  | "connecting"
  | "registering"
  | "authenticating"
  | "connected"
  | "error";

export interface KnownDesktop {
  serverIp: string;
  label: string;
}

interface WebSocketContextType {
  state: WSState;
  sessionId: string | null;
  serverIp: string | null;
  isRegistered: boolean;
  knownDesktops: KnownDesktop[];
  lastError: string | null;

  register: (ip: string, token: string, deviceName: string) => Promise<void>;
  reconnect: (ip: string) => Promise<void>;
  disconnect: () => void;
  forgetDevice: (targetIp?: string | null) => Promise<void>;
  renameDesktop: (targetIp: string, label: string) => Promise<void>;
  sendRaw: (msg: Record<string, unknown>) => boolean;
  subscribeToMessages: (listener: (msg: Record<string, unknown>) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used inside WebSocketProvider");
  return ctx;
}

async function getDeviceId(): Promise<string> {
  if (Platform.OS === "android") {
    return Application.getAndroidId() ?? `lumen-${Date.now()}`;
  }
  if (Platform.OS === "ios") {
    return (await Application.getIosIdForVendorAsync()) ?? `lumen-${Date.now()}`;
  }
  return `lumen-web-${Date.now()}`;
}

const RECONNECT_FAST_DELAY_MS = 10_000;
const RECONNECT_SLOW_DELAY_MS = 600_000;
const RECONNECT_FAST_MAX = 5;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WSState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [knownDesktops, setKnownDesktops] = useState<KnownDesktop[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const messageListenersRef = useRef(new Set<(msg: Record<string, unknown>) => void>());
  const pendingResolveRef = useRef<(() => void) | null>(null);
  const pendingRejectRef = useRef<((e: string) => void) | null>(null);
  const authFailReasonRef = useRef<string | null>(null);
  const lastAuthPayloadRef = useRef<{
    serverIp: string | null;
    accessToken?: string;
    refreshToken?: string;
    desktopName?: string;
  } | null>(null);

  const serverIpRef = useRef<string | null>(null);
  const reconnectFnRef = useRef<((ip: string) => Promise<void>) | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReconnectRef = useRef(false);
  const retryCountRef = useRef(0);

  const remoteControlStore = useRemoteControlStore;

  useEffect(() => {
    serverIpRef.current = serverIp;
  }, [serverIp]);

  const refreshKnownDesktops = useCallback(async () => {
    const profiles = await listCredentials();
    const desktops = profiles.map((profile) => ({
      serverIp: profile.serverIp,
      label: (profile.customDesktopName?.trim() || profile.desktopName?.trim() || "Desktop"),
    }));
    setKnownDesktops(desktops);
    setIsRegistered(desktops.length > 0);
    return desktops.map((desktop) => desktop.serverIp);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!autoReconnectRef.current) return;
    const ip = serverIpRef.current;
    if (!ip) return;

    const delay =
      retryCountRef.current < RECONNECT_FAST_MAX
        ? RECONNECT_FAST_DELAY_MS
        : RECONNECT_SLOW_DELAY_MS;

    clearTimeout(reconnectTimerRef.current ?? undefined);
    reconnectTimerRef.current = setTimeout(() => {
      if (!autoReconnectRef.current || !serverIpRef.current) return;
      reconnectFnRef.current?.(serverIpRef.current).catch(() => {
        retryCountRef.current += 1;
        scheduleReconnect();
      });
    }, delay);
  }, []);

  const cancelAutoReconnect = useCallback(() => {
    autoReconnectRef.current = false;
    retryCountRef.current = 0;
    clearTimeout(reconnectTimerRef.current ?? undefined);
    reconnectTimerRef.current = null;
  }, []);

  const resetRemoteControl = useCallback(() => {
    remoteControlStore.getState().reset();
    remoteControlStore.getState().setPermissions(null);
    remoteControlStore.getState().setTransportSender(null);
    remoteControlStore.getState().setTransportReady(false);
  }, [remoteControlStore]);

  const closeWs = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    remoteControlStore.getState().setTransportSender(null);
    remoteControlStore.getState().setTransportReady(false);
  }, [remoteControlStore]);

  const disconnect = useCallback(() => {
    cancelAutoReconnect();
    authFailReasonRef.current = null;
    closeWs();
    setState("idle");
    setSessionId(null);
    resetRemoteControl();
  }, [cancelAutoReconnect, closeWs, resetRemoteControl]);

  useEffect(() => {
    const timer = setInterval(() => {
      remoteControlStore.getState().tick(Date.now());
    }, 500);

    return () => clearInterval(timer);
  }, [remoteControlStore]);

  const handleIncoming = useCallback(
    (msg: Record<string, unknown>) => {
      if (msg.event === "auth_ok") {
        authFailReasonRef.current = null;
        retryCountRef.current = 0;
        setState("connected");
        remoteControlStore.getState().setTransportReady(true);

        const desktopName =
          typeof msg.desktop_name === "string" && msg.desktop_name.trim().length > 0
            ? (msg.desktop_name as string)
            : undefined;
        const accessToken = typeof msg.access_token === "string" ? (msg.access_token as string) : undefined;
        const refreshToken =
          typeof msg.refresh_token === "string" ? (msg.refresh_token as string) : undefined;
        lastAuthPayloadRef.current = {
          serverIp: serverIpRef.current,
          accessToken,
          refreshToken,
          desktopName,
        };

        if (msg.session_id) setSessionId(msg.session_id as string);
        if (msg.permissions) {
          remoteControlStore.getState().setPermissions(msg.permissions as Permissions);
          remoteControlStore.getState().clearBlockedFeatures();
        }
        if (accessToken || desktopName) {
          void (async () => {
            await saveCredentials({
              serverIp: serverIpRef.current ?? undefined,
              accessToken,
              refreshToken,
              desktopName,
            });
            await refreshKnownDesktops();
          })();
        }

        pendingResolveRef.current?.();
        pendingResolveRef.current = null;
        pendingRejectRef.current = null;
        return;
      }

      if (msg.event === "auth_fail") {
        const reason = (msg.reason as string) ?? "auth_fail";
        authFailReasonRef.current = reason;
        setLastError(reason);
        setState("error");
        resetRemoteControl();

        pendingRejectRef.current?.(reason);
        pendingResolveRef.current = null;
        pendingRejectRef.current = null;
        return;
      }

      if (msg.event === "permissions_updated") {
        if (msg.permissions) {
          remoteControlStore.getState().setPermissions(msg.permissions as Permissions);
        }
        remoteControlStore.getState().clearBlockedFeatures();
        return;
      }

      if (msg.event === "permission_denied") {
        const denied = msg.feature;
        if (typeof denied === "string") {
          remoteControlStore.getState().markFeatureBlocked(denied as RemoteEvent);
        }
        return;
      }

      if (msg.event === "player_sync") {
        remoteControlStore.getState().applyPlayerSyncMessage(msg);
      }
    },
    [remoteControlStore, resetRemoteControl]
  );

  const openWs = useCallback(
    (ip: string): Promise<WebSocket> =>
      new Promise((resolve, reject) => {
        closeWs();
        setState("connecting");
        setLastError(null);
        authFailReasonRef.current = null;

        const ws = new WebSocket(`ws://${ip}:8080`);
        wsRef.current = ws;

        let authenticated = false;

        const timeout = setTimeout(() => {
          reject("Connection timed out");
          ws.close();
        }, 10_000);

        ws.onopen = () => {
          clearTimeout(timeout);
          remoteControlStore.getState().setTransportSender((payload: RemotePayload) => {
            const current = wsRef.current;
            if (!current || current.readyState !== WebSocket.OPEN) return false;
            current.send(JSON.stringify(payload));
            return true;
          });
          resolve(ws);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          setLastError("Connection failed");
          setState("error");
          remoteControlStore.getState().setTransportReady(false);
          reject("Connection failed");
        };

        ws.onclose = (e) => {
          clearTimeout(timeout);
          if (wsRef.current === ws) wsRef.current = null;

          remoteControlStore.getState().setTransportReady(false);
          remoteControlStore.getState().setTransportSender(null);

          const authFailReason = authFailReasonRef.current;
          authFailReasonRef.current = null;

          if (e.code === 4001 && authFailReason === "unauthorized") {
            cancelAutoReconnect();
            setState("idle");
            setSessionId(null);
            setServerIp(null);
            setLastError("Unauthorized or remote disabled");
            resetRemoteControl();
            const ipToForget = serverIpRef.current;
            serverIpRef.current = null;
            void (async () => {
              await clearCredentials(ipToForget);
              const ips = await refreshKnownDesktops();
              const nextIp = ips[0] ?? null;
              setServerIp(nextIp);
              serverIpRef.current = nextIp;
            })();
            return;
          }

          if (e.code === 4003) {
            cancelAutoReconnect();
            setLastError("Device removed by admin");
            setState("error");
          } else if (e.code === 4001) {
            cancelAutoReconnect();
            setLastError("Unauthorized or remote disabled");
            setState("error");
          } else if (e.code === 4004) {
            cancelAutoReconnect();
            setLastError("Signature verification failed");
            setState("error");
          } else if (e.code === 4005) {
            cancelAutoReconnect();
            setLastError("Device disabled by admin");
            setState("error");
          } else if (authenticated) {
            setSessionId(null);
            setState("idle");
            scheduleReconnect();
          }
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.event === "auth_ok") authenticated = true;
            handleIncoming(msg);
            messageListenersRef.current.forEach((fn) => { fn(msg); });
          } catch {}
        };
      }),
    [
      cancelAutoReconnect,
      closeWs,
      handleIncoming,
      remoteControlStore,
      refreshKnownDesktops,
      resetRemoteControl,
      scheduleReconnect,
    ]
  );

  const register = useCallback(
    async (ip: string, token: string, deviceName: string) => {
      cancelAutoReconnect();
      retryCountRef.current = 0;
      serverIpRef.current = ip;
      setServerIp(ip);
      await setActiveServerIp(ip);

      const keyPair = generateKeyPair();
      const publicKeyB64 = uint8ToBase64(keyPair.publicKey);
      const privateKeyB64 = uint8ToBase64(keyPair.secretKey);
      const deviceId = await getDeviceId();

      const ws = await openWs(ip);
      setState("registering");

      await new Promise<void>((resolve, reject) => {
        pendingResolveRef.current = resolve;
        pendingRejectRef.current = reject;

        ws.send(
          JSON.stringify({
            event: "register",
            token,
            device_id: deviceId,
            device_name: deviceName,
            device_type: "mobile",
            public_key: publicKeyB64,
            os: Platform.OS === "ios" ? "ios" : "android",
            version: Application.nativeApplicationVersion ?? "1.0.0",
          })
        );
      });

      await saveCredentials({
        privateKey: privateKeyB64,
        publicKey: publicKeyB64,
        deviceId,
        serverIp: ip,
        accessToken:
          lastAuthPayloadRef.current?.serverIp === ip ? lastAuthPayloadRef.current?.accessToken : undefined,
        refreshToken:
          lastAuthPayloadRef.current?.serverIp === ip ? lastAuthPayloadRef.current?.refreshToken : undefined,
        desktopName:
          lastAuthPayloadRef.current?.serverIp === ip ? lastAuthPayloadRef.current?.desktopName : undefined,
      });
      if (lastAuthPayloadRef.current?.serverIp === ip) {
        lastAuthPayloadRef.current = null;
      }

      serverIpRef.current = ip;
      setServerIp(ip);
      await setActiveServerIp(ip);
      await refreshKnownDesktops();
      setIsRegistered(true);
      autoReconnectRef.current = true;
    },
    [cancelAutoReconnect, openWs, refreshKnownDesktops]
  );

  const reconnect = useCallback(
    async (ip: string) => {
      serverIpRef.current = ip;
      setServerIp(ip);
      await setActiveServerIp(ip);
      const creds = await loadCredentials(ip);
      if (!creds.accessToken || !creds.deviceId || !creds.privateKey) {
        throw new Error("No stored credentials");
      }

      const ws = await openWs(ip);
      setState("authenticating");

      const challengeBytes = await generateChallenge();
      const secretKey = base64ToUint8(creds.privateKey);
      const signature = signChallenge(challengeBytes, secretKey);

      await new Promise<void>((resolve, reject) => {
        pendingResolveRef.current = resolve;
        pendingRejectRef.current = reject;

        ws.send(
          JSON.stringify({
            event: "auth",
            device_id: creds.deviceId,
            access_token: creds.accessToken,
            signed_challenge: {
              challenge: uint8ToBase64(challengeBytes),
              signature: uint8ToBase64(signature),
            },
          })
        );
      });

      serverIpRef.current = ip;
      setServerIp(ip);
      await setActiveServerIp(ip);
      autoReconnectRef.current = true;
    },
    [openWs]
  );

  const sendForgetDeviceEvent = useCallback(
    async (targetIp: string) => {
      const currentIp = serverIpRef.current;
      const currentWs = wsRef.current;
      if (
        currentIp === targetIp &&
        currentWs &&
        currentWs.readyState === WebSocket.OPEN
      ) {
        currentWs.send(JSON.stringify({ event: "forget_device" }));
        return;
      }

      const creds = await loadCredentials(targetIp);
      if (!creds.accessToken || !creds.deviceId || !creds.privateKey) return;

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://${targetIp}:8080`);
        let settled = false;

        const finish = (cb: () => void) => {
          if (settled) return;
          settled = true;
          cb();
          try {
            ws.close();
          } catch {}
        };

        const timeout = setTimeout(() => {
          finish(() => reject(new Error("Forget device timeout")));
        }, 8000);

        ws.onopen = async () => {
          try {
            const challengeBytes = await generateChallenge();
            const secretKey = base64ToUint8(creds.privateKey!);
            const signature = signChallenge(challengeBytes, secretKey);

            ws.send(
              JSON.stringify({
                event: "auth",
                device_id: creds.deviceId,
                access_token: creds.accessToken,
                signed_challenge: {
                  challenge: uint8ToBase64(challengeBytes),
                  signature: uint8ToBase64(signature),
                },
              })
            );
          } catch (err) {
            clearTimeout(timeout);
            finish(() => reject(err instanceof Error ? err : new Error("Auth payload failed")));
          }
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.event === "auth_ok") {
              ws.send(JSON.stringify({ event: "forget_device" }));
              clearTimeout(timeout);
              finish(resolve);
              return;
            }
            if (msg.event === "auth_fail") {
              clearTimeout(timeout);
              finish(() => reject(new Error("Auth failed")));
            }
          } catch {}
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          finish(() => reject(new Error("Forget device socket error")));
        };
      });
    },
    []
  );

  const reconnectWithFallback = useCallback(
    async (preferredIp?: string | null) => {
      const knownIps = await refreshKnownDesktops();
      const activeIp =
        preferredIp?.trim() ||
        serverIpRef.current ||
        (await getActiveServerIp()) ||
        knownIps[0] ||
        null;

      if (!activeIp) {
        throw new Error("No saved desktops");
      }

      const candidates = [activeIp, ...knownIps.filter((ip) => ip !== activeIp)];
      let lastErr: unknown = null;

      for (const ip of candidates) {
        try {
          const creds = await loadCredentials(ip);
          if (!creds.accessToken || !creds.deviceId || !creds.privateKey) continue;
          await reconnect(ip);
          return ip;
        } catch (err) {
          lastErr = err;
        }
      }

      throw (lastErr ?? new Error("No reachable desktop"));
    },
    [reconnect, refreshKnownDesktops]
  );

  useEffect(() => {
    reconnectFnRef.current = async (ip: string) => {
      await reconnectWithFallback(ip);
    };
  }, [reconnectWithFallback]);

  useEffect(() => {
    (async () => {
      const ips = await refreshKnownDesktops();
      if (ips.length === 0) return;

      const preferredIp = (await getActiveServerIp()) ?? ips[0];
      serverIpRef.current = preferredIp;
      setServerIp(preferredIp);
      setIsRegistered(true);
      autoReconnectRef.current = true;

      try {
        await reconnectWithFallback(preferredIp);
      } catch {
        setState("idle");
        scheduleReconnect();
      }
    })();
  }, [reconnectWithFallback, refreshKnownDesktops, scheduleReconnect]);

  const forgetDevice = useCallback(async (targetIp?: string | null) => {
    authFailReasonRef.current = null;

    const normalizedTarget = targetIp?.trim() || serverIpRef.current;
    if (!normalizedTarget) return;
    const currentIp = serverIpRef.current;
    const forgettingCurrent = normalizedTarget === currentIp;

    try {
      await sendForgetDeviceEvent(normalizedTarget);
    } catch {}

    if (forgettingCurrent) {
      cancelAutoReconnect();
      closeWs();
      setState("idle");
      setSessionId(null);
      resetRemoteControl();
    }

    await clearCredentials(normalizedTarget);
    const ips = await refreshKnownDesktops();
    const nextIp = forgettingCurrent ? ips[0] ?? null : currentIp;

    setServerIp(nextIp);
    serverIpRef.current = nextIp;
    if (nextIp) await setActiveServerIp(nextIp);
    setLastError(null);
  }, [cancelAutoReconnect, closeWs, refreshKnownDesktops, resetRemoteControl, sendForgetDeviceEvent]);

  const renameDesktop = useCallback(async (targetIp: string, label: string) => {
    await renameDesktopLabel(targetIp, label);
    await refreshKnownDesktops();
  }, [refreshKnownDesktops]);

  const sendRaw = useCallback((msg: Record<string, unknown>): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const subscribeToMessages = useCallback(
    (listener: (msg: Record<string, unknown>) => void): (() => void) => {
      messageListenersRef.current.add(listener);
      return () => { messageListenersRef.current.delete(listener); };
    },
    []
  );

  return (
    <WebSocketContext.Provider
      value={{
        state,
        sessionId,
        serverIp,
        isRegistered,
        knownDesktops,
        lastError,
        register,
        reconnect,
        disconnect,
        forgetDevice,
        renameDesktop,
        sendRaw,
        subscribeToMessages,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

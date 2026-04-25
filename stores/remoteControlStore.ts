import { create } from "zustand";
import {
  EVENT_PERMISSION_MAP,
  normalizeRemotePayload,
  type RemoteEvent,
  type RemotePayload,
} from "@/utils/remoteCommands";
import { EMPTY_REMOTE_SYNC, type RemoteSyncState } from "@/utils/remoteSync";
import {
  advanceRemoteSyncState,
  applyOptimisticRemoteCommand,
  applyPlayerSyncMessage,
  createPlaybackClock,
  resetRemoteSyncState,
  type PlaybackClock,
} from "@/utils/remoteSyncMachine";
import type { Permissions } from "@/utils/remoteTypes";

interface RemoteControlTransport {
  ready: boolean;
  sender: ((payload: RemotePayload) => boolean) | null;
}

interface SendResult {
  ok: boolean;
  reason?: string;
}

interface RemoteControlStoreState {
  blockedFeatures: RemoteEvent[];
  permissions: Permissions | null;
  remoteSync: RemoteSyncState;
  transport: RemoteControlTransport;
  clock: PlaybackClock;

  reset: () => void;
  setPermissions: (permissions: Permissions | null) => void;
  setTransportReady: (ready: boolean) => void;
  setTransportSender: (sender: ((payload: RemotePayload) => boolean) | null) => void;
  markFeatureBlocked: (feature: RemoteEvent) => void;
  clearBlockedFeatures: () => void;
  applyPlayerSyncMessage: (message: Record<string, unknown>) => void;
  tick: (now?: number) => void;
  canSendEvent: (event: RemoteEvent) => boolean;
  sendEvent: (payload: RemotePayload) => SendResult;
}

const DEFAULT_TRANSPORT: RemoteControlTransport = {
  ready: false,
  sender: null,
};

export const useRemoteControlStore = create<RemoteControlStoreState>((set, get) => ({
  blockedFeatures: [],
  permissions: null,
  remoteSync: EMPTY_REMOTE_SYNC,
  transport: DEFAULT_TRANSPORT,
  clock: createPlaybackClock(),

  reset: () => {
    const next = resetRemoteSyncState();
    set({
      blockedFeatures: [],
      remoteSync: next.sync,
      clock: next.clock,
      transport: {
        ...get().transport,
        ready: false,
      },
    });
  },

  setPermissions: (permissions) => set({ permissions }),

  setTransportReady: (ready) =>
    set((state) => ({
      transport: {
        ...state.transport,
        ready,
      },
    })),

  setTransportSender: (sender) =>
    set((state) => ({
      transport: {
        ...state.transport,
        sender,
      },
    })),

  markFeatureBlocked: (feature) =>
    set((state) => ({
      blockedFeatures: state.blockedFeatures.includes(feature)
        ? state.blockedFeatures
        : [...state.blockedFeatures, feature],
    })),

  clearBlockedFeatures: () => set({ blockedFeatures: [] }),

  applyPlayerSyncMessage: (message) =>
    set((state) => {
      const next = applyPlayerSyncMessage(state.remoteSync, message, Date.now());
      return {
        remoteSync: next.sync,
        clock: next.clock,
      };
    }),

  tick: (now = Date.now()) =>
    set((state) => ({
      remoteSync: advanceRemoteSyncState(state.remoteSync, state.clock, now),
    })),

  canSendEvent: (event) => {
    const state = get();
    if (!state.transport.ready || !state.transport.sender) return false;

    const permissionKey = EVENT_PERMISSION_MAP[event];
    const permissionGranted = state.permissions?.[permissionKey] ?? true;

    return permissionGranted && !state.blockedFeatures.includes(event);
  },

  sendEvent: (payload) => {
    const state = get();
    if (!state.transport.ready || !state.transport.sender) {
      return { ok: false, reason: "not_connected" };
    }

    const normalizedPayload = normalizeRemotePayload(payload);
    const permissionKey = EVENT_PERMISSION_MAP[normalizedPayload.event];
    const permissionGranted = state.permissions?.[permissionKey] ?? true;

    if (!permissionGranted) {
      return { ok: false, reason: `permission_${permissionKey}` };
    }

    if (state.blockedFeatures.includes(normalizedPayload.event)) {
      return { ok: false, reason: "permission_denied" };
    }

    try {
      const sent = state.transport.sender(normalizedPayload);
      if (!sent) {
        return { ok: false, reason: "send_failed" };
      }

      const next = applyOptimisticRemoteCommand(
        state.remoteSync,
        state.clock,
        normalizedPayload,
        Date.now()
      );

      set({
        remoteSync: next.sync,
        clock: next.clock,
      });

      return { ok: true };
    } catch {
      return { ok: false, reason: "send_failed" };
    }
  },
}));

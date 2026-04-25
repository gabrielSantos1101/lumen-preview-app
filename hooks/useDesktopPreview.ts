import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { useWebSocket } from "@/context/WebSocketContext";

let RTCPeerConnection: any = null;
let RTCSessionDescription: any = null;
let RTCIceCandidate: any = null;
let MediaStreamCtor: any = null;
let webrtcAvailable = false;

if (Platform.OS === "web") {
  RTCPeerConnection = window.RTCPeerConnection;
  RTCSessionDescription = window.RTCSessionDescription;
  RTCIceCandidate = window.RTCIceCandidate;
  MediaStreamCtor = window.MediaStream;
  webrtcAvailable = true;
} else {
  try {
    const webrtc = require("react-native-webrtc");
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    MediaStreamCtor = webrtc.MediaStream;
    webrtcAvailable = true;
  } catch {
    // react-native-webrtc not installed
  }
}

const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export interface DesktopPreviewState {
  remoteStream: MediaStream | null;
  error: string | null;
  isSubscribed: boolean;
  isWebRTCAvailable: boolean;
  hasVideoTrack: boolean;
  logs: string[];
}

const APP_PREVIEW_STREAM_TYPE = "app_preview";

export function useDesktopPreview(): DesktopPreviewState {
  const { state, sendRaw, subscribeToMessages } = useWebSocket();
  const isConnected = state === "connected";

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pushLog = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    const formatted = `${stamp} ${line}`;
    console.log(`[RTC_PREVIEW] ${formatted}`);
    setLogs((prev) => [formatted, ...prev].slice(0, 8));
  }, []);

  const cleanupPeer = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    setRemoteStream(null);
    setIsSubscribed(false);
    setHasVideoTrack(false);
    setLogs([]);
  }, []);

  useEffect(() => {
    if (!isConnected) {
      cleanupPeer();
    }
  }, [cleanupPeer, isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    if (!webrtcAvailable) {
      setError("WebRTC indisponivel neste ambiente");
      pushLog("erro: webrtc indisponivel");
      return;
    }

    setError(null);
    cleanupPeer();
    pushLog(`conectado: iniciando assinatura (${APP_PREVIEW_STREAM_TYPE})`);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    pushLog("peer: criado");

    pc.ontrack = (event: any) => {
      const streamFromEvent = event.streams?.[0] ?? null;
      const stream =
        streamFromEvent ??
        (MediaStreamCtor && event.track ? new MediaStreamCtor([event.track]) : null);

      if (stream) {
        setRemoteStream(stream);
        pushLog("track: stream remoto anexado");
      }
      pushLog(
        `track: kind=${String(event.track?.kind)} id=${String(event.track?.id ?? "-")} streams=${String(
          event.streams?.length ?? 0
        )}`
      );
      if (event.track?.kind === "video") {
        setHasVideoTrack(true);
        pushLog(
          `track: video recebida (enabled=${String(event.track?.enabled)} muted=${String(event.track?.muted)} state=${String(event.track?.readyState)})`
        );
        if (event.track) {
          event.track.onmute = () => pushLog("track: video mute");
          event.track.onunmute = () => pushLog("track: video unmute");
          event.track.onended = () => pushLog("track: video ended");
        }
      }
    };

    pc.onicecandidate = (event: any) => {
      if (!event.candidate) return;
      pushLog("ice: candidato local enviado");
      console.log("[RTC_PREVIEW] local_ice", event.candidate);
      sendRaw({
        event: "webrtc_ice_candidate",
        stream_type: APP_PREVIEW_STREAM_TYPE,
        candidate: event.candidate,
      });
    };

    const unsubscribeMessages = subscribeToMessages(async (msg) => {
      if (
        msg.event === "stream_offer" ||
        msg.event === "stream_ice_candidate" ||
        msg.event === "stream_error" ||
        msg.event === "stream_stopped"
      ) {
        console.log("[RTC_PREVIEW] incoming_message", {
          event: msg.event,
          stream_type: msg.stream_type,
          reason: msg.reason,
          has_sdp: typeof msg.sdp === "string",
          sdp_len: typeof msg.sdp === "string" ? msg.sdp.length : 0,
          has_candidate: Boolean(msg.candidate),
        });
      }

      if (!pcRef.current) return;

      if (msg.event === "stream_offer" && msg.stream_type === APP_PREVIEW_STREAM_TYPE && msg.sdp) {
        try {
          pushLog("sinalizacao: offer recebida");
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: "offer", sdp: msg.sdp })
          );
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          sendRaw({
            event: "webrtc_answer",
            stream_type: APP_PREVIEW_STREAM_TYPE,
            sdp: answer.sdp,
          });
          console.log("[RTC_PREVIEW] outgoing_answer", {
            stream_type: APP_PREVIEW_STREAM_TYPE,
            sdp_len: typeof answer.sdp === "string" ? answer.sdp.length : 0,
          });
          pushLog("sinalizacao: answer enviada");
          setIsSubscribed(true);
          setError(null);
        } catch {
          setError("Falha ao negociar preview com desktop");
          pushLog("erro: falha ao processar offer/answer");
        }
      }

      if (
        msg.event === "stream_ice_candidate" &&
        msg.stream_type === APP_PREVIEW_STREAM_TYPE &&
        msg.candidate
      ) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
          pushLog("ice: candidato remoto aplicado");
        } catch {
          // ignore stale candidates
          pushLog("ice: candidato remoto ignorado");
        }
      }

      if (msg.event === "stream_stopped" && msg.stream_type === APP_PREVIEW_STREAM_TYPE) {
        setRemoteStream(null);
        setIsSubscribed(false);
        setHasVideoTrack(false);
        pushLog("stream: interrompido pelo desktop");
      }

      if (msg.event === "stream_error" && msg.stream_type === APP_PREVIEW_STREAM_TYPE) {
        setError(typeof msg.reason === "string" ? msg.reason : "Erro ao receber preview");
        pushLog(`stream_error: ${String(msg.reason ?? "desconhecido")}`);
      }
    });

    sendRaw({ event: "subscribe_stream", stream_type: APP_PREVIEW_STREAM_TYPE });
    console.log("[RTC_PREVIEW] outgoing_subscribe", { stream_type: APP_PREVIEW_STREAM_TYPE });
    pushLog(`sinalizacao: subscribe_stream (${APP_PREVIEW_STREAM_TYPE}) enviado`);

    let zeroStatsStreak = 0;
    const statsTimer = setInterval(async () => {
      if (!pcRef.current) return;
      try {
        const stats = await pcRef.current.getStats();
        let bytes = 0;
        let frames = 0;

        const consume = (report: any) => {
          const isVideoInbound =
            report &&
            report.type === "inbound-rtp" &&
            report.kind === "video";
          if (!isVideoInbound) return;
          bytes += Number(report.bytesReceived ?? 0);
          frames += Number(report.framesDecoded ?? report.framesReceived ?? 0);
        };

        if (typeof stats?.forEach === "function") {
          stats.forEach((report: any) => consume(report));
        } else if (Array.isArray(stats)) {
          stats.forEach((report) => consume(report));
        }

        pushLog(`stats: video bytes=${bytes} frames=${frames}`);
        zeroStatsStreak = bytes === 0 && frames === 0 ? zeroStatsStreak + 1 : 0;

      } catch {
        // ignore stats errors
      }
    }, 3000);

    return () => {
      clearInterval(statsTimer);
      unsubscribeMessages();
      sendRaw({ event: "unsubscribe_stream", stream_type: APP_PREVIEW_STREAM_TYPE });
      console.log("[RTC_PREVIEW] outgoing_unsubscribe", { stream_type: APP_PREVIEW_STREAM_TYPE });
      pushLog(`sinalizacao: unsubscribe_stream (${APP_PREVIEW_STREAM_TYPE}) enviado`);
      cleanupPeer();
    };
  }, [cleanupPeer, isConnected, pushLog, sendRaw, subscribeToMessages]);

  return {
    remoteStream,
    error,
    isSubscribed,
    isWebRTCAvailable: webrtcAvailable,
    hasVideoTrack,
    logs,
  };
}

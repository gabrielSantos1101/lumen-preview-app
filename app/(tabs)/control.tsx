import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useWebSocket } from "@/context/WebSocketContext";
import { formatTime } from "@/utils/remoteSync";
import { useRemoteControlState } from "@/hooks/useRemoteControlState";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import { useDesktopPreview } from "@/hooks/useDesktopPreview";

let RTCView: any = null;
try {
  RTCView = require("react-native-webrtc").RTCView;
} catch {}

function ConnectionBanner() {
  const colors = useColors();
  const { state, serverIp } = useWebSocket();

  if (state === "connected") return null;

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push("/(tabs)/pairing")}
      activeOpacity={0.8}
    >
      <Feather name="alert-circle" size={14} color="#f59e0b" />
      <Text style={[styles.bannerText, { color: "#f59e0b" }]}>
        {state === "idle" ? "NOT CONNECTED — TAP TO PAIR" : "CONNECTING..."}
      </Text>
      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

export default function ControlScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { state } = useWebSocket();
  const permissions = useRemoteControlStore((store) => store.permissions);
  const blockedFeatures = useRemoteControlStore((store) => store.blockedFeatures);
  const remoteSync = useRemoteControlStore((store) => store.remoteSync);
  const sendEvent = useRemoteControlStore((store) => store.sendEvent);
  const isConnected = state === "connected";
  const canPlayer = isConnected && (permissions?.player ?? true);
  const canLyrics = isConnected && (permissions?.lyrics ?? true);
  const canStreaming = isConnected && (permissions?.streaming ?? true);

  const { remoteStream, logs } = useDesktopPreview();

  const [currentSlide, setCurrentSlide] = useState(5);
  const [totalSlides] = useState(24);

  async function haptic(style: "light" | "medium" | "heavy" = "light") {
    if (Platform.OS !== "web") {
      const map = {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
      };
      await Haptics.impactAsync(map[style]);
    }
  }

  function trySend(actionName: string, payload: Parameters<typeof sendEvent>[0]) {
    const result = sendEvent(payload);
    if (!result.ok) {
      const reasonText =
        result.reason === "not_connected"
          ? "Connect to your desktop first."
          : result.reason === "permission_denied" || result.reason?.startsWith("permission_")
          ? `This action is currently blocked by the desktop permissions for ${actionName}.`
          : `Could not send ${actionName}.`;
      Alert.alert("Command Unavailable", reasonText);
    }
    return result.ok;
  }

  const {
    displayMuted,
    displayVolume,
    elapsedTime,
    handleMute,
    handleProgressLayout,
    handleSeekGrant,
    handleSeekMove,
    handleSeekRelease,
    handleSeekTerminate,
    handleVolumeDown,
    handleVolumeUp,
    progressRatio,
  } = useRemoteControlState({
    canPlayer,
    remoteSync,
    sendCommand: trySend,
    haptic,
  });

  const handleNext = async () => {
    if (!trySend("next", { event: "next" })) return;
    if (currentSlide < totalSlides) setCurrentSlide((s) => s + 1);
    await haptic("medium");
  };

  const handlePrev = async () => {
    if (!trySend("previous", { event: "previous" })) return;
    if (currentSlide > 1) setCurrentSlide((s) => s - 1);
    await haptic("light");
  };

  const handlePlayPause = async () => {
    if (!trySend("play/pause", { event: "play_pause" })) return;
    await haptic("light");
  };

  const handleStop = async () => {
    if (!trySend("stop", { event: "stop" })) return;
    await haptic("light");
  };

  const mediaTitle = remoteSync.media.title ?? "NO MEDIA LOADED";
  const mediaType = remoteSync.media.type?.toUpperCase() ?? "IDLE";
  const artist = remoteSync.media.artist ?? "Awaiting desktop sync";
  const durationTime = formatTime(remoteSync.playback.duration);
  const lyricPath = remoteSync.lyric?.url ?? "No lyric active";
  const lyricProgress = remoteSync.lyric
    ? `${remoteSync.lyric.slideIndex + 1}/${Math.max(remoteSync.lyric.totalSlides, 1)}`
    : "0/0";
  const isPlaying = remoteSync.playback.isPlaying;
  const isMuted = displayMuted;
  const volume = displayVolume;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={[styles.presTitle, { color: colors.mutedForeground }]}>QUARTERLY KINETIC STRATEGY</Text>
        </View>
        <View style={styles.topBarRight}>
          <View style={[styles.connDot, { backgroundColor: isConnected ? "#22c55e" : colors.border }]} />
          <Text style={[styles.connLabel, { color: isConnected ? "#22c55e" : colors.mutedForeground }]}>
            {isConnected ? "LIVE" : "OFFLINE"}
          </Text>
        </View>
      </View>

      <ConnectionBanner />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.slidePreview, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.slideThumb, { backgroundColor: "#0a0a1a", borderColor: colors.border }]}>
            {canStreaming && remoteStream && RTCView ? (
              <RTCView
                key={remoteStream.toURL()}
                streamURL={remoteStream.toURL()}
                style={styles.slideVideo}
                objectFit="cover"
                mirror={false}
                zOrder={20}
              />
            ) : (
              <View style={styles.slideContent}>
                <View style={[styles.slideAccentBar, { backgroundColor: colors.primary + "60" }]} />
                <View style={[styles.slideTitle, { backgroundColor: colors.primary + "30" }]} />
                <View style={[styles.slideLine, { backgroundColor: colors.border }]} />
                <View style={[styles.slideLine, { backgroundColor: colors.border, width: "70%" }]} />
                <View style={[styles.slideLine, { backgroundColor: colors.border, width: "55%" }]} />
              </View>
            )}
          </View>
          <View style={styles.slideInfo}>
            <Text style={[styles.slideNum, { color: colors.primary }]}>RTC LOG</Text>
            {(canStreaming ? logs : ["streaming permission disabled"]).map((line, idx) => (
              <Text
                key={`${line}-${idx}`}
                style={[
                  styles.slideSubtitle,
                  {
                    color:
                      line.includes("erro") || line.includes("stream_error")
                        ? "#ef4444"
                        : line.includes("video recebida")
                        ? "#22c55e"
                        : colors.mutedForeground,
                  },
                ]}
                numberOfLines={1}
              >
                {line}
              </Text>
            ))}
            {canStreaming && logs.length === 0 && (
              <Text style={[styles.slideSubtitle, { color: colors.mutedForeground }]}>aguardando eventos...</Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.advanceButton, { backgroundColor: canPlayer ? colors.primary : colors.border }]}
          onPress={handleNext}
          activeOpacity={0.85}
          disabled={!canPlayer}
        >
          <MaterialCommunityIcons name="arrow-right-bold" size={22} color={canPlayer ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[styles.advanceLabel, { color: canPlayer ? colors.primaryForeground : colors.mutedForeground }]}>TAP TO ADVANCE</Text>
        </TouchableOpacity>

        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.ctrlBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: canPlayer ? 1 : 0.4 }]}
            onPress={handlePrev}
            activeOpacity={0.7}
            disabled={!canPlayer}
          >
            <MaterialCommunityIcons name="skip-backward" size={22} color={colors.foreground} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: canPlayer ? 1 : 0.4 }]}
            onPress={handlePlayPause}
            activeOpacity={0.7}
            disabled={!canPlayer}
          >
            <MaterialCommunityIcons
              name={isPlaying ? "pause" : "play"}
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: canPlayer ? 1 : 0.4 }]}
            onPress={handleNext}
            activeOpacity={0.7}
            disabled={!canPlayer}
          >
            <MaterialCommunityIcons name="skip-forward" size={22} color={colors.foreground} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: canPlayer ? 1 : 0.4 }]}
            onPress={handleStop}
            activeOpacity={0.7}
            disabled={!canPlayer}
          >
            <MaterialCommunityIcons name="stop" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.ctrlBtn, { backgroundColor: colors.card, borderColor: isMuted ? colors.primary + "60" : colors.border, flex: 1, opacity: canPlayer ? 1 : 0.4 }]}
            onPress={handleMute}
            activeOpacity={0.7}
            disabled={!canPlayer}
          >
            <MaterialCommunityIcons name={isMuted ? "volume-off" : "volume-high"} size={20} color={isMuted ? colors.primary : colors.foreground} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, { backgroundColor: colors.card, borderColor: colors.border, flex: 1, opacity: canPlayer ? 1 : 0.4 }]}
            onPress={handleVolumeDown}
            activeOpacity={0.7}
            disabled={!canPlayer}
          >
            <MaterialCommunityIcons name="volume-minus" size={20} color={colors.foreground} />
          </TouchableOpacity>

          <View style={[styles.ctrlBtn, { backgroundColor: colors.card, borderColor: colors.border, flex: 2 }]}>
            <Text style={[styles.volumeText, { color: colors.primary }]}>VOL {volume}</Text>
          </View>

          <TouchableOpacity
            style={[styles.ctrlBtn, { backgroundColor: colors.card, borderColor: colors.border, flex: 1, opacity: canPlayer ? 1 : 0.4 }]}
            onPress={handleVolumeUp}
            activeOpacity={0.7}
            disabled={!canPlayer}
          >
            <MaterialCommunityIcons name="volume-plus" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoCardTop}>
              <Feather name="user" size={13} color={colors.primary} />
              <Text style={[styles.infoCardLabel, { color: colors.mutedForeground }]}>LAST ACTION</Text>
            </View>
            <Text style={[styles.infoCardValue, { color: colors.foreground }]}>
              {(remoteSync.lastAction ?? "idle").replace(/_/g, " ").toUpperCase()}
            </Text>
            <View style={[styles.noteDot, { backgroundColor: isPlaying ? "#22c55e" : colors.border }]} />
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoCardTop}>
              <Feather name="clock" size={13} color={colors.primary} />
              <Text style={[styles.infoCardLabel, { color: colors.mutedForeground }]}>ELAPSED</Text>
            </View>
            <Text style={[styles.infoCardValue, { color: colors.foreground }]}>{elapsedTime}</Text>
          </View>
        </View>

        <View style={[styles.permCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.permLabel, { color: colors.mutedForeground }]}>SYNC</Text>
          <View style={styles.infoRow}>
            <View style={[styles.infoCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.infoCardTop}>
                <Feather name="music" size={13} color={colors.primary} />
                <Text style={[styles.infoCardLabel, { color: colors.mutedForeground }]}>MEDIA</Text>
              </View>
              <Text style={[styles.infoCardValue, { color: colors.foreground }]} numberOfLines={1}>
                {artist}
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.infoCardTop}>
                <Feather name="file-text" size={13} color={colors.primary} />
                <Text style={[styles.infoCardLabel, { color: colors.mutedForeground }]}>LYRIC</Text>
              </View>
              <Text style={[styles.infoCardValue, { color: colors.foreground }]} numberOfLines={1}>
                {remoteSync.lyric ? `SLIDE ${lyricProgress}` : "INACTIVE"}
              </Text>
              <View
                style={[
                  styles.noteDot,
                  { backgroundColor: remoteSync.lyric && canLyrics ? "#22c55e" : colors.border },
                ]}
              />
            </View>
          </View>
          <Text style={[styles.pathText, { color: colors.mutedForeground }]} numberOfLines={2}>
            {lyricPath}
          </Text>
          {remoteSync.lyric && (
            <Text style={[styles.pathText, { color: colors.primary }]}>
              ACTIVE LYRIC SLIDE {lyricProgress}
            </Text>
          )}
        </View>

        {isConnected && permissions && (
          <View style={[styles.permCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.permLabel, { color: colors.mutedForeground }]}>PERMISSIONS</Text>
            <View style={styles.permRow}>
              {Object.entries(permissions).map(([key, val]) => (
                <View key={key} style={[styles.permBadge, { borderColor: val ? colors.primary + "40" : colors.border, backgroundColor: val ? colors.primary + "10" : "transparent" }]}>
                  <View style={[styles.permDot, { backgroundColor: val ? colors.primary : colors.border }]} />
                  <Text style={[styles.permText, { color: val ? colors.primary : colors.mutedForeground }]}>
                    {key.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {blockedFeatures.length > 0 && (
          <View style={[styles.permCard, { backgroundColor: colors.card, borderColor: "#ef444440" }]}>
            <Text style={[styles.permLabel, { color: "#ef4444" }]}>BLOCKED ACTIONS</Text>
            <View style={styles.permRow}>
              {blockedFeatures.map((feature) => (
                <View
                  key={feature}
                  style={[
                    styles.permBadge,
                    { borderColor: "#ef444440", backgroundColor: "#ef444410" },
                  ]}
                >
                  <View style={[styles.permDot, { backgroundColor: "#ef4444" }]} />
                  <Text style={[styles.permText, { color: "#ef4444" }]}>
                    {feature.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.mediaPlayer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.mediaTop}>
            <View style={[styles.mediaIcon, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="music-box-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.mediaInfo}>
              <Text style={[styles.mediaTitle, { color: colors.foreground }]} numberOfLines={1}>
                {mediaTitle}
              </Text>
              <Text style={[styles.mediaType, { color: colors.mutedForeground }]}>
                {mediaType} {remoteSync.state.isLoop ? "| LOOP" : ""} {isMuted ? "| MUTED" : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={handlePlayPause} disabled={!canPlayer} activeOpacity={0.7}>
              <MaterialCommunityIcons
                name={isPlaying ? "pause-circle-outline" : "play-circle-outline"}
                size={28}
                color={canPlayer ? colors.primary : colors.border}
              />
            </TouchableOpacity>
          </View>
          <View
            style={styles.progressTouchArea}
            onLayout={handleProgressLayout}
            onStartShouldSetResponder={() => canPlayer}
            onMoveShouldSetResponder={() => canPlayer}
            onResponderGrant={handleSeekGrant}
            onResponderMove={handleSeekMove}
            onResponderRelease={handleSeekRelease}
            onResponderTerminate={handleSeekTerminate}
          >
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${progressRatio * 100}%` as any, backgroundColor: colors.primary }]} />
              <View style={[styles.progressThumb, { left: `${progressRatio * 100}%` as any, backgroundColor: colors.primary }]} />
            </View>
          </View>
          <View style={styles.progressTimes}>
            <Text style={[styles.progressTime, { color: colors.mutedForeground }]}>{elapsedTime}</Text>
            <Text style={[styles.progressTime, { color: colors.mutedForeground }]}>{durationTime}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  presTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 2, maxWidth: 220 },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  connDot: { width: 7, height: 7, borderRadius: 3.5 },
  connLabel: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 9, letterSpacing: 2 },
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 11, letterSpacing: 1.5, flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 30 },
  slidePreview: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginBottom: 14 },
  slideThumb: { height: 180, borderBottomWidth: 1, justifyContent: "center", alignItems: "center" },
  slideVideo: { width: "100%", height: "100%" },
  slideContent: { width: "80%", gap: 8, paddingLeft: 8 },
  slideAccentBar: { width: 3, height: 60, borderRadius: 2, position: "absolute", left: 0, top: -20 },
  slideTitle: { height: 14, borderRadius: 4, width: "75%", marginLeft: 12 },
  slideLine: { height: 7, borderRadius: 3, width: "100%", marginLeft: 12 },
  slideInfo: { padding: 14, gap: 4 },
  slideNum: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 13, letterSpacing: 2 },
  slideSubtitle: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, letterSpacing: 0.5 },
  advanceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 10,
    paddingVertical: 18,
    marginBottom: 12,
  },
  advanceLabel: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 13, letterSpacing: 2 },
  controlRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  ctrlBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeText: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 12, letterSpacing: 1 },
  infoRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  infoCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 14, gap: 6 },
  infoCardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoCardLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 9, letterSpacing: 2 },
  infoCardValue: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13, letterSpacing: 0.5 },
  noteDot: { width: 6, height: 6, borderRadius: 3, position: "absolute", top: 14, right: 14 },
  permCard: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 10, marginBottom: 12 },
  permLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 9, letterSpacing: 2 },
  permRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  permBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  permDot: { width: 5, height: 5, borderRadius: 2.5 },
  permText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 9, letterSpacing: 1.5 },
  mediaPlayer: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
  mediaTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  mediaIcon: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  mediaInfo: { flex: 1 },
  mediaTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12, letterSpacing: 1 },
  mediaType: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  progressTouchArea: { paddingVertical: 8, marginVertical: -8 },
  progressBar: { height: 3, borderRadius: 2, position: "relative" },
  progressFill: { height: 3, borderRadius: 2 },
  progressThumb: { width: 10, height: 10, borderRadius: 5, position: "absolute", top: -3.5, marginLeft: -5 },
  progressTimes: { flexDirection: "row", justifyContent: "space-between" },
  progressTime: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 0.5 },
  pathText: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 0.3, lineHeight: 16 },
});

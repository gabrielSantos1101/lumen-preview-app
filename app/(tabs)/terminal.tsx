import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useWebSocket } from "@/context/WebSocketContext";
import { parseRemotePayload } from "@/utils/remoteCommands";
import { useRemoteControlStore } from "@/stores/remoteControlStore";

const MAX_CHARS = 2048;

interface TransmitLog {
  id: string;
  content: string;
  time: string;
  status: "ok" | "fail";
}

const EVENT_SNIPPETS = [
  { label: "PLAY/PAUSE", content: '{"event":"play_pause"}' },
  { label: "NEXT", content: '{"event":"next"}' },
  { label: "PREVIOUS", content: '{"event":"previous"}' },
  { label: "STOP", content: '{"event":"stop"}' },
  { label: "MUTE", content: '{"event":"mute"}' },
  { label: "VOL 80", content: '{"event":"set_volume","value":80}' },
  { label: "SEEK 0", content: '{"event":"seek","value":0}' },
  { label: "LOOP ON", content: '{"event":"set_loop","value":1}' },
  { label: "METADATA", content: '{"event":"metadata","title":"My Track","artist":"Artist","url":"https://example.com"}' },
  { label: "LOAD URL", content: '{"event":"load_url","url":"https://example.com/audio.mp3","value":0}' },
  { label: "LOAD LYRIC", content: '{"event":"load_lyric","url":"C:/example/test.lrc"}' },
  { label: "PROGRESS", content: '{"event":"progress","value":42,"duration":180}' },
];

type Tab = "terminal" | "history" | "nodes";

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export default function TerminalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { state, serverIp, sessionId } = useWebSocket();
  const permissions = useRemoteControlStore((store) => store.permissions);
  const blockedFeatures = useRemoteControlStore((store) => store.blockedFeatures);
  const remoteSync = useRemoteControlStore((store) => store.remoteSync);
  const sendEvent = useRemoteControlStore((store) => store.sendEvent);
  const canSendEvent = useRemoteControlStore((store) => store.canSendEvent);
  const isConnected = state === "connected";

  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("terminal");
  const [showSnippets, setShowSnippets] = useState(false);
  const [log, setLog] = useState<TransmitLog[]>([]);
  const [transmitted, setTransmitted] = useState(false);

  const handleTransmit = async () => {
    if (!message.trim()) return;

    let payload: unknown;
    try {
      payload = JSON.parse(message.trim());
    } catch {
      Alert.alert("Invalid JSON", "The message must be valid JSON.\n\nExample:\n{\"event\":\"play_pause\"}");
      return;
    }

    const parsedPayload = parseRemotePayload(payload);
    if (!parsedPayload) {
      Alert.alert(
        "Invalid Event",
        "Use one of the supported remote-control events and include the required fields."
      );
      return;
    }

    const result = sendEvent(parsedPayload);

    const entry: TransmitLog = {
      id: `${Date.now()}`,
      content: message.trim(),
      time: nowTime(),
      status: result.ok ? "ok" : "fail",
    };
    setLog((prev) => [entry, ...prev]);

    if (result.ok) {
      setTransmitted(true);
      if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => setTransmitted(false), 800);
    } else {
      const description =
        result.reason === "not_connected"
          ? "Connect to your desktop first in the Pairing tab."
          : result.reason === "permission_denied" || result.reason?.startsWith("permission_")
          ? "This event is blocked by the current desktop permissions."
          : "The event could not be sent over the WebSocket.";
      Alert.alert("Command Failed", description);
    }
  };

  const handleClear = () => setMessage("");

  const handleCopyLast = () => {
    if (log.length > 0) setMessage(log[0].content);
  };

  const handleSnippet = (content: string) => {
    setMessage(content);
    setShowSnippets(false);
  };

  const handleResend = (content: string) => {
    setMessage(content);
    setActiveTab("terminal");
  };

  const charCount = message.length;
  const tabs: Tab[] = ["terminal", "history", "nodes"];

  const statusLabel =
    state === "connected"
      ? "CONNECTED"
      : state === "connecting" || state === "authenticating" || state === "registering"
      ? "CONNECTING..."
      : "DISCONNECTED";

  const statusColor =
    state === "connected" ? "#22c55e" : state === "idle" ? "#ef4444" : "#f59e0b";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={[styles.headerLabel, { color: colors.mutedForeground }]}>LUMEN</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>AETHER TERMINAL</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/(tabs)/pairing")} activeOpacity={0.7}>
          <View style={styles.statusIndicator}>
            <View style={[styles.glowDot, { backgroundColor: statusColor }]} />
            <View>
              <Text style={[styles.statusTop, { color: colors.foreground }]}>
                {serverIp ? `${serverIp}:8080` : "DESKTOP-WEBSOCKET"}
              </Text>
              <Text style={[styles.statusBottom, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, { borderBottomWidth: activeTab === tab ? 2 : 0, borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "terminal" && (
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          bottomOffset={20}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.inputContainer, { backgroundColor: "#000000", borderColor: isConnected ? colors.border : "#ef444440" }]}>
            <TextInput
              style={[styles.textInput, { color: isConnected ? colors.primary : colors.mutedForeground, fontFamily: "SpaceGrotesk_400Regular" }]}
              value={message}
              onChangeText={(t) => setMessage(t.slice(0, MAX_CHARS))}
              placeholder='{"event":"play_pause"}'
              placeholderTextColor={colors.border}
              multiline
              maxLength={MAX_CHARS}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.charCountRow}>
              <View style={[styles.cursorBlink, { backgroundColor: isConnected ? colors.primary : colors.mutedForeground }]} />
              <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
                {charCount}/{MAX_CHARS}
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            {[
              { label: "CLEAR", onPress: handleClear, icon: "close" },
              { label: "COPY LAST", onPress: handleCopyLast, icon: "content-copy" },
              { label: "SNIPPETS", onPress: () => setShowSnippets((s) => !s), icon: "code-tags" },
            ].map(({ label, onPress, icon }) => (
              <TouchableOpacity
                key={label}
                style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: showSnippets && label === "SNIPPETS" ? colors.primary + "60" : colors.border }]}
                onPress={onPress}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name={icon as any} size={14} color={colors.mutedForeground} />
                <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {showSnippets && (
            <View style={[styles.snippetsPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.snippetsLabel, { color: colors.mutedForeground }]}>EVENT LIBRARY</Text>
              <View style={styles.snippetsGrid}>
                {EVENT_SNIPPETS.map((snip) => (
                  <TouchableOpacity
                    key={snip.label}
                    style={[styles.snippetChip, { borderColor: colors.border, backgroundColor: colors.secondary }]}
                    onPress={() => handleSnippet(snip.content)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.snippetChipText, { color: colors.primary }]}>{snip.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.transmitButton,
              {
                backgroundColor: transmitted ? "#22c55e" : isConnected ? colors.primary : colors.border,
                opacity: message.trim().length === 0 ? 0.4 : 1,
              },
            ]}
            onPress={handleTransmit}
            activeOpacity={0.85}
            disabled={message.trim().length === 0}
          >
            <MaterialCommunityIcons
              name={transmitted ? "check" : "send"}
              size={18}
              color={transmitted ? "#fff" : isConnected ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text style={[styles.transmitText, { color: transmitted ? "#fff" : isConnected ? colors.primaryForeground : colors.mutedForeground }]}>
              {transmitted ? "TRANSMITTED" : isConnected ? "TRANSMIT SEQUENCE" : "NOT CONNECTED"}
            </Text>
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      )}

      {activeTab === "history" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TRANSMISSION LOG ({log.length})</Text>
          {log.length === 0 && (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <MaterialCommunityIcons name="history" size={28} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>NO TRANSMISSIONS YET</Text>
            </View>
          )}
          {log.map((item) => (
            <View key={item.id} style={[styles.historyItem, { backgroundColor: colors.card, borderColor: item.status === "ok" ? colors.border : "#ef444440" }]}>
              <View style={styles.historyLeft}>
                <MaterialCommunityIcons
                  name={item.status === "ok" ? "check-circle-outline" : "alert-circle-outline"}
                  size={16}
                  color={item.status === "ok" ? "#22c55e" : "#ef4444"}
                />
              </View>
              <View style={styles.historyContent}>
                <Text style={[styles.historyCmd, { color: colors.primary }]} numberOfLines={2}>{item.content}</Text>
                <Text style={[styles.historyTime, { color: colors.mutedForeground }]}>{item.time} — {item.status === "ok" ? "SENT" : "FAILED"}</Text>
              </View>
              <TouchableOpacity onPress={() => handleResend(item.content)} activeOpacity={0.7}>
                <MaterialCommunityIcons name="replay" size={18} color={colors.border} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === "nodes" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SESSION INFO</Text>
          {[
            ["SERVER", serverIp ? `${serverIp}:8080` : "—"],
            ["SESSION", sessionId ? sessionId.slice(0, 24).toUpperCase() : "—"],
            ["STATE", state.toUpperCase()],
            ["PLAYER", permissions?.player ? "GRANTED" : "—"],
            ["LYRICS", permissions?.lyrics ? "GRANTED" : "—"],
            ["BIBLE", permissions?.bible ? "GRANTED" : "—"],
            ["MEDIA", permissions?.media ? "GRANTED" : "—"],
            ["PLAY/PAUSE", canSendEvent("play_pause") ? "READY" : "BLOCKED"],
            ["LOAD_LYRIC", canSendEvent("load_lyric") ? "READY" : "BLOCKED"],
            ["BLOCKED", blockedFeatures.length > 0 ? blockedFeatures.join(", ") : "—"],
            ["NOW PLAYING", remoteSync.media.title ?? "—"],
            ["POSITION", `${remoteSync.playback.position.toFixed(1)} / ${remoteSync.playback.duration.toFixed(1)}`],
            ["PLAYING", remoteSync.playback.isPlaying ? "YES" : "NO"],
            ["VOLUME", `${remoteSync.state.volume}${remoteSync.state.isMuted ? " (MUTED)" : ""}`],
            ["LOOP", remoteSync.state.isLoop ? "ON" : "OFF"],
            ["ACTION", remoteSync.lastAction ?? "—"],
            ["LYRIC", remoteSync.lyric?.url ?? "—"],
            ["LYRIC ACTIVE", remoteSync.lyric?.active ? "YES" : "NO"],
            [
              "LYRIC SLIDE",
              remoteSync.lyric
                ? `${remoteSync.lyric.slideIndex + 1}/${Math.max(remoteSync.lyric.totalSlides, 1)}`
                : "—",
            ],
          ].map(([k, v]) => (
            <View key={k} style={[styles.nodeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.nodeKey, { color: colors.mutedForeground }]}>{k}</Text>
              <Text style={[styles.nodeVal, { color: colors.foreground }]}>{v}</Text>
            </View>
          ))}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>CLOSE CODES</Text>
          {[
            ["4001", "Unauthorized or remote disabled"],
            ["4003", "Device removed by admin"],
            ["4004", "Signature verification failed"],
            ["4005", "Device disabled by admin"],
          ].map(([code, desc]) => (
            <View key={code} style={[styles.nodeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.nodeKey, { color: "#ef4444" }]}>{code}</Text>
              <Text style={[styles.nodeVal, { color: colors.mutedForeground }]}>{desc}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 3, marginBottom: 2 },
  headerTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, letterSpacing: 1.5 },
  statusIndicator: { flexDirection: "row", alignItems: "center", gap: 8 },
  glowDot: { width: 8, height: 8, borderRadius: 4 },
  statusTop: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 1 },
  statusBottom: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 9, letterSpacing: 2 },
  tabRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 16, borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 30 },
  inputContainer: { borderWidth: 1, borderRadius: 10, padding: 14, height: 320, marginBottom: 12 },
  textInput: { flex: 1, fontSize: 13, letterSpacing: 0.5, lineHeight: 22, textAlignVertical: "top" },
  charCountRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 8 },
  cursorBlink: { width: 2, height: 14, borderRadius: 1 },
  charCount: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 1 },
  actionRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 9, letterSpacing: 1.5 },
  snippetsPanel: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 12 },
  snippetsLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 2, marginBottom: 10 },
  snippetsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  snippetChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, borderWidth: 1 },
  snippetChipText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 1 },
  transmitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 10,
    paddingVertical: 18,
    marginBottom: 14,
  },
  transmitText: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 13, letterSpacing: 2 },
  sectionLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 2, marginBottom: 12 },
  emptyState: { borderWidth: 1, borderRadius: 10, padding: 30, alignItems: "center", gap: 10, borderStyle: "dashed" },
  emptyText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 11, letterSpacing: 2 },
  historyItem: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8, gap: 12 },
  historyLeft: {},
  historyContent: { flex: 1 },
  historyCmd: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, letterSpacing: 0.5 },
  historyTime: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 0.5, marginTop: 3 },
  nodeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8 },
  nodeKey: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 2 },
  nodeVal: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, letterSpacing: 0.3, textAlign: "right", flex: 1, marginLeft: 12 },
});

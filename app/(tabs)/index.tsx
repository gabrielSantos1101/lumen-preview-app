import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { useColors } from "@/hooks/useColors";

const presentations = [
  { id: "1", title: "Quarterly Kinetic Strategy", slides: 24, lastUsed: "Today" },
  { id: "2", title: "Product Vision 2026", slides: 18, lastUsed: "Yesterday" },
  { id: "3", title: "Design System Overview", slides: 32, lastUsed: "3 days ago" },
  { id: "4", title: "Engineering Roadmap Q2", slides: 15, lastUsed: "Last week" },
  { id: "5", title: "Investor Pitch Deck", slides: 28, lastUsed: "2 weeks ago" },
];

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <View>
          <Text style={[styles.headerLabel, { color: colors.mutedForeground }]}>LUMEN</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>LIBRARY</Text>
        </View>
        <TouchableOpacity style={[styles.addButton, { borderColor: colors.border }]}>
          <Feather name="plus" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RECENT PRESENTATIONS</Text>

        {presentations.map((pres) => (
          <TouchableOpacity
            key={pres.id}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/(tabs)/control")}
            activeOpacity={0.7}
          >
            <View style={[styles.cardThumb, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="presentation" size={28} color={colors.mutedForeground} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{pres.title}</Text>
              <View style={styles.cardMeta}>
                <Text style={[styles.cardSlides, { color: colors.mutedForeground }]}>
                  {pres.slides} SLIDES
                </Text>
                <View style={[styles.dot, { backgroundColor: colors.border }]} />
                <Text style={[styles.cardSlides, { color: colors.mutedForeground }]}>
                  {pres.lastUsed.toUpperCase()}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.border} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 26,
    letterSpacing: 2,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 12,
    marginTop: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  cardThumb: {
    width: 56,
    height: 42,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardSlides: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    letterSpacing: 1,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});

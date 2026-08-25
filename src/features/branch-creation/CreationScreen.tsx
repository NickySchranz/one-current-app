import { useEffect, useMemo, useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore } from "@/stores/app-store";
import { buildTimelineLayout } from "@/visualization/main-line/layout";
import { weekWindow } from "@/visualization/zoom/time-scale";
import { BranchLine } from "@/features/life-timeline/BranchLine";
import { Mascot } from "@/features/life-timeline/Mascot";
import { useMascot } from "@/features/life-timeline/useMascot";
import { CreateBranch } from "./CreateBranch";
import { InTrayContext, Tag } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { alpha } from "@/ui/color";
import { useKeyboard } from "@/ui/keyboard";
import { useT } from "@/i18n/i18n";

/**
 * Creating a thread happens on a screen of its own: a bare stage — no map,
 * no dates, no other lines — where the new timeline takes shape as the
 * questions are answered. Naming writes its label, "since when" stretches it
 * back, feelings gather under it, loudness thickens it. Pip stands at its
 * end the whole time. Finishing closes this screen; the line then draws
 * itself into the real map.
 */
export function CreationScreen() {
  const branches = useAppStore((s) => s.branches);
  const draftBranchId = useAppStore((s) => s.draftBranchId);
  const nowTick = useAppStore((s) => s.nowTick);
  const theme = useAppStore((s) => s.theme);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const mascotTypePref = useAppStore((s) => s.mascotType);
  const language = useAppStore((s) => s.language);
  const t = useT();
  const tk = useTheme();
  const insets = useSafeAreaInsets();
  const { inset: kbInset, open: kbOpen, offsetTop } = useKeyboard();
  // On web winH is the visual viewport — already minus the keyboard.
  const { height: winH } = useWindowDimensions();
  const [size, setSize] = useState({ width: 390, height: 320 });

  const draft = branches.find((b) => b.id === draftBranchId);
  const drafts = useMemo(() => (draft ? [draft] : []), [draft]);
  const now = useMemo(() => new Date(nowTick), [nowTick]);
  // This stage keeps its own week around Now — however far the map is panned,
  // the map's window is never touched by (or for) the creation.
  const window_ = useMemo(() => weekWindow(now), [now]);
  const layout = useMemo(
    () =>
      buildTimelineLayout(drafts, {
        width: size.width,
        height: size.height,
        window: window_,
        compact: size.width < 640,
        now,
        mainShift: 0,
        pinnedBranchIds: draft ? [draft.id] : [],
      }),
    [drafts, size, window_, now, draft],
  );
  const g = layout.geometries[0];

  // The line draws itself in when the stage opens, then settles.
  const [justBorn, setJustBorn] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setJustBorn(false), reducedMotion ? 0 : 1700);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  // Pip lives on this stage too: held to the draft, so he stays at its end,
  // tracking it as the answers reshape the line.
  const showMascot = !reducedMotion;
  const mascot = useMascot(
    drafts,
    layout.geometries,
    layout.nowX,
    () => {},
    mascotTypePref,
    false,
    false,
    language,
    draft?.id ?? null,
    null,
  );

  const noop = () => {};

  // The tray isn't mounted on this screen, so Escape lives here: it leaves a
  // focused field first, and only then cancels the creation (web only).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) {
        el.blur();
        return;
      }
      const store = useAppStore.getState();
      store.cancelDraftBranch();
      store.setOperation({ kind: "idle" });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <View
      style={{
        // Pinned to the VISIBLE screen: on web the container starts where the
        // visual viewport starts and is exactly as tall as it (winH tracks
        // it), so stage + questions always fit above the keyboard. Native
        // iOS overlays instead — there the keyboard inset trims the bottom.
        position: "absolute",
        left: 0,
        right: 0,
        ...(Platform.OS === "web"
          ? { top: offsetTop, height: winH }
          : { top: 0, bottom: kbInset }),
        zIndex: 50,
        backgroundColor: tk.bg,
        paddingTop: kbOpen ? 0 : insets.top,
      }}
    >
      <View
        style={{ flex: 1, minHeight: 0 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize({ width: Math.max(320, width), height: Math.max(200, height) });
        }}
      >
        {draft && g && (
          <>
            <Svg width={size.width} height={size.height} accessibilityLabel={t("The new thread taking shape")}>
              {/* the one current, on its own: the spine the new line stems from */}
              <Path
                d={`M 0 ${layout.mainY} L ${layout.nowX} ${layout.mainY}`}
                stroke={tk.lineMain}
                strokeWidth={3.25}
                fill="none"
              />
              <Path
                d={`M ${layout.nowX - 12} ${layout.mainY - 6} L ${layout.nowX} ${layout.mainY} L ${layout.nowX - 12} ${layout.mainY + 6}`}
                stroke={tk.lineMain}
                strokeWidth={3.25}
                fill="none"
              />
              {size.width - layout.nowX > 4 && (
                <Path
                  d={`M ${layout.nowX} ${layout.mainY} L ${size.width} ${layout.mainY}`}
                  stroke={tk.lineMain}
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray={[2, 6]}
                  opacity={0.4}
                />
              )}
              <SvgText
                x={layout.nowX - 8}
                y={layout.mainY - 12}
                textAnchor="end"
                fontSize={12.8}
                fontWeight="600"
                fontFamily={tk.fontBody}
                fill={tk.ink}
              >
                {t("Now")}
              </SvgText>
              <BranchLine
                branch={draft}
                geometry={g}
                theme={theme}
                nowMs={nowTick}
                focused={false}
                highlighted
                born={!reducedMotion && justBorn}
                reducedMotion={reducedMotion}
                onSelect={noop}
                onSelectMoment={noop}
                onSelectMergePoint={noop}
              />
              {showMascot && mascot.visible && (
                <Mascot
                  posX={mascot.posX}
                  posY={mascot.posY}
                  frame={mascot.frame}
                  flip={mascot.flip}
                  mascotType={mascot.mascotType}
                  // He watches the line take shape, quietly — no speech here.
                  bubbleText=""
                  showTapHint={false}
                  theme={tk}
                  onPress={noop}
                />
              )}
            </Svg>
            {/* what it holds gathers beneath the line as feelings are chosen */}
            {(draft.anxieties?.length ?? 0) > 0 && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: Math.max(12, g.forkVisible ? g.forkX : 12),
                  top: Math.min(size.height - 40, g.laneY + 16),
                  right: 12,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 4.8,
                }}
              >
                {(draft.anxieties ?? []).map((f) => (
                  <Tag key={f} label={t(f)} quality />
                ))}
              </View>
            )}
          </>
        )}
      </View>
      {/* the four questions, flush to the container's bottom — which is the
          keyboard's top edge while typing */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: alpha(tk.lineAxis, 0.55),
          backgroundColor: tk.bgRaised,
          paddingTop: 10,
          paddingHorizontal: 16,
          paddingBottom: 13.6 + (kbOpen ? 0 : insets.bottom),
        }}
      >
        <InTrayContext.Provider value={true}>
          <CreateBranch />
        </InTrayContext.Provider>
      </View>
    </View>
  );
}

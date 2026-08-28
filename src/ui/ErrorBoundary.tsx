/**
 * A crash anywhere in the tree must not take the whole app down silently.
 * Deliberately styled with plain components and fixed colors: if theming or
 * the store is what broke, this screen still renders.
 */
import { Component, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[app]", error);
  }

  render() {
    if (this.state.error == null) return this.props.children;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#faf9f6",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View style={{ maxWidth: 420, gap: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: "#2b2a26" }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: "#6b6960" }}>
            The app hit an error it could not recover from. Your threads are safe on this
            device — reloading brings everything back.
          </Text>
          <Text style={{ fontSize: 12, color: "#a09d92" }}>{this.state.error.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (typeof window !== "undefined") window.location.reload();
              else this.setState({ error: null });
            }}
            style={{
              alignSelf: "flex-start",
              borderWidth: 1,
              borderColor: "#c9c5b8",
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 14,
              backgroundColor: "#ffffff",
            }}
          >
            <Text style={{ fontSize: 14, color: "#2b2a26" }}>Reload</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

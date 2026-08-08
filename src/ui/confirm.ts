import { Alert, Platform } from "react-native";

/** Cross-platform confirm dialog: window.confirm on web, Alert on native. */
export function confirmAsync(title: string, message?: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(
      typeof window !== "undefined" &&
        window.confirm(message ? `${title}\n\n${message}` : title),
    );
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ]);
  });
}

/** Cross-platform notice: window.alert on web, Alert on native. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

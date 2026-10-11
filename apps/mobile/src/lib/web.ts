import * as WebBrowser from "expo-web-browser";
import { API_URL } from "./api";

/** Opens a page of the web app (for tools that aren't in the mobile app yet). */
export function openWeb(path: string) {
  return WebBrowser.openBrowserAsync(`${API_URL}${path}`);
}

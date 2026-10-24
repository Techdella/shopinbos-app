import { Redirect } from "expo-router";

// Partner messages live in Chats now, under the Partners filter (links to /partners still land there).
export default function Partners() {
  return <Redirect href={{ pathname: "/chats", params: { filter: "partners" } }} />;
}

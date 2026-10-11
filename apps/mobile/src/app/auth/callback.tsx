import { Redirect } from "expo-router";

// Landing route for shopinbos://auth/callback. The Google sign-in code is exchanged in lib/auth.ts;
// this only keeps the deep link from showing a "page not found" screen.
export default function AuthCallback() {
  return <Redirect href="/" />;
}

import { Linking, Platform, Pressable, View } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import MapView, { Marker, Polyline } from "react-native-maps";
import { MapBox, MapPin, mapUrl } from "@/components/RiderKit";
import { regionFor } from "@/lib/rider-pure";
import { colors } from "@/theme";
import type { RiderMapProps } from "./RiderMap";

export type { RiderMapProps } from "./RiderMap";

// The Riders app map on phones (react-native-maps): Apple Maps on iOS, Google Maps on Android. It's a picture, not
// something to pan: it shows the rider's own spot (read on this phone), the pickup (orange) and the drop-off
// (teal) with a dashed line between them; tapping it opens the address in the phone's maps app.
//
// Android needs a Google Maps key in the build (GOOGLE_MAPS_ANDROID_API_KEY, see app.config.js, which sets
// extra.mapsAvailable). Without one a Google map would crash, so we draw the plain map panel instead. Expo Go
// carries its own key, and iOS needs none.

const extra = Constants.expoConfig?.extra as { mapsAvailable?: boolean } | undefined;

export const mapsAvailable =
  Platform.OS === "ios" || Constants.executionEnvironment === ExecutionEnvironment.StoreClient || extra?.mapsAvailable === true;

export function RiderMap({ me, pickup, drop, height = 150, label, address, children }: RiderMapProps) {
  const region = regionFor([me, pickup, drop]);
  if (!mapsAvailable || !region) return <MapBox height={height} label={label} address={address}>{children}</MapBox>;

  return (
    <View style={{ height, borderRadius: 22, overflow: "hidden", backgroundColor: "#E9EEE8", borderWidth: 1, borderColor: colors.line }}>
      <Pressable
        accessibilityRole={address ? "link" : "image"}
        accessibilityLabel={label}
        disabled={!address}
        onPress={() => { if (address) void Linking.openURL(mapUrl(address)); }}
        style={{ flex: 1 }}
      >
        {/* Touches go to the Pressable (and the screen's scrolling), not the map. */}
        <View pointerEvents="none" style={{ flex: 1 }}>
          <MapView
            style={{ flex: 1 }}
            region={region}
            liteMode={Platform.OS === "android"}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            showsCompass={false}
            showsPointsOfInterests={false}
            showsMyLocationButton={false}
            moveOnMarkerPress={false}
          >
            {pickup && drop ? (
              <Polyline coordinates={[toLatLng(pickup), toLatLng(drop)]} strokeColor={colors.forest} strokeWidth={4} lineDashPattern={[4, 10]} lineCap="round" />
            ) : null}
            {pickup ? <Marker coordinate={toLatLng(pickup)} anchor={{ x: 0.5, y: 0.5 }}><MapPin kind="pickup" /></Marker> : null}
            {drop ? <Marker coordinate={toLatLng(drop)} anchor={{ x: 0.5, y: 0.5 }}><MapPin kind="drop" /></Marker> : null}
            {me ? <Marker coordinate={toLatLng(me)} anchor={{ x: 0.5, y: 0.5 }}><MapPin kind="me" /></Marker> : null}
          </MapView>
        </View>
      </Pressable>
      {children}
    </View>
  );
}

function toLatLng(point: { lat: number; lng: number }) {
  return { latitude: point.lat, longitude: point.lng };
}

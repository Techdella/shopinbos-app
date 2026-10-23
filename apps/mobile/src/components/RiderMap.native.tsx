import { Linking, Pressable, View } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { MapBox, MapPin, mapUrl } from "@/components/RiderKit";
import { T } from "@/components/ui";
import { regionFor, type MapPoint } from "@/lib/rider-pure";
import { colors } from "@/theme";
import type { RiderMapProps } from "./RiderMap";

export type { RiderMapProps } from "./RiderMap";

// The Riders app map on phones: MapLibre (open source) drawing OpenStreetMap data, on iOS and Android alike, so there
// is no Google Maps key or bill. It's a picture, not something to pan: it shows the rider's own spot (read on this
// phone), the pickup (orange) and the drop-off (teal) with a dashed line between them; tapping it opens the address
// in the phone's own maps app for directions.
//
// Map tiles come from OpenFreeMap (free, no key, no usage limits); EXPO_PUBLIC_MAP_STYLE_URL swaps in another
// MapLibre style (MapTiler, Stadia…). Expo Go has no MapLibre inside it, so there we draw the plain map panel.

const STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim() || "https://tiles.openfreemap.org/styles/liberty";

export const mapsAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// Loaded only where it's compiled in, so Expo Go never touches the missing native module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MapLibre: typeof import("@maplibre/maplibre-react-native") | null = mapsAvailable ? require("@maplibre/maplibre-react-native") : null;

export function RiderMap({ me, pickup, drop, height = 150, label, address, children }: RiderMapProps) {
  const region = regionFor([me, pickup, drop]);
  if (!MapLibre || !region) return <MapBox height={height} label={label} address={address}>{children}</MapBox>;
  const { Camera, GeoJSONSource, Layer, Map, Marker } = MapLibre;
  const bounds: [number, number, number, number] = [
    region.longitude - region.longitudeDelta / 2,
    region.latitude - region.latitudeDelta / 2,
    region.longitude + region.longitudeDelta / 2,
    region.latitude + region.latitudeDelta / 2,
  ];

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
          <Map
            style={{ flex: 1 }}
            mapStyle={STYLE_URL}
            dragPan={false}
            touchZoom={false}
            doubleTapZoom={false}
            doubleTapHoldZoom={false}
            touchRotate={false}
            touchPitch={false}
            compass={false}
            scaleBar={false}
            logo={false}
            attribution={false}
          >
            <Camera bounds={bounds} duration={0} />
            {pickup && drop ? (
              <GeoJSONSource id="route" data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [toLngLat(pickup), toLngLat(drop)] } }}>
                <Layer type="line" id="route-line" layout={{ "line-cap": "round" }} paint={{ "line-color": colors.forest, "line-width": 4, "line-dasharray": [1, 2.5] }} />
              </GeoJSONSource>
            ) : null}
            {pickup ? <Marker id="pickup" lngLat={toLngLat(pickup)} anchor="center"><MapPin kind="pickup" /></Marker> : null}
            {drop ? <Marker id="drop" lngLat={toLngLat(drop)} anchor="center"><MapPin kind="drop" /></Marker> : null}
            {me ? <Marker id="me" lngLat={toLngLat(me)} anchor="center"><MapPin kind="me" /></Marker> : null}
          </Map>
          {/* OpenStreetMap's licence asks for this credit on every map. */}
          <T style={{ position: "absolute", right: 8, bottom: 4, fontSize: 9, color: colors.inkSoft, backgroundColor: "rgba(255,255,255,0.7)", paddingHorizontal: 4, borderRadius: 4 }}>© OpenStreetMap · OpenFreeMap</T>
        </View>
      </Pressable>
      {children}
    </View>
  );
}

function toLngLat(point: MapPoint): [number, number] {
  return [point.lng, point.lat];
}

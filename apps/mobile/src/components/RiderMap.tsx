import type { ReactNode } from "react";
import type { MapPoint } from "@/lib/rider-pure";
import { MapBox } from "@/components/RiderKit";

// The Riders app map. This file is the fallback (web, where react-native-maps doesn't run): the plain map panel.
// Phones use RiderMap.native.tsx, with the same props.

export interface RiderMapProps {
  /** The rider's own spot, from this phone (never from the server, never shown to anyone else). */
  me?: MapPoint | null;
  pickup?: MapPoint | null;
  drop?: MapPoint | null;
  height?: number;
  label: string;
  /** Tapping the map opens this address in the phone's maps. */
  address?: string | null;
  /** On top of the map (the online switch on Today). */
  children?: ReactNode;
}

export function RiderMap({ height = 150, label, address, children }: RiderMapProps) {
  return <MapBox height={height} label={label} address={address}>{children}</MapBox>;
}

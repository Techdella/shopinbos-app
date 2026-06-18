import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const iconData = await readFile(
    join(process.cwd(), "public/brand/logos/shopping boss white icon.png"),
  );
  const src = `data:image/png;base64,${iconData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#0E2A38",
          borderRadius: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={src} width={22} height={24} style={{ objectFit: "contain" }} />
      </div>
    ),
    { ...size },
  );
}

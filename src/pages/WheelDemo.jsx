import React, { useState } from "react";
import { colors, bodyFont } from "../theme";
import PickerWheel from "../components/PickerWheel";
import { PLATFORMS } from "../data/platforms";


export default function WheelDemo() {
  const [active, setActive] = useState(0);

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont }}>
      <PickerWheel
        items={PLATFORMS}
        itemHeight={104}
        onActiveChange={setActive}
        style={{ height: "100vh" }}
      />

      <div
        style={{
          position: "fixed",
          left: 28,
          bottom: 24,
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: colors.textMuted,
        }}
      >
        PickerWheel demo · on {PLATFORMS[active]}
      </div>
    </div>
  );
}

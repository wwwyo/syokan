import { loadFont } from "@remotion/google-fonts/Cormorant";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { installCommand, repoUrl } from "../fixture";
import { color, font, logoPaths } from "../theme";

const { fontFamily: cormorant } = loadFont("normal", { weights: ["600"] });

const drawEase = Easing.bezier(0.16, 1, 0.3, 1);
// Slight overshoot so the spark "pops" like the product's syokan-pop keyframe
const popEase = Easing.bezier(0.34, 1.56, 0.64, 1);

/** Fade + rise used by every text block below the logo. */
const rise = (frame: number, from: number) => ({
  opacity: interpolate(frame, [from, from + 13], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: drawEase,
  }),
  translate: `0px ${interpolate(frame, [from, from + 13], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: drawEase,
  })}px`,
});

export const EndCard = () => {
  const frame = useCurrentFrame();

  // Scene starts overlapped on the browser scene, so the fill must be opaque
  const backgroundOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Remotion port of styles.css @keyframes syokan-summon (0.9s ease-out trace)
  const braceDashoffset = interpolate(frame, [12, 39], [100, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: drawEase,
  });

  // Port of syokan-pop (0.45s, delayed until the braces are mostly drawn)
  const sparkScale = interpolate(frame, [33, 47], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: popEase,
  });
  const sparkOpacity = interpolate(frame, [33, 47], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const wordmark = rise(frame, 45);
  const tagline = rise(frame, 58);
  const install = rise(frame, 72);
  const repo = rise(frame, 84);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color.background,
        opacity: backgroundOpacity,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width={170}
          height={170}
          fill="none"
          stroke={color.foreground}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d={logoPaths.braceLeft}
            style={{ strokeDasharray: 100, strokeDashoffset: braceDashoffset }}
          />
          <path
            d={logoPaths.braceRight}
            style={{ strokeDasharray: 100, strokeDashoffset: braceDashoffset }}
          />
          <path
            d={logoPaths.spark}
            fill={color.foreground}
            stroke="none"
            style={{
              scale: String(sparkScale),
              opacity: sparkOpacity,
              // fill-box + center guarantees the pop originates at the spark's middle
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
          />
        </svg>
        <div
          style={{
            fontFamily: cormorant,
            fontWeight: 600,
            fontSize: 96,
            lineHeight: 1,
            color: color.foreground,
            opacity: wordmark.opacity,
            translate: wordmark.translate,
          }}
        >
          syokan
        </div>
        <div
          style={{
            fontFamily: font.sans,
            fontSize: 34,
            color: color.mutedForeground,
            opacity: tagline.opacity,
            translate: tagline.translate,
          }}
        >
          LLMs summon rich UI.
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 30,
            color: color.foreground,
            backgroundColor: color.secondary,
            borderRadius: 10,
            padding: "16px 28px",
            opacity: install.opacity,
            translate: install.translate,
          }}
        >
          <span style={{ color: color.mutedForeground }}>$ </span>
          {installCommand}
        </div>
        <div
          style={{
            fontFamily: font.sans,
            fontSize: 26,
            color: color.mutedForeground,
            opacity: repo.opacity,
            translate: repo.translate,
          }}
        >
          {repoUrl}
        </div>
      </div>
    </AbsoluteFill>
  );
};

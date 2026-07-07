import { AbsoluteFill, Sequence } from "remotion";
import { BrowserScene } from "./scenes/BrowserScene";
import { EndCard } from "./scenes/EndCard";
import { TerminalScene } from "./scenes/TerminalScene";
import { color, FPS, timeline } from "./theme";

export const DEMO_FPS = FPS;
export const DEMO_DURATION_IN_FRAMES = timeline.total;

/** Scenes overlap slightly; each later scene fades itself in over the previous one. */
export const Demo = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: color.background }}>
      <Sequence from={timeline.terminal.from} durationInFrames={timeline.terminal.duration}>
        <TerminalScene />
      </Sequence>
      <Sequence from={timeline.browser.from} durationInFrames={timeline.browser.duration}>
        <BrowserScene />
      </Sequence>
      <Sequence from={timeline.endCard.from} durationInFrames={timeline.endCard.duration}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};

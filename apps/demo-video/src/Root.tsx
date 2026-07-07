import { Composition } from "remotion";
import { Demo, DEMO_DURATION_IN_FRAMES, DEMO_FPS } from "./Demo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="Demo"
      component={Demo}
      durationInFrames={DEMO_DURATION_IN_FRAMES}
      fps={DEMO_FPS}
      width={1920}
      height={1080}
    />
  );
};

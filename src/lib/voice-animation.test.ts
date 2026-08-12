import { describe, expect, it } from "vitest";
import {
  LISTENING_PERIOD_MS,
  TALKING_PERIOD_MS,
  getListeningVoiceSignal,
  getTalkingVoiceSignal,
} from "./AgentEmblem";

describe("voice animation signals", () => {
  it("draws a mirrored talking waveform that changes height without disappearing", () => {
    const centreLine = getTalkingVoiceSignal({ u: 0.5, v: 0.5 }, 0).emphasis;
    const centreOffLine = getTalkingVoiceSignal({ u: 0.5, v: 0.1 }, 0).emphasis;
    const centreLater = getTalkingVoiceSignal({ u: 0.5, v: 0.5 }, 175).emphasis;
    const raisedLater = getTalkingVoiceSignal({ u: 0.5, v: 0.66 }, 175).emphasis;
    const left = getTalkingVoiceSignal({ u: 0.25, v: 0.42 }, 360).emphasis;
    const right = getTalkingVoiceSignal({ u: 0.75, v: 0.42 }, 360).emphasis;
    const samples = [0, 0.25, 0.5, 0.75, 0.999].map((progress) => {
      const time = TALKING_PERIOD_MS * progress;
      const signal = getTalkingVoiceSignal({ u: 0.72, v: 0.5 }, time);
      return getTalkingVoiceSignal({ u: 0.72, v: 0.5 + signal.wave * 0.18 }, time);
    });

    expect(centreLine).toBeGreaterThan(centreOffLine);
    expect(raisedLater).toBeGreaterThan(centreLater);
    expect(left).toBeCloseTo(right, 5);
    samples.forEach((signal) => {
      expect(signal.motion).toBeGreaterThanOrEqual(0.48);
      expect(signal.emphasis).toBeGreaterThan(0.4);
    });
  });

  it("draws listening from the perimeter into a continuous centre capture", () => {
    const edgeStart = getListeningVoiceSignal({ u: 1, v: 1 }, 0).emphasis;
    const centreStart = getListeningVoiceSignal({ u: 0.5, v: 0.5 }, 0).emphasis;
    const captureTime = LISTENING_PERIOD_MS * 0.91;
    const edgeCapture = getListeningVoiceSignal({ u: 1, v: 1 }, captureTime).emphasis;
    const centreCapture = getListeningVoiceSignal({ u: 0.5, v: 0.5 }, captureTime).emphasis;
    const cycleSamples = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((progress) => {
      const time = LISTENING_PERIOD_MS * progress;
      return [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((radius) => getListeningVoiceSignal({
        u: 0.5 + radius * 0.5,
        v: 0.5 + radius * 0.5,
      }, time).emphasis);
    });

    expect(edgeStart).toBeGreaterThan(centreStart);
    expect(centreCapture).toBeGreaterThan(edgeCapture);
    cycleSamples.forEach((sample) => expect(Math.max(...sample)).toBeGreaterThan(0.3));
  });
});

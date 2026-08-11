import { describe, expect, it } from "vitest";
import {
  getAgentEmblemStateFromAIActivity,
  getAgentEmblemStatusCopyFromAIActivity,
} from "./ai";
import type { AgentEmblemAIActivity, AgentEmblemState } from "./types";

describe("getAgentEmblemStateFromAIActivity", () => {
  it.each<[string, AgentEmblemAIActivity, AgentEmblemState]>([
    ["submitted chat", { status: "submitted" }, "loading"],
    ["completed chat", { status: "ready" }, "idle"],
    ["failed chat", { status: "error" }, "idle"],
    ["stream start", { part: { type: "stream-start" } }, "loading"],
    ["reasoning", { part: { type: "reasoning-delta" } }, "thinking"],
    ["text", { part: { type: "text-delta" } }, "composing"],
    ["source lookup", { part: { type: "source-url" } }, "researching"],
    ["tool call", { part: { type: "tool-searchDocs" } }, "researching"],
    ["dynamic tool", { part: { type: "dynamic-tool" } }, "researching"],
    ["step start", { part: { type: "step-start" } }, "thinking"],
    ["terminal part", { part: { type: "finish" } }, "idle"],
    ["tool error", { part: { type: "tool-searchDocs", state: "output-error" } }, "idle"],
  ])("maps %s to %s", (_label, activity, expected) => {
    expect(getAgentEmblemStateFromAIActivity(activity)).toBe(expected);
  });

  it.each(["reasoning-end", "text-end", "tool-searchDocs-end"])(
    "retains the active state for %s to avoid flicker",
    (type) => {
      expect(getAgentEmblemStateFromAIActivity({ part: { type } }, "researching")).toBe("researching");
    },
  );

  it("retains the current state for missing and unknown activity", () => {
    expect(getAgentEmblemStateFromAIActivity(undefined, "talking")).toBe("talking");
    expect(getAgentEmblemStateFromAIActivity({ part: { type: "custom-event" } }, "listening")).toBe("listening");
  });
});

describe("getAgentEmblemStatusCopyFromAIActivity", () => {
  it.each<[AgentEmblemAIActivity, string]>([
    [{ status: "submitted" }, "Sending your message…"],
    [{ status: "ready" }, "Response complete"],
    [{ status: "error" }, "Something went wrong"],
    [{ part: { type: "reasoning" } }, "Thinking…"],
    [{ part: { type: "source-url" } }, "Reading a source…"],
    [{ part: { type: "tool-searchDocs" } }, "Using a tool…"],
    [{ part: { type: "text-delta" } }, "Writing response…"],
  ])("maps activity to user-facing copy", (activity, expected) => {
    expect(getAgentEmblemStatusCopyFromAIActivity(activity)).toBe(expected);
  });

  it("preserves consumer copy for unknown activity", () => {
    expect(getAgentEmblemStatusCopyFromAIActivity({ part: { type: "custom-event" } }, "Still working…")).toBe("Still working…");
  });
});

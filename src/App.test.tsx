import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

describe("playground status preview", () => {
  it("keeps the text shine enabled at every compact size", () => {
    const { container } = render(<App />);
    const statusCopies = container.querySelectorAll<HTMLElement>(".thinking-label");

    expect(statusCopies).toHaveLength(5);
    statusCopies.forEach((copy) => {
      expect(copy.style.backgroundImage).toContain("linear-gradient");
      expect(copy.style.color).toBe("transparent");
    });
  });

  it("puts a copyable npm command in the hero and keeps the integration example", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container } = render(<App />);
    const codeExamples = [...container.querySelectorAll(".editor-code")].map((example) => example.textContent);
    const installExamples = [...container.querySelectorAll<HTMLButtonElement>(".npm-install")];

    expect(installExamples).toHaveLength(2);
    expect(installExamples[0].closest(".intro")).toBeTruthy();
    expect(installExamples[0].getAttribute("aria-label")).toBe("Copy npm install command");
    expect(installExamples[0].textContent).toContain("npm install agent-emblem");
    expect(installExamples[0].querySelector(".install-copy-state--ready")?.getAttribute("data-active")).toBe("true");
    expect(installExamples[0].querySelector(".install-copy-state--success")?.getAttribute("data-active")).toBeNull();

    fireEvent.click(installExamples[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("npm install agent-emblem"));
    await waitFor(() => expect(installExamples[0].getAttribute("data-copied")).toBe("true"));
    expect(installExamples[0].getAttribute("aria-label")).toBe("npm install command copied");
    expect(installExamples[0].querySelector(".install-copy-state--ready")?.getAttribute("data-active")).toBeNull();
    expect(installExamples[0].querySelector(".install-copy-state--success")?.getAttribute("data-active")).toBe("true");
    expect(installExamples[0].querySelector("[role='status']")?.textContent).toBe("Copied to clipboard");
    expect(codeExamples).toHaveLength(2);
    expect(codeExamples[0]).toContain('from "agent-emblem"');
    expect(codeExamples[0]).toContain("AgentEmblemThinking");
    expect(codeExamples[1]).toContain('import { AgentEmblem } from "agent-emblem"');
  });

  it("links to every crawlable guide and example", () => {
    const { container } = render(<App />);
    const resourceLinks = [...container.querySelectorAll<HTMLAnchorElement>(".resource-grid a")].map((link) => link.getAttribute("href"));

    expect(resourceLinks).toEqual([
      "/docs/react/",
      "/docs/vercel-ai-sdk/",
      "/examples/ai-agent-status/",
      "/examples/animated-svg-logo/",
    ]);
  });

  it("offers logo-free marks with clearly labeled optional controls", () => {
    const { container } = render(<App />);
    const app = within(container);

    expect(app.getByRole("button", { name: "Use Circle mark" })).toBeTruthy();
    expect(app.getByRole("button", { name: "Use Square mark" })).toBeTruthy();
    expect(app.getByRole("button", { name: "Use Spark mark" })).toBeTruthy();
    expect(app.getByRole("button", { name: "Use Cursor mark" })).toBeTruthy();
    const optionalHeading = app.getByText("Optional parameters");
    expect(optionalHeading).toBeTruthy();
    expect(optionalHeading.closest("details")?.hasAttribute("open")).toBe(true);
    expect(app.getByText("Leave these untouched to keep the original library rendering.", { exact: false })).toBeTruthy();

    const initialExample = container.querySelectorAll(".editor-code")[1]?.textContent ?? "";
    expect(initialExample).not.toContain("markScale={");
    expect(initialExample).not.toContain("particleCount={");
    expect(initialExample).not.toContain("particleUniformity={");
    expect(initialExample).not.toContain("particlePositionUniformity={");
    expect(app.getByText("Auto")).toBeTruthy();
    expect(app.getAllByText("Off")).toHaveLength(2);

    const sizeControl = app.getByRole("slider", { name: "Mark size" });
    fireEvent.change(sizeControl, { target: { value: "0.72" } });

    expect(app.getByText("72%")).toBeTruthy();
    expect(container.querySelectorAll(".editor-code")[1]?.textContent).toContain("markScale={0.72}");

    const particleControl = app.getByRole("slider", { name: "Particle count" });
    fireEvent.change(particleControl, { target: { value: "128" } });

    expect(app.getByText("≈ 128")).toBeTruthy();
    expect(container.querySelectorAll(".editor-code")[1]?.textContent).toContain("particleCount={128}");

    const uniformityControl = app.getByRole("slider", { name: "Make particles the same size" });
    fireEvent.change(uniformityControl, { target: { value: "0.8" } });

    expect(app.getByText("80% same")).toBeTruthy();
    expect(container.querySelectorAll(".editor-code")[1]?.textContent).toContain("particleUniformity={0.80}");

    const spacingControl = app.getByRole("slider", { name: "Make particle spacing more even" });
    fireEvent.change(spacingControl, { target: { value: "0.65" } });

    expect(app.getByText("65% even")).toBeTruthy();
    expect(container.querySelectorAll(".editor-code")[1]?.textContent).toContain("particlePositionUniformity={0.65}");
  });

  it("describes the 0.2.0 release on the site", () => {
    const { container } = render(<App />);
    const release = container.querySelector(".release-highlights");

    expect(release).toBeTruthy();
    expect(release?.textContent).toContain("v0.2.0 · New release");
    expect(release?.textContent).toContain("Four built-in marks");
    expect(release?.textContent).toContain("Particle composition");
    expect(release?.textContent).toContain("Smarter silhouettes");
    expect(release?.textContent).toContain("Clearer voice motion");
  });
});

import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentEmblem } from "./AgentEmblem";
import { AgentEmblemThinking } from "./AgentEmblemThinking";

const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 9 5 1l4 8Z"/></svg>';

describe("AgentEmblem", () => {
  it("renders an accessible, correctly sized canvas", () => {
    render(<AgentEmblem source={logo} size={32} label="Acme assistant status" className="brand-mark" />);

    const canvas = screen.getByRole("img", { name: "Acme assistant status" });
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas).toHaveProperty("className", "brand-mark");
    expect((canvas as HTMLElement).style.display).toBe("block");
    expect((canvas as HTMLElement).style.height).toBe("32px");
    expect((canvas as HTMLElement).style.width).toBe("32px");
  });

  it("renders safely on the server", () => {
    const html = renderToString(<AgentEmblem source={logo} size={20} label="Server-rendered emblem" />);

    expect(html).toContain("<canvas");
    expect(html).toContain('aria-label="Server-rendered emblem"');
    expect(html).toContain("width:20px");
  });
});

describe("AgentEmblemThinking", () => {
  it("pairs the mark with live status copy and forwards class names", () => {
    const { container } = render(
      <AgentEmblemThinking
        source={logo}
        text="Researching…"
        gap="0.5rem"
        size={24}
        className="status-lockup"
        markClassName="status-mark"
        textClassName="status-copy"
        animateText={false}
      />,
    );

    expect(container.firstElementChild?.classList.contains("status-lockup")).toBe(true);
    expect((container.firstElementChild as HTMLElement).style.gap).toBe("0.5rem");
    expect(screen.getByRole("img", { name: "Agent emblem" }).classList.contains("status-mark")).toBe(true);
    expect(screen.getByText("Researching…").classList.contains("status-copy")).toBe(true);
    expect(screen.getByText("Researching…").getAttribute("aria-live")).toBe("polite");
  });

  it("lets textStyle override textSize and the mark color", () => {
    render(
      <AgentEmblemThinking
        source={logo}
        text="Thinking…"
        color="#111111"
        textSize={12}
        textStyle={{ color: "rgb(255, 0, 0)", fontFamily: "serif", fontSize: 18 }}
        animateText={false}
      />,
    );

    const copy = screen.getByText("Thinking…");
    expect(copy.style.color).toBe("rgb(255, 0, 0)");
    expect(copy.style.fontFamily).toBe("serif");
    expect(copy.style.fontSize).toBe("18px");
  });
});

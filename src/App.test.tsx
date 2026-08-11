import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});

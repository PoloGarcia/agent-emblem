import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import robots from "../public/robots.txt?raw";
import sitemap from "../public/sitemap.xml?raw";
import reactGuide from "../public/docs/react/index.html?raw";
import aiSdkGuide from "../public/docs/vercel-ai-sdk/index.html?raw";
import agentStatusExample from "../public/examples/ai-agent-status/index.html?raw";
import animatedLogoExample from "../public/examples/animated-svg-logo/index.html?raw";

describe("search discovery files", () => {
  it("describes and canonicalizes the main page", () => {
    expect(indexHtml).toContain("Animated AI Agent Status Component for React");
    expect(indexHtml).toContain('<meta name="description"');
    expect(indexHtml).toContain('<link rel="canonical" href="https://agent-emblem.vercel.app/"');
    expect(indexHtml).toContain('property="og:image"');
    expect(indexHtml).toContain('type="application/ld+json"');
  });

  it("publishes a robots file and complete sitemap", () => {
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("https://agent-emblem.vercel.app/sitemap.xml");
    expect(sitemap.match(/<loc>/g)).toHaveLength(5);
  });

  it("gives every guide a unique canonical URL and visible heading", () => {
    const pages = [
      ["docs/react", reactGuide],
      ["docs/vercel-ai-sdk", aiSdkGuide],
      ["examples/ai-agent-status", agentStatusExample],
      ["examples/animated-svg-logo", animatedLogoExample],
    ];

    pages.forEach(([route, html]) => {
      expect(html).toContain(`<link rel="canonical" href="https://agent-emblem.vercel.app/${route}/"`);
      expect(html).toContain("<h1>");
      expect(html).toContain('name="description"');
    });
  });
});

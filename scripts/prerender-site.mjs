import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const outputPath = resolve("site-dist/index.html");
const serverEntry = pathToFileURL(resolve("server-dist/entry-server.js")).href;
const { render } = await import(serverEntry);
const html = await readFile(outputPath, "utf8");
const rendered = render();

if (!html.includes('<div id="root"></div>')) {
  throw new Error("Unable to find the root element while prerendering the site.");
}

await writeFile(outputPath, html.replace('<div id="root"></div>', `<div id="root">${rendered}</div>`));

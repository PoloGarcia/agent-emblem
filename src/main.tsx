import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root")!;
const app = <StrictMode><App /></StrictMode>;

if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);

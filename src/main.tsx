import React from "react";
import ReactDOM from "react-dom/client";
import "./debug/sppDiagnostics";
import { App } from "./ui/App";
import "./ui/styles.css";
import "./ui/collage/collage.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import "dockview-react/dist/styles/dockview.css";

// Fonts are bundled with the app so it looks the same offline.
import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "@fontsource-variable/newsreader/index.css";
import "@fontsource-variable/newsreader/wght-italic.css";

import App from "./app/App";
import "./styles/tokens.css";
import "./styles/redline.css";
import "./styles/app.css";
import "./styles/dock.css";
import "./styles/panels.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from "react";
import { createRoot } from "react-dom/client";
import { isDesignDemo } from "./design-preview";
import { App } from "./app/App";
import "./app/styles.css";
async function start() {
  if (import.meta.env.DEV && isDesignDemo) {
    try {
      const { seedDesignPreview } = await import("./demo/seed");
      await seedDesignPreview();
    } catch {
      // The app displays its normal storage error if IndexedDB is unavailable.
    }
  }
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
void start();

// Build-time guarded: fixtures and the demo database are only used by Vite dev.
export const isDesignDemo =
  import.meta.env.DEV &&
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("demo") === "1";

export const trackerDatabaseName = isDesignDemo
  ? "next-chapter-design-demo"
  : "next-chapter";

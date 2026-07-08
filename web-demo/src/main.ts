import "./styles.css";

export const DEMO_APP_NAME = "Tab Viewer Demo";

if (typeof document !== "undefined") {
  void import("./demoApp").then(({ mountDemoApp }) => {
    mountDemoApp(document);
  });
}

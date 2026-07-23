globalThis.onmessage = () => {
  globalThis.postMessage("zupulse-worker-ready");
};

export {};

declare global {
  const __APP_VERSION__: string;
  const __RENDERER_BUILD_HASH__: string;

  interface Window {
    zupulseBridge?: {
      request(value: unknown): Promise<unknown>;
      subscribe(listener: (event: unknown) => void): () => void;
    };
  }
}

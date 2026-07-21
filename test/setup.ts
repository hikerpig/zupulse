const NativeRequest = globalThis.Request;

if (NativeRequest) {
  class RequestWithoutForeignAbortSignal extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const { signal: _signal, ...requestInit } = init ?? {};
      super(input, requestInit);
    }
  }

  globalThis.Request = RequestWithoutForeignAbortSignal;
}

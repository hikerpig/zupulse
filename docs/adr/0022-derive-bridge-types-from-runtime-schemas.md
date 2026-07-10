# Bridge 类型由运行时 schema 推导

Bridge 请求、响应、事件和错误以可执行运行时 schema 作为唯一真相源，TypeScript 类型从 schema 推导，不再分别手写接口与 validator。Preload 和 Main Process 复用同一组 schema，以 `type` 判别消息；非法输入统一返回稳定的 `INVALID_BRIDGE_MESSAGE`，且不得进入业务 handler。首版 schema 只覆盖实际启用的能力，避免为 SQLite、同步等未实现功能提前固化协议。

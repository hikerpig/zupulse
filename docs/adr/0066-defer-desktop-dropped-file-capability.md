---
status: accepted
---

# Defer the Desktop dropped-file capability

Browser 可把 dropped Web `File` 直接归一为 `ScoreImportSource`。Desktop 的外部文件访问由 Main
拥有，并使用 `file.select → opaque one-time token → file.readBytes`；Preload 只暴露版本化
`request` / `subscribe`，Renderer 不获得绝对路径。

Electron 43 的
[`webUtils.getPathForFile(file)`](https://www.electronjs.org/docs/latest/api/web-utils)
可在 Preload 解析磁盘支持的 `File`，对 JS 构造且没有磁盘来源的 `File` 返回空字符串。Electron
同时建议不要把完整路径暴露给 Web content。官方
[Security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
要求保持 sandbox、context isolation、受限 preload API，并验证 privileged IPC sender。

现有版本化 Bridge request 只接受 Zod 可验证、可 structured-clone 的 plain payload，不能安全地
把 DOM `File` 当作普通 request 字段发送给 Main。使用 `webUtils` 因而需要新增专用 Preload
capability，而不是复用或放宽当前 Bridge schema。

当前 release 不提供 Desktop drag/drop。Desktop modal 继续提供原生多选和 bundled sample；
Browser 单独提供 Web `File` drag/drop。

不得使用以下替代方案：

- Renderer 直接读取 Desktop dropped bytes；
- 向 Renderer 返回绝对路径；
- 在通用 Bridge payload 中接受未经验证的 path；
- 暴露 `webUtils`、`ipcRenderer` 或通用 filesystem API。

未来只有在 Desktop 用户研究证明 drag/drop 相对原生多选具有增量价值后，才可提出新的 Bridge
capability。该提案必须：

1. 在 Preload 接收真实 `File` 并调用 `webUtils.getPathForFile`；
2. 拒绝空路径和 JS 构造的 fake File；
3. 只把路径送到 Main，不返回 Renderer；
4. 由 Main 重新校验 sender、扩展名、文件类型、大小和打开时 metadata；
5. 返回现有形状的 opaque one-time token，并保留 expiry、single consumption、read-time size
   revalidation 和 window-close cleanup；
6. 增加 request/response/capability/schema/dispatcher/security tests。

结果是两端 modal、候选审阅和 bundled sample 保持一致，drop 是明确的平台能力差异；当前 Preload
surface 和一次性 token trust boundary 不扩张。本 ADR 的原始落地前要求：Feature Contract 和 UI
契约在落地前不得宣称 Desktop 支持 drag/drop。

## Follow-up: Desktop dropped-file implementation

本 ADR 推迟的 capability 在同一 release cycle 按上述六步方案落地。实现新增了一条 preload-only 的
专用 IPC 通道（`zupulse:file:importDropped`），**不**把路径承载的 route 通过通用
`zupulse:request` surface 暴露：

1. Preload 从 renderer 自有 `handleDroppedFiles(files)` helper 收到 DOM `File` 数组，对每个 entry
   调用 `webUtils.getPathForFile`；空路径（JS 构造的 fake file）直接短路 `{ ok: false }`。
2. 仅把已在 preload 侧初步判真的纯 `paths[]` 通过专用 IPC 发给 Main；Main 重新校验 app
   sender、重新解析 request envelope、在发 token 前拒绝不支持的扩展名、目录和超大文件，且每
   个 entry 独立失败，不会因为单个坏文件取消整批 drop。
3. Main 复用现有 `stat → assertReadableScore → FileTokenStore.issue` pipeline，返回与
   `file.select` 相同形状的 opaque `{ fileToken, fileName, sizeBytes }[]`；expiry、单次消费和
   `file.readBytes` 读取时大小再校验保持不变。
4. Renderer 始终看不到绝对路径：desktop `createDroppedImportSources` 适配器把 tokens 通过与
   原生多选完全相同的 `file.readBytes` 调用来得到 `ScoreImportSource`。
5. Capabilities 在 Desktop 广播 `fileAccess.droppedFileImport: true`；iPad 通过 iPad Bridge
   request 白名单继续排除此能力。
6. document-level capture 防护（`installGlobalDragAndDropGuard`）吞掉显式 drop zone 之外的
   外部 Files `dragover`/`drop` 默认行为，避免拖入 Library 空白区或 Viewer 触发系统打开或下载。

原决策的安全准则（"绝不暴露绝对路径、不通过通用 Bridge 接受未验证路径、保持现有一次性 token
信任边界"）仍然是该能力的不变量，本落地未作任何放宽。随代码一起更新的支撑文档：Sheet Library
Feature Contract 的 import 节 + 平台能力矩阵 + 证据地图、known-gaps 清单，以及
`DESIGN.md` Library 小节对应条项。

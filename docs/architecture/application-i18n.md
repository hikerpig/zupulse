# 应用国际化架构

## 所有权

`@zupulse/app-i18n` 是应用文案、支持语言和 locale 解析的唯一事实源。当前支持 `zh-CN` 与
`en-US`，偏好为 `system | zh-CN | en-US`，解析不到受支持语言时回退 `en-US`。

Locale Preference 属于宿主设备，不属于曲谱库或领域文档：

- Browser 使用 `localStorage["zupulse-locale"]`。
- Desktop Main 使用 `${userData}/preferences.json`，Renderer 不读写 localStorage。
- `web-viewer` 只消费宿主提供的 `LocaleHost`，每个应用实例拥有独立 i18next instance。

用户修改语言时，宿主必须先持久化偏好，成功后才返回新的 Locale State。React 随后更新 i18next、
`html lang/dir` 和受管 metadata；失败时继续使用原语言。

## Catalog 与展示边界

Catalog 按 `common`、`library`、`viewer`、`studio`、`errors`、`desktop`、`meta` 分区，中英文结构
由 TypeScript 和 catalog parity 测试共同约束。运行时不下载语言包。

`web-core` 只产生稳定 code、context 和语义状态，不包含翻译 key 或生成式本地化文案。用户内容、
曲谱标题、艺术家、轨道原名、和弦符号和用户 Loop 名称不翻译；默认轨道名、生成 Loop 名称、错误和
ARIA 在 UI 层根据当前 locale 生成。

新增文案时：

1. 在 `zh-CN.ts` 和 `en-US.ts` 的同一 namespace 增加语义 key。
2. 组件只调用 `useTranslation(namespace)`，完整句子和复数规则留在 catalog。
3. 动态错误先增加稳定 code/context，再做穷举映射；禁止向 DOM 输出原始异常。
4. 运行 focused tests、`pnpm check:i18n` 和与风险匹配的 build/E2E。

新增 locale 时，需要同时更新 `supportedLocales`、resolver、完整 catalog、plural contract、Browser
metadata、Desktop 系统语言解析和双端 E2E。

## Desktop Bridge

Bridge 4.0.0 的 handshake 返回 Locale State，并声明 `localization.changeLocale` capability。
Renderer 通过 `app.locale.setPreference` 修改偏好。Main 使用 Zod 校验版本化 JSON，以权限 `0o600`
写同目录临时文件并原子 rename；损坏文件隔离为 `.corrupt` 后回退 `system`。保存成功后 Main 重建
应用菜单，后续打开/保存 Dialog 使用新的 `desktop` catalog；已经打开的系统 Dialog 不原地更新。

## 验证

- `packages/app-i18n` 测试目录结构、placeholder、plural 与 instance 隔离。
- `scripts/check-i18n.mjs` 拒绝生产 TSX 中的 JSX 硬编码文案和用户可见静态属性。
- Browser 测试 locale 的事务式 localStorage 和 runtime metadata。
- Desktop 单测覆盖 Bridge 与 preference store，E2E 覆盖 Renderer/Menu 重启一致性。
- 总门禁依次为 `pnpm verify:fast`、`pnpm verify`、`pnpm verify:e2e`。

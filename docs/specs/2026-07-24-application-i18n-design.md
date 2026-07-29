---
status: implemented
---

# 应用国际化（i18n）设计

## 背景

当前用户可见文案分散在四类位置：

1. `packages/web-viewer` 的 React JSX、ARIA、placeholder、title、状态拼接和 presenter。
2. `packages/web-core` 的导入诊断摘要、自动生成 Loop 名称和部分默认标题。
3. `apps/desktop-shell` 的原生菜单、文件选择器、启动错误和 Renderer 宿主错误。
4. `apps/web-demo/index.html` 的页面标题、description 与社交分享元数据。

这不是简单的“把 JSX 中文挪到 JSON”问题。如果只迁移 React 文案，领域层仍会生成中文字符串，
Electron 原生界面仍会固定中文，数量、日期、复数和持久化自动名称也会继续绑定某一种语言。

## 目标

- 首批完整支持 `zh-CN` 与 `en-US`。
- 默认跟随系统语言，允许用户显式选择“跟随系统 / 简体中文 / English”。
- Browser Demo 与 Desktop Renderer 使用同一套翻译目录、key 和格式化规则。
- Electron Main 复用同一翻译目录，原生菜单和文件选择器与应用内语言保持一致。
- `web-core` 只输出稳定 code、枚举和结构化上下文，不输出面向用户的本地化句子。
- 语言切换不重建 Viewer/Studio Session，不中断播放，不改变 URL 或持久化领域事实。
- 在类型检查、目录一致性检查、组件测试和 E2E 中阻止缺 key、错插值和新增硬编码文案。

## 非目标

- 首批不接入在线翻译管理平台，不从 HTTP/CDN 动态下载语言包。
- 首批不支持 `zh-TW`、日语或完整 RTL 验收；架构保留扩展能力，但只验收 `zh-CN`、`en-US`。
- 不翻译用户输入、曲名、艺术家、轨道名、和弦符号、文件名、BPM、MXL、MusicXML 等内容或标准缩写。
- `zh-CN` 不保留 Library、Score Viewer、Practice、Loop、Tracks、Session、Chord workspace、
  SETTINGS、PREVIEW、SEGMENTS 等英文装饰标题；它们分别使用对应中文界面名称。
- 不为 Browser Demo 建立服务端渲染或多 URL SEO 构建；静态 HTML 使用英文 fallback，挂载后按实际
  locale 更新运行时元数据。
- 不把原始异常消息直接当作翻译 key，也不把 i18n 引入 `packages/web-core`。

## 架构决策

### 1. 采用 i18next + react-i18next

使用 `i18next` 负责目录、插值、复数和 `Intl` 格式化，使用 `react-i18next` 负责 React Context、
hook 与语言变化后的重渲染。

选择理由：

- 同一份资源可同时用于 React Renderer 和 Electron Main。
- 支持按 namespace 组织、CLDR/`Intl.PluralRules` 复数规则和 `Intl` number/date/list 格式。
- 可通过 TypeScript resource augmentation 校验 key 与插值变量。
- 不要求网络 backend，适合 Browser/Electron 离线 bundle。

首批依赖基线为调研时的 `i18next@26.3.6`、`react-i18next@17.0.11`；实施时使用精确 lockfile
解析结果，不使用宽泛的“latest”作为可重复构建依据。

该选择由 ADR 0057 固化：`i18next` 是 Renderer/Main 共享 core，`react-i18next` 只存在于
`web-viewer` React 集成层；不得在 Electron Main 或 `web-core` 引入 React adapter。

### 2. 新增共享 `@zupulse/app-i18n` 包

Renderer 与 Electron Main 已经是两个独立消费者，因此建立一个无 React、无 DOM、无 Electron
依赖的共享包：

```text
packages/app-i18n/
  package.json
  tsconfig.json
  tsconfig.test.json
  src/
    index.ts
    catalog.ts
    locales/
      zh-CN.ts
      en-US.ts
    __tests__/
      catalog.test.ts
      locale.test.ts
```

该包负责：

- `SupportedLocale = "zh-CN" | "en-US"`。
- `LocalePreference = "system" | SupportedLocale`。
- 系统语言匹配与 fallback。
- bundled resources、namespace 列表和按应用实例创建 i18next instance。
- 中英文目录结构、叶子类型与插值变量的一致性测试。

Catalog 首版使用 TypeScript resource object：

- `zh-CN.ts` 使用 `as const`，作为 semantic key 与插值变量的类型基准。
- `en-US.ts` 使用递归 `TranslationShape<typeof zhCN>`，要求相同 namespace/key 和 string 叶子，
  但不要求文本 literal 相同。
- catalog test 比较每个对应 message 的 `{{placeholder}}` 集合，防止翻译遗漏或发明插值变量。
- 首批 plural message 在两种目录中都声明受支持 locale 所需类别的并集，即 `_one` 与 `_other`；
  `zh-CN` 两个值可以相同。调用方仍以 semantic base key 配合 `count` 调用，由 i18next
  `Intl.PluralRules` 选择实际变体。这样既保持目录同构，也不会把英文单复数规则塞进组件。
- 当前不维护 JSON、生成 `.d.ts` 或 TMS 同步链；需要非开发者翻译流程时再增加单向导入导出工具。

该包不负责：

- React Provider 或 hook。
- Browser/Desktop 偏好持久化、Electron Bridge 或 UI 设置控件。
- 领域错误分类。

### 3. 每个应用实例一个 i18next instance

禁止使用 module singleton。`mountViewerApp()` 在挂载前创建并同步初始化一个 i18next instance，
再通过 `I18nextProvider` 注入。这样保持现有“每个应用实例一个 store/router/application”的隔离原则，
也避免多窗口和测试互相改变语言。

`zh-CN`、`en-US` 的全部 namespace 编入 Browser、Renderer 和 Main bundle，并配置
`initAsync: false` 同步初始化。语言切换不执行网络请求、动态 import、chunk 加载或 Suspense
loading；只有支持语言数量和 catalog 体积显著增长后，才重新评估按 locale 拆分构建产物。
Provider 顺序为：

```tsx
<StrictMode>
  <I18nextProvider i18n={i18n}>
    <AppStoreProvider store={store}>
      <RouterProvider router={router} />
    </AppStoreProvider>
  </I18nextProvider>
</StrictMode>
```

### 4. 语言解析与持久化

语言偏好按以下优先级解析：

1. 用户显式偏好：`zh-CN` 或 `en-US`。
2. `system` 时按 `navigator.languages` 顺序匹配；`zh-*` 映射为 `zh-CN`，`en-*` 映射为 `en-US`。
3. 没有匹配时 fallback 到 `en-US`。因此中文系统默认显示中文，英文及其他尚未支持的系统语言默认显示英文。

Locale Preference 是设备级宿主偏好，不属于 Sheet Library、Renderer localStorage 或任何领域文档：

- Browser host 使用 `localStorage["zupulse-locale"]` 持久化。
- Desktop 由 Electron Main 使用应用数据目录下独立、版本化的 `preferences.json` 持久化，并在创建菜单、
  文件 Dialog 和 Renderer 挂载前解析；locale 不依赖 `library.sqlite`。
- `web-viewer` 只消费宿主提供的 initial locale state，并通过窄宿主端口修改偏好。

Desktop preference document 的首版结构为：

```ts
{
  schemaVersion: "1.0.0";
  localePreference: "system" | "zh-CN" | "en-US";
}
```

Main 使用 Zod 校验、权限为 `0o600` 的临时文件和同目录原子 rename 写入。文件缺失时按 `system`
处理；解析或 schema 校验失败时把原文件 rename 为带时间戳的 `.corrupt` 文件，再回退 `system`，
不阻断启动。

Browser 中缺失或非法的 `localStorage` 值同样按 `system` 处理；非法值只做 best-effort 删除，
删除失败不阻断启动。Desktop 读取偏好时若遇到非 `ENOENT`、且无法通过隔离损坏文件恢复的 I/O
错误，也按 `system` 启动并记录宿主诊断，但不覆盖原文件。读取偏好失败不能让应用无法启动；
用户主动保存偏好失败仍遵循下述事务式语义。

`system` 只在应用启动和用户主动选择“跟随系统”时读取宿主当前语言并解析。运行中不监听 Browser
`languagechange`，也不轮询 Desktop 系统 locale；外部系统语言变化在下一次应用启动时生效。

语言变化时：

- 先通过 locale host port 持久化新的 Preference。
- 只有宿主成功返回新的 Locale State 后，才更新 i18next language、`<html lang>`、`<html dir>`、
  `document.title`、description、Open Graph 和 Twitter 元数据。
- 保存期间禁用重复提交；失败时保持旧 Preference 和 Effective Locale，并显示本地化的可恢复错误。
- Browser `localStorage.setItem()` 抛错与 Desktop `preferences.json` 写入失败使用相同的事务式语义。
- 不写 URL，不写 Sheet Library、sidecar、resume 或 Harmony Analysis Document。

### 5. Namespace 与 key 规则

首批 namespace：

| Namespace | 内容                                              |
| --------- | ------------------------------------------------- |
| `common`  | 品牌、全局导航、主题、语言、通用动作、通用状态    |
| `library` | Sheet Library、导入、搜索、排序、元数据编辑、删除 |
| `viewer`  | Viewer、播放、Loop、轨道、练习状态                |
| `studio`  | Studio、分析、候选、修正、预览、导出              |
| `errors`  | 导入、馆藏、播放、分析、Bridge、启动错误          |
| `desktop` | Electron 菜单、文件选择器和原生 shell 文案        |
| `meta`    | Browser title、description、keywords 与分享元数据 |

使用稳定语义 key，不使用中文或英文原句作为 key：

```ts
t(($) => $.actions.retry);
t(($) => $.scoreCount, { count: visible.length, total: scores.length });
t(($) => $.deleteDialog.title, { title: score.title });
```

规则：

- key 以用户概念和状态命名，不以组件文件名或视觉位置命名。
- 完整句子由目录控制，禁止在 JSX 中拼接可翻译片段。
- 数量必须使用 `count` 和复数规则；日期、相对时间、数字和列表使用 `Intl` formatter。
- 快捷键、BPM、百分比、和弦名和时间码作为插值或不可翻译值传入。
- 普通数字、日期、相对时间、列表和文本排序使用当前 Effective Locale；日期仍使用宿主时区，
  本期不增加时区偏好。音乐时长、节拍时间码、BPM 和百分比保持领域约定的固定表示。
- Library 标题排序使用当前 locale 的 `Intl.Collator`；切换语言允许列表按新语言规则重新排序，
  但必须保持查询、筛选、选中项和已打开 Dialog 等交互状态。
- 不可翻译白名单只包含品牌、文件格式、标准音乐符号和用户内容；普通英文 UI 词不能用
  `i18n-ignore` 绕过中文 catalog。
- `aria-label`、`title`、`placeholder`、空态、错误、确认框和可见文案使用同一目录。
- `Trans` 只用于确实包含 React 子元素的句子；普通文案使用 `t`。
- 生产 i18next `fallbackLng` 固定为 `en-US`；开发与测试遇到 missing key 直接失败。
- 组件不得传 source-language `defaultValue` 掩盖目录缺口。英文 fallback 自身缺失必须由类型、catalog
  parity 和动态 code 穷举测试阻止。

### 6. 领域与展示边界

`web-core` 不依赖 i18n，也不持有 translation key。

#### 导入诊断

`ImportDiagnostic` 保留：

```ts
type ImportDiagnostic = {
  code: ImportDiagnosticCode;
  severity: "info" | "warning" | "error";
  context?: Record<string, string | number | boolean>;
};
```

删除 `summary`。`web-viewer` 在 `errors.import.<code>` 中完成本地化。Bridge/日志仍记录 code 和 context，
不记录翻译后的句子作为机器事实。所有 Import Diagnostic code 必须在两种 locale 的 `errors.import`
中显式映射；运行时遇到未知 code 时显示本地化 generic import error，不展示裸 code，也不回退到
`web-core` 文案。

#### 应用错误

`ViewerApplication` snapshot 不再把任意 `Error.message` 当作主要用户文案。使用结构化 issue：

```ts
type ApplicationIssue = {
  code: ApplicationIssueCode;
  recoverable: boolean;
  context?: {
    fileName?: string;
    format?: string;
  };
};
```

组件把 `code` 映射到 `errors` namespace。context 的字段按 issue code 显式定义并只允许文件名、
格式等安全值；不提供通用 `detail: string`。生产 UI 不直接展示 `Error.message`、stack、Bridge details
或文件系统文本，也不得通过解析 message 推断类型。原始异常只进入 Desktop 宿主诊断日志；
Browser 开发模式可以写入 console。未知错误只显示本地化 generic error。

#### Presenter

`presentPlayback()` 等纯 presenter 返回语义状态和数值，不返回 `"播放" | "暂停"` 这类本地化 union。
组件按 `isPlaying`、`soundFont`、`persistence` 等字段翻译。这样语言变化只引发视图重渲染，不需要
重建 presenter 或 Session。

#### 自动生成 Loop 名称

`labelSource: "generated"` 的 Loop 名称属于可重新计算的展示，不应把某种语言固化进 sidecar：

- generated Loop 持久化时不再要求保存本地化 label。
- UI 根据 start/end measure 和当前 locale 生成显示名。
- `labelSource: "user"` 的 label 原样保存且永不翻译。
- 旧 sidecar 中 generated 中文 label 继续可读，但显示时忽略旧 label 并按当前语言重算。

`0.1.0` legacy sidecar 只有 start/end tick，当前迁移会生成 `measureIndex: -1`，不能直接用于显示。
解码迁移时不再生成 `循环 ${id}`；PlaybackController 创建 state 时使用当前 timeline 把 legacy tick
恢复成有效 Musical Position，之后再由 UI 本地化。恢复只改变 Session snapshot，不要求立即重写 sidecar。

这需要兼容旧数据的 schema 调整和 Session 初始化归一化，但不删除用户已有 sidecar。

### 7. UI 语言入口

语言是低频设置。AppHeader 使用现有 `ContextPopup` 和 `Languages` 图标提供三项选择：

- 跟随系统
- 简体中文
- English

触发按钮和 popup 的 accessible name 随当前语言变化。切换后当前页面、Dialog、ARIA 和原生 Electron
菜单立即更新；不刷新页面，不丢失未保存 Studio 修正，不关闭练习设置。

主题设置本轮保持现有行为，不借 i18n 改造扩大为完整设置中心。

### 8. Electron Main 同步

Desktop handshake response 增加：

```ts
locale: {
  preference: "system" | "zh-CN" | "en-US";
  effectiveLocale: "zh-CN" | "en-US";
}
```

新增 Bridge request：`app.locale.setPreference`。

```ts
request: {
  preference: "system" | "zh-CN" | "en-US";
}
response: {
  preference: "system" | "zh-CN" | "en-US";
  effectiveLocale: "zh-CN" | "en-US";
}
capability: localization.changeLocale = true;
```

Main 在创建 BrowserWindow 和菜单前读取 Preference 并计算 Effective Locale。Renderer 使用 handshake
返回值初始化 i18next 和 store，不自行读取 Desktop localStorage。收到 setPreference 请求后，Main：

1. 校验并持久化 Preference。
2. 计算并返回新的 Effective Locale。
3. 重建 application menu。
4. 后续文件打开/保存 dialog 使用对应 `desktop` namespace。

如果第 1 步失败，Bridge 返回 recoverable `LOCALE_PREFERENCE_WRITE_FAILED`；Main 不修改内存 state、
菜单或后续 Dialog locale，Renderer 也不改变当前语言。

Browser host 提供同构的 read/write adapter，但直接使用本地浏览器能力，不经过 Bridge。两种宿主的
Sheet Library 本来就互相独立，Locale Preference 同样不跨宿主同步。

Bridge request、response、capability、schema version、dispatcher 和 E2E 必须一起更新。

Locale 切换只影响切换完成后创建的原生文件 Dialog；操作系统已打开的 modal dialog 不尝试原地
改写。Electron 的标准 role 菜单继续由 Electron/操作系统提供平台惯用文案，应用自定义菜单项和
Dialog 文案来自 `desktop` namespace，避免重写平台语义和快捷键行为。

### 9. Browser 静态 metadata

Browser Demo 是静态应用入口，不具备依据 `Accept-Language` 为爬虫选择 HTML 的服务器边界。本期
采用单一英文 no-JS fallback：

- `index.html` 使用 `<html lang="en-US">`。
- title、description、keywords、Open Graph 和 Twitter metadata 使用英文 catalog 对应文案。
- i18n 初始化完成后，立即按 Effective Locale 更新 `<html lang>`、`dir` 和所有受管 metadata；
  后续切换语言时重复更新。
- 不新增 `/zh-CN/`、`/en-US/` 双入口、canonical/hreflang 或 SSR。若未来产品需要可索引的双语
  营销页面，应由独立的托管和 SEO 设计处理，而不是复制应用入口。

### 10. Catalog 维护与评审

Catalog 与使用它的代码在同一个变更中提交。新增或修改用户文案时必须同时更新 `zh-CN` 与
`en-US`，不得先合入 placeholder、TODO 文案或运行时 fallback。首批由代码评审维护翻译质量；
需要非开发者协作或更多 locale 时，再引入从 TypeScript catalog 单向导入/导出的 TMS 流程。

测试优先断言 semantic key 对应的可访问名称和关键用户旅程，不为整个 catalog 或整页 DOM 维护
巨型 snapshot。Catalog parity、placeholder 集合与 code union 穷举负责结构完整性，人工双语验收
负责措辞和布局质量。

### 11. 测试与门禁

#### 目录测试

- `zh-CN` 与 `en-US` namespace、key 树完全一致。
- 叶子均为 string。
- 对应 message 的 `{{placeholder}}` 集合完全一致。
- 所有 plural base key 同时具备 `_one`、`_other`，并验证 English `count=1` 与 `count=2` 选择不同
  文案、Chinese 两种 count 都选择合法中文文案。
- i18next 初始化后两种语言不存在 missing key。
- 开发/测试 instance 请求 missing key 时抛错；生产 instance 从 `zh-CN` 缺失项回退 `en-US`。
- 代表性复数、插值、相对时间和错误 code 输出正确。
- `ImportDiagnosticCode` union 的每个成员在两种 locale 中都有映射，未知运行时值落到 generic error。
- `zh-CN` catalog 的装饰标题没有遗留英文 UI 词；白名单 token 由测试显式列出。

#### 组件测试

- 默认测试显式注入 `zh-CN`，不依赖执行机系统语言。
- 每个表面至少一个 `en-US` 用户旅程：Library、Viewer、Studio。
- 使用 role/name 查询，验证语言切换后 accessible name 同步更新。
- 验证切换语言不销毁 Session、不发送领域 command、不丢未保存状态。
- 验证 Browser/Desktop 偏好写入失败时按钮恢复可用、显示错误且所有表面保持旧语言。
- 验证任意包含绝对路径或技术 code 的原始异常不会出现在生产 DOM。

#### 静态门禁

新增 `scripts/check-i18n.mjs`，用 TypeScript AST 检查受管 UI 文件中的：

- JSX text。
- `aria-label`、`title`、`placeholder`、`alt` 字符串 literal。
- 明确标记为 user-facing 的 presenter/message mapping。

目录文件、测试 fixture、用户内容、标准缩写和带理由的 `i18n-ignore` 不报错。禁止使用不断扩张的全局
allowlist 掩盖真实文案。

#### E2E

- Browser：系统英文首次启动、显式切中文、刷新后保持偏好。
- Desktop：Main 在 Renderer 挂载前恢复偏好；切英文后 Renderer、菜单和后续新开的文件 dialog 同步，
  重启第一帧即保持英文。
- System mode：运行中改变模拟系统语言不触发切换；重新启动后按新系统语言解析。
- 两种语言下至少覆盖导入、播放、删除确认和 Studio 保存/导出状态。

## 迁移顺序

1. 共享 i18n 包、类型、目录一致性测试。
2. 宿主 locale preference port、Renderer Provider、document lang/dir 和语言入口。
3. `web-core` 结构化诊断、应用 issue 与 generated Loop 名称边界。
4. Library 垂直迁移。
5. Viewer/Playback 垂直迁移。
6. Studio 垂直迁移。
7. Desktop Main、Bridge、文件 dialog、启动错误与 Browser metadata。
8. 静态门禁、双语言 E2E、架构文档收尾。

每个垂直迁移完成后，该表面不得继续存在可见硬编码 fallback；不维护“中文旧实现 + i18n 新实现”双路径。

## 风险与缓解

| 风险                                            | 影响 | 缓解                                                                           |
| ----------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| 直接翻译 `Error.message` 导致错误分支仍依赖文案 | 高   | 先建立 code/context，再迁移错误 UI                                             |
| 英文更长导致高密度工作台溢出                    | 高   | Library/Viewer/Studio 分阶段做 320/768/1024/1440 px 验收                       |
| generated Loop 名称已经持久化中文               | 中   | 利用 `labelSource` 区分生成与用户标签，旧 generated label 只作兼容输入         |
| Desktop Locale Preference 持久化损坏            | 中   | Main 隔离损坏数据并回退 `system`，不阻断 Renderer 或菜单启动                   |
| Locale Preference 写入失败造成半切换            | 高   | 先持久化再提交 locale state；失败时所有表面保持旧语言                          |
| 原始异常成为第二套文案或泄漏内部路径            | 高   | UI 只接收 issue code 与白名单 context；原始异常只进入宿主诊断                  |
| 全目录一次迁移导致测试难定位                    | 高   | 按表面垂直切片，每阶段保持两种宿主可构建                                       |
| 类型化大目录拖慢 TypeScript                     | 低   | 首批 7 个 namespace、两种语言；出现性能问题再启用 selector optimize 或拆分检查 |

## 验收标准

- `zh-CN`、`en-US` 下 Library、Viewer、Studio 的可见文案与无障碍名称完整可用。
- 用户切换语言后当前 Session、播放、Loop、Studio 未保存修正保持不变。
- Browser 与 Desktop Renderer 使用同一目录；Desktop 菜单和文件选择器与 Renderer 同步。
- Desktop 由 Main 持久化 Preference，并在 Renderer 挂载前通过 handshake 提供 locale state。
- `web-core` 不包含面向用户的中文/英文句子，诊断使用稳定 code/context。
- generated Loop 名称随语言变化，用户自定义名称保持原样。
- 两种语言目录 key 和插值结构通过自动检查。
- 受管 UI 新增硬编码文案会在 `pnpm check:i18n` 失败。
- `pnpm verify` 与双宿主相关 E2E 通过。

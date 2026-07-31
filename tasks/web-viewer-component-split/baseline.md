# web-viewer 大型 TSX 拆分基线

记录时间：2026-07-31（Asia/Shanghai）

## Focused behavior tests

命令：

```text
pnpm vitest run \
  packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx \
  packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx \
  packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx \
  packages/web-viewer/src/app/__tests__/App.test.tsx \
  packages/web-viewer/src/__tests__/styles.test.ts
```

结果：5 个 test files、93 项 tests 全部通过。

| File                         | Result    |
| ---------------------------- | --------- |
| `PlaybackWorkspace.test.tsx` | 22 passed |
| `SheetLibrary.test.tsx`      | 20 passed |
| `StudioPage.test.tsx`        | 19 passed |
| `App.test.tsx`               | 15 passed |
| `styles.test.ts`             | 17 passed |

## Production build baseline

以下命令全部通过：

```text
pnpm demo:build
pnpm desktop:build
pnpm ipad:web:build
```

### Browser Demo

| Asset                                          |     Bytes |
| ---------------------------------------------- | --------: |
| `main.257e6df11960319e.js`                     | 1,339,788 |
| `zupulse-harmony-analysis.97e3a2782c72fd03.js` |   270,632 |
| `644.97906b6440f06255.js`                      |    70,946 |
| `main.a66debeedc784eda.css`                    |    71,721 |

### Desktop Renderer

| Asset                                          |     Bytes |
| ---------------------------------------------- | --------: |
| `renderer.8561589502e65976.js`                 | 1,295,571 |
| `zupulse-harmony-analysis.a4d8fbd81c0cab20.js` |   271,352 |
| `644.10c57dd64724bf88.js`                      |    70,955 |
| `renderer.d83b3c198d1bce7d.css`                |    71,718 |

### iPad Web Assets

| Asset                                          |     Bytes |
| ---------------------------------------------- | --------: |
| `main.e8c89fb7242a1097.js`                     | 1,355,845 |
| `zupulse-harmony-analysis.97e3a2782c72fd03.js` |   270,632 |
| `644.97906b6440f06255.js`                      |    70,946 |
| `main.5b19283e8fffccb2.css`                    |    71,739 |
| `851.11c0ac048a30ffcd.js`                      |       182 |

当前三个宿主都没有 Library、Viewer、Studio route 专属 chunk；主要 React application code 位于单一
initial entry asset。

## Rendering-boundary baseline

当前源码边界：

- `PlaybackWorkspace.tsx` 在 `PlaybackLayout` 顶层订阅完整 playback snapshot；position snapshot 会让
  transport 与打开的 Practice Drawer 共同进入一次父级 render。
- `SheetLibrary.tsx` 在包含完整 score list 的 coordinator 中持有 raw query；每次键入都会 render
  coordinator，虽然过滤结果使用 200ms debounced query。
- `StudioPage.tsx` 订阅完整 `ViewerApplicationSnapshot`；Library 或其他 application slice 更新也会使
  Studio route 进入 render。

现有组件没有可独立注入 render probe 的稳定子边界，因此不增加断言旧耦合行为的临时测试。各性能
阶段先为新 selector/memo boundary 写失败测试，再实现边界，并以测试与 production chunk 产物证明
目标成立。

## Refactor result

完成拆分后的 production build 仍由相同三条命令生成，均通过。入口与基线相比：

| Host             | Baseline entry | Final entry | Reduction |
| ---------------- | -------------: | ----------: | --------: |
| Browser Demo     |      1,339,788 |   1,257,909 |    81,879 |
| Desktop Renderer |      1,295,571 |   1,190,180 |   105,391 |
| iPad Web Assets  |      1,355,845 |   1,268,987 |    86,858 |

三个宿主均生成独立的 Library、Viewer、Studio 和 Studio unavailable async chunks：

| Host             | Library | Viewer | Studio | Studio unavailable |
| ---------------- | ------: | -----: | -----: | -----------------: |
| Browser Demo     |   4,301 | 35,290 | 37,162 |              2,656 |
| Desktop Renderer |   4,310 | 40,438 | 38,980 |              2,665 |
| iPad Web Assets  |   4,301 | 37,996 | 37,163 |              2,656 |

chunk ID 与 content hash 由构建器生成，表格记录的是本次最终验证中的字节数，不作为稳定接口。

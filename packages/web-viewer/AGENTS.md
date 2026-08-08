# Web Viewer Context

## Responsibilities and Boundaries

- Own shared React routes, presentation state, and user interaction orchestration.
- Access host capabilities only through `SheetLibraryRepository`, `ScoreFileGateway`, and Viewer host ports.
- Do not access IndexedDB, Node, Electron, absolute paths, or platform file APIs directly.
- Keep domain decisions, format parsing, playback algorithms, and cross-boundary validation in `web-core`.

## Implementation Conventions

- Before changing UI, CSS, themes, layout, or interaction states, read the root `DESIGN.md`. Read the relevant
  files under `.design_library/zupulse-te-braun-theme` only when changing themes, tokens, or foundational
  components.
- Before editing a product surface, state its target design scale, inspect the owning component and user-facing
  tests, and list the interaction and data states affected by the change. Reuse an existing semantic token,
  shared primitive, or current recommended implementation when one already owns the intended role.
- Organize new or materially expanded features under `src/features/<feature>/`. Keep small features flat; create
  `components/`, `adapters/`, `model/`, `runtime/`, or product-semantic subdirectories only when that
  responsibility has enough content to form a real boundary. Follow
  `docs/architecture/react-application-system.md` for the dependency direction.
- Treat React hooks that subscribe to `ViewerApplication`, a Viewer Session, an existing store, or a browser
  lifecycle as feature adapters, not as a new data layer. Put them under the feature's `adapters/` boundary when
  extracted. Keep pure projections and selectors in `model/`, non-React imperative schedulers in `runtime/`, and
  component-local UI state in the owning component.
- Do not create generic feature or package catch-alls such as `hooks/`, `utils/`, `types/`, `services/`, or
  `shared/`. A feature MUST NOT access another feature through internal deep imports; promote genuinely shared UI
  to `src/components` and domain behavior to `web-core` or an application/session port.
- Routes MUST use persistent `libraryScoreId` values. Rebuild temporary Viewer Sessions from the Repository after
  refresh.
- Prefer semantic HTML and cover keyboard, focus, loading, empty, and error states. UI tests SHOULD observe
  user-visible outcomes by role and accessible name instead of implementation details.
- Keep imperative alphaTab lifecycle management inside Viewer adapters or workspace boundaries, not ordinary
  presentation components.
- Components MUST consume runtime semantic tokens from `src/styles/tokens.css`, never raw color scales from the
  theme library. Record durable design decisions in the root `DESIGN.md`, not only in local CSS or task
  discussions.
- Static presentation styles MUST live in the relevant CSS Module or an approved semantic utility. Inline styles
  are reserved for values calculated from runtime state, geometry, or external APIs. Resolve Tailwind and CSS
  Module conflicts through the appropriate cascade layer; MUST NOT use inline styles merely to increase
  specificity, and avoid `!important`.
- Use the `.scrollable` utility from `src/styles/common.css` for scroll containers. It hides scrollbars by default
  and reveals them on hover. Apply it directly to the element that scrolls, such as `ScoreViewer`; do not add
  duplicate scrolling behavior to outer layout containers.
- For nested flex or grid layouts that must fill available height, every level MUST declare the required sizing
  contract: outer containers use `height: 100%` and nested shrinking containers use `min-height: 0`.
- Use `lucide-react` for icons; do not use emoji or Unicode symbols. Icons MUST be at least 16px.
- Use `ContextPopup` for low-frequency settings and preview actions. Command bars keep only the icon trigger while
  the complete panel opens in the popup.
- Encode fragment and list-item distinctions visually with existing semantic tokens, such as side bars, dots, or
  surface colors, instead of adding verbose metadata.

## Navigation and Verification

- `src/app/App.tsx` is the route-composition reference.
- `src/app/ViewerApplication.ts` is the host-port orchestration reference.
- `src/app/__tests__/App.test.tsx` is the user-perspective UI testing reference.
- After a UI change, review it against the root design contract's color, typography, layout, shape, motion, and
  anti-pattern rules. Verify the relevant Light, Dark, desktop, narrow-screen, keyboard, and state scenarios;
  omit a scenario only when it cannot affect the changed surface.
- Start verification with the smallest relevant command:
  `pnpm vitest run packages/web-viewer/src/<area>`.

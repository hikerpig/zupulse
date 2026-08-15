# Anonymous Telemetry Release Dashboard

status: `pending external PostHog setup`
last_verified: `2026-08-14`

This document is the repository-side definition of the Product Health dashboard. It does not claim that a remote
PostHog dashboard has been created. The dashboard must use the anonymous event properties defined by the current
Feature Contract and must not add person profiles, autocapture, replay, GeoIP, or score content.

## Required metrics

1. Active Installation: distinct `distinct_id` with at least one accepted event in the selected period.
2. Application Sessions: unique `application_session_id` from `application_session_started`.
3. Sessions per Installation: Application Sessions divided by Active Installation.
4. Library Refresh Success: `application_ready` grouped by `state`.
5. Import Completion Rate: `score_import_completed` grouped by `outcome` and `source`.
6. Workspace Starts: `workspace_session_started` grouped by `workspace` and `initialSurface`.
7. First Playback Starts: `viewer_playback_started` grouped by `surface`.
8. Presented Issues: `application_issue_presented` grouped by `surface` and `issueCode`.
9. Error-free Sessions: sessions without `$exception` or `runtime_failure_observed`, divided by all sessions.

## Release gates

- Browser and Desktop fake-ingestion E2E must pass before a provider smoke test.
- A tagged release workflow must upload Browser, Desktop Main, Preload, and Renderer source maps with the same
  `TELEMETRY_BUILD_ID` and remove maps from public/package artifacts.
- The production PostHog US smoke must verify one launch and one semantic event, then verify opt-out stops requests.
- The public privacy notice URL is `https://zupulse.vercel.app/privacy.html`; deployment of that static page is still
  an external release step.
- The PostHog event retention policy and named access owner are still `TBD` and must be recorded before release.

## Current evidence

- Local fake ingestion: `pnpm demo:test:telemetry:e2e` and `pnpm desktop:test:telemetry:e2e`.
- Local packaged Desktop artifact: `pnpm desktop:package` and `node apps/desktop-shell/scripts/verify-package.mjs` passed,
  including CSP, bundled sample, no source maps, and no management credentials.
- Source-map contract: `node scripts/verify-source-map-artifacts.mjs require <build-dir>` plus `resolve <build-id>`
  for Browser/Main/Renderer, and the tagged workflow.
- Artifact guard: Browser `verify-assets.mjs`; Desktop package verification and source-map guard.
- External evidence intentionally remains pending until the release owner supplies the PostHog project and access
  governance details.

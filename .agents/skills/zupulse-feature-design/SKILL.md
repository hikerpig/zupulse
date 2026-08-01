---
name: zupulse-feature-design
description: Design an implementation-ready Zupulse feature, UI, and UX specification from a product requirement, grounded in the repository's current runtime behavior and a real Browser journey. Use when the user explicitly invokes `$zupulse-feature-design` or asks to turn a Zupulse product idea, workflow problem, UI redesign, or UX capability into a concrete Spec for engineers. Do not use for implementation, a small isolated bug fix, code-only architecture work, or generic visual inspiration unrelated to the current Zupulse product.
---

# Zupulse Feature Design

Turn an input requirement into a draft product Spec that an engineer can implement without rediscovering the product problem, current behavior, interaction contract, or major feasibility risks.

## Boundaries

- Design only. Do not implement production code, create an execution plan in `tasks/`, or mark behavior as delivered.
- Treat the user's requested outcome and scope as authoritative. The skill does not authorize commits, publishing, cloud sync, or unrelated cleanup.
- Write product design documents in Chinese. Keep identifiers, schemas, error codes, invariants, normative acceptance criteria, and other exact engineering contracts in English.
- Prefer one cohesive Spec over a collection of reports. Create a separate research artifact only when its evidence must remain independently auditable.
- Keep uncertain behavior explicit. Never turn an assumption, historical plan, or target gap into a current product fact.

## 1. Frame the Requirement

Extract and state:

- target users and the situation in which the problem occurs;
- the outcome users need, not merely the requested control or screen;
- affected product surfaces and hosts;
- known constraints, requested exclusions, and decisions already made;
- the smallest unresolved questions that would materially change behavior, architecture, security, compatibility, or scope.

Ask for human direction only for those material forks. Otherwise choose the smallest reversible assumption and record it in the Spec.

## 2. Establish the Current Product Baseline

Read current facts in this order:

1. Root `AGENTS.md`, `docs/architecture/README.md`, `CONTEXT.md`, and relevant terms in `docs/architecture/glossary.md`.
2. `docs/features/README.md` and the relevant Current Feature Contract.
3. `DESIGN.md` and the target surface's design rules.
4. Runtime UI, state composition, Zod schemas, persistence and host boundaries, tests, and the nearest current comparable implementation.
5. Current ADRs and architecture documents.
6. Existing Specs only as intended-change evidence; historical documents only as background.

Read the closest nested `AGENTS.md` before inspecting a package or app in depth. Report conflicts and trust the higher-ranked source.

Build a compact baseline covering:

- what users can do now;
- entry points, navigation, control hierarchy, and persisted versus session state;
- loading, empty, error, disabled, recovery, and destructive paths relevant to the requirement;
- Browser, Desktop, and iPad capability differences that actually affect the design;
- known gaps already declared by Current documents.

Do not broaden repository exploration beyond what is needed to establish this baseline and feasibility.

## 3. Exercise the Product

For an interaction or experience change, inspect the running product through the in-app Browser before recommending UX. Code reading alone is not product evidence.

1. Reuse an already running local app when safe; otherwise start the documented development entry point without changing persisted product data.
2. Execute the relevant journey as the named user role, beginning from a realistic entry state.
3. Observe visible hierarchy, copy, interaction cost, feedback, keyboard behavior, responsive behavior, and failure recovery.
4. Use an existing built-in sample when local Library state is unavailable. Treat a missing deep-linked Library Score as a recovery observation, not automatically as a Viewer defect.
5. Capture screenshots only when spatial evidence materially improves the Spec. Record the exact route, viewport, data/sample, and state.
6. Separate `Observed current behavior`, `Repository-declared behavior`, and `Proposed behavior`.

If the relevant journey cannot run, exhaust the documented local route and available sample data. Then label the evidence limitation and do not invent visual or interaction facts. Stop for user input only when the missing observation would materially change the chosen design.

## 4. Design the Product Behavior

Work from the user problem to the interface:

1. Define the target outcome, non-goals, and product principles for this change.
2. Model the end-to-end happy path before individual controls.
3. Place the capability in the existing information architecture and control hierarchy; justify any new surface.
4. Define progressive disclosure, defaults, persistence ownership, return behavior, cancellation, undo, and recovery.
5. Specify all materially distinct states and transitions, including cross-feature interactions.
6. Define desktop, narrow viewport, keyboard, focus, reduced-motion, Light, and Dark behavior where relevant.
7. Use user-facing copy concepts, but route final system copy through `@zupulse/app-i18n` and keep `web-core` semantic.

Apply `DESIGN.md` directly. In particular:

- keep the score or primary work surface visually dominant;
- use structure and boundaries before cards, shadows, pills, or extra color;
- preserve one primary scroll host per workspace;
- give only the true primary action coral emphasis;
- cover state with text, structure, or icons, not color alone;
- avoid marketing-page patterns inside Library, Viewer, and Studio.

Use a compact flow, state table, or ASCII wireframe only when it clarifies a relationship that prose would obscure. A wireframe expresses hierarchy and behavior, not final visual styling.

## 5. Check Feasibility and Product Integrity

Trace the proposed behavior through the actual architecture before finalizing it:

- identify the domain owner, UI owner, host capability, persistence owner, and cross-process boundary;
- preserve `web-core` purity and host-independent product semantics;
- preserve Library Score identity, Managed Score Copy immutability, and deletion cleanup invariants;
- validate persisted and cross-process inputs with Zod;
- do not expose Desktop absolute paths to Renderer;
- distinguish score-owned practice data, device preference, runtime Session state, and derived analysis data;
- prefer explicit structure and mappings over heuristics that can silently misclassify music or product state;
- check existing platform APIs and dependencies before proposing a new dependency.

When feasibility is uncertain, define a bounded technical gate with:

- the exact question to answer;
- representative fixtures and platforms;
- pass/fail evidence;
- the product fallback or stop condition.

Do not hide a feasibility gate inside acceptance criteria as if the solution were already proven.

## 6. Challenge the Design

Before writing the final Spec, test the proposal against:

- at least one simpler alternative and why it is insufficient;
- the named user roles separately rather than collapsing them into a generic user;
- interaction with existing playback, navigation, import, persistence, analysis, and deletion behavior where relevant;
- refresh, reopen, stale data, cancellation, partial failure, unavailable audio/files, and unsupported-score cases;
- accessibility and keyboard-only operation;
- narrow viewports and host capability asymmetry;
- accidental expansion into cloud sync, analytics, mobile, format support, or other current non-goals.

Remove speculative controls, decorative UI, fake precision, and implementation detail that does not constrain observable behavior.

## 7. Write the Engineering Handoff Spec

Copy and fill `assets/product-spec-template.md` into `docs/specs/YYYY-MM-DD-<slug>.md`.

- Start with `status: draft`; only a human-approved decision may change it to `approved`.
- Name the current Feature Contract and state clearly that the Spec is target behavior, not proof of current behavior.
- Keep the default Spec compact: baseline, problem and scope, proposed experience, behavior contract, constraints, and acceptance criteria.
- Add optional platform matrices, schemas, semantic error codes, feasibility gates, or open-decision sections only when they constrain implementation or expose material risk. Remove all empty template sections.
- Make UI placement, flows, states, responsive behavior, persistence, errors, and cross-feature interactions concrete enough to test.
- Express normative acceptance criteria as stable, observable English statements using `MUST`, `MUST NOT`, or `SHOULD` where appropriate.
- Use semantic error codes and schemas only when they materially constrain implementation.
- Put implementation sequencing and checkboxes in a later `tasks/` bundle, not the Spec.
- Update neither Current Feature Contracts nor `last_verified`; implementation must earn those changes with runtime verification.

## 8. Review and Hand Off

Review the draft against the input requirement, observed journey, Current contracts, `DESIGN.md`, architecture invariants, and every stated non-goal.

Run:

```sh
pnpm prettier --check <spec-path>
pnpm check:docs
git diff --check
```

Report the Spec path, product decision summary, evidence used, assumptions, feasibility gates, intentionally deferred choices, and actual command results. Present the document as a draft awaiting product approval, not as implemented behavior.

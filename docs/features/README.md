# Feature Contracts

A Feature Contract describes current observable product and domain behavior. It helps maintainers and AI
distinguish delivered capabilities, in-progress target gaps, and explicit non-goals. It is a Feature-oriented
navigation and behavior summary, not a replacement for runtime code, schemas, tests, Architecture, ADRs, or the
UI contract.

## Current Index

| Feature                    | Contract                                                                             | Status    | Delivery  |
| -------------------------- | ------------------------------------------------------------------------------------ | --------- | --------- |
| Harmony Analysis           | [`contracts/harmony-analysis.md`](contracts/harmony-analysis.md)                     | `current` | `partial` |
| Sheet Library              | [`contracts/sheet-library.md`](contracts/sheet-library.md)                           | `current` | `partial` |
| Viewer Playback Navigation | [`contracts/viewer-playback-navigation.md`](contracts/viewer-playback-navigation.md) | `current` | `partial` |

Create a Contract from [`templates/feature-contract.md`](templates/feature-contract.md). Keep a stable
`contracts/<feature-slug>.md` path while the Feature remains part of the product. Move a Contract to `archive/`
only after the Feature has been removed or superseded and is retained solely for traceability.

## Document Responsibilities

| Document         | Primary question                                               |
| ---------------- | -------------------------------------------------------------- |
| Feature Contract | What can users do now, and what are the behavioral boundaries? |
| Architecture     | How is the current system implemented?                         |
| ADR              | Why was a durable, difficult-to-reverse decision made?         |
| Spec             | What is a particular change intended to deliver?               |
| Plan / issue     | How will the change be implemented, and what is its progress?  |
| `DESIGN.md`      | Which UI, interaction, and visual rules must be followed?      |
| `CONTEXT.md`     | What do the product and domain terms mean?                     |

A Contract does not duplicate complete schemas, SQL, Bridge payloads, or implementation details. Its evidence
map links to those sources of truth. See
[`docs/conventions/documentation-gardening.md`](../conventions/documentation-gardening.md) for the deterministic
gate, PR impact report, and recurring semantic audit.

## Lifecycle

`status` determines whether a Contract can guide current behavior:

- `draft`: Still being formed; it is not a source of current facts.
- `current`: Verified against the current implementation and suitable for behavioral navigation.
- `deprecated`: The Feature still exists but is being retired; the replacement must be identified.
- `historical`: Retained only for traceability; it must not guide current implementation.

`delivery` describes how much of the Feature has been delivered:

- `planned`: No usable vertical slice exists.
- `in_progress`: Implementation is underway, but no stable usable capability exists yet.
- `partial`: Stable capabilities exist with explicit remaining gaps.
- `available`: The currently promised scope has been delivered.
- `retired`: The capability has been removed.

`status: current` and `delivery: partial` may coexist: the document accurately describes the current state while
the Feature still has known gaps. Update `last_verified` only after rechecking the relevant code or schemas and
running reproducible verification proportional to risk.

## AI Reading Rules

1. Before working on an existing or in-progress Feature, read this index and the corresponding Contract.
2. Only a `status: current` Contract may guide current behavior.
3. Never treat an in-progress target gap or `planned` content as current runtime behavior.
4. Follow the evidence map into code, schemas, database constraints, and tests. When sources conflict, trust the
   higher-ranked source and report that the Contract has drifted.
5. Architecture explains implementation structure, ADRs explain decisions, and Specs explain intended changes.
   None of them substitutes for runtime verification.

## Maintenance Workflow

1. Create a new `contracts/<feature-slug>.md` from the template with `status: draft` and `delivery: planned`.
2. For an existing Feature, build the evidence map from code, schemas, database constraints, and tests before
   documenting current behavior.
3. Record implementation targets only in the in-progress target-gap section and link the current Spec or issue.
4. After a behavioral change is verified, update current behavior, the platform matrix, known gaps, the evidence
   map, and `last_verified`.
5. When a Feature is superseded or removed, record the replacement relationship, set it to
   `historical` / `retired`, and then move it to `archive/`.

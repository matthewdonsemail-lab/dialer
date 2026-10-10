---
type: is
id: is-01m4d61cj8ktjxw0zt8h24jf6f
title: "Setup automation: verify JWT signing secret parity across machines"
kind: feature
status: open
priority: 1
version: 1
labels: []
dependencies: []
created_at: 2026-10-08T07:18:27.144Z
updated_at: 2026-10-08T07:18:27.144Z
---
## Goal
Provide a clone-to-ready setup and diagnostic workflow that proves the dialer JWT signing secret is consistent across every configured backend instance and configuration source relevant to this deployment, without exposing the secret or tying the check to a single user's token.

## Required Setup Contract
- Make `./scripts/setup.sh` the documented required first command after cloning, before starting the frontend or backend. Update the existing script, which currently installs packages, runs the legacy backend seed, and copies only `frontend/.env.example`; it does not create or validate the root `.env.local` that the backend actually loads.
- Make setup safe to rerun and cross-machine. It must explain prerequisites and report actionable missing/mismatched configuration without printing secret values or overwriting existing env files.
- Point clone/setup instructions in the README and contributor documentation at this same command. Provide a non-mutating verification mode usable on already configured machines.

## JWT Secret Parity Requirements
- Define the authoritative runtime/configuration sources and precedence explicitly: root `.env.local`, the current invoking shell's exported `JWT_SECRET`, each configured Tailscale-connected host's relevant environment/config file, and the deployed backend runtime where applicable. Account for the fact that shell variables can override dotenv values and that the backend loads the repository-root `.env.local`.
- Inspect each source independently so a matching effective value cannot hide a stale or conflicting lower-priority source. Include all backend instances that can mint or verify sessions; make the machine/instance inventory explicit and extensible rather than assuming one named person or one workstation.
- Compare secret equality using a safe fingerprint/challenge mechanism. Never print, log, persist, transmit, or attach the raw `JWT_SECRET`; do not put it in command arguments, process listings, shell history, or bead output. Report only source/instance labels, presence, validity (at least 32 characters), and matching/mismatching status.
- Use Tailscale SSH only for explicitly configured/approved tailnet hosts, with bounded timeouts and clear unreachable/unauthorized results. Do not silently skip a host and report parity as passing.
- Confirm the runtime used for `/api/oauth/session` signing and `/api/auth/me` verification is the same deployment/configuration, and report uncertainty where a platform does not expose runtime secret comparison.
- Require successful parity/validity verification before setup reports ready to run the app. Include a repair path that tells an operator which labeled source is inconsistent and how to synchronize it without disclosing the value.

## Acceptance Criteria
1. A fresh clone can run the documented `./scripts/setup.sh` command and receive deterministic setup instructions for required root backend configuration and optional frontend configuration.
2. Existing local env files are preserved; rerunning setup is safe and has a documented `--check` (or equivalent) read-only mode.
3. The check separately evaluates the process environment, root `.env.local`, every configured Tailscale host source, and each configured backend runtime/instance. It detects missing, too-short, and different JWT secrets, including a shell override that masks a stale file value.
4. Equality is tested without revealing or storing raw secrets. Logs, stdout/stderr, shell history, process arguments, and generated artifacts contain no secret values.
5. A failed, unavailable, or incomplete host/runtime check cannot produce a green parity result. Output names the failed source and next remediation step.
6. The signer/verifier check covers all backend instances in the configured deployment inventory and does not depend on a particular user's identity or JWT.
7. Documentation states that contributors must run `./scripts/setup.sh` after cloning and explains how to configure the machine inventory and Tailscale access.
8. The existing successful OAuth sign-in path and local development startup remain usable after the setup changes.

## Blocker
Blocked on `dialer-suyp`: finish the investigation of the reported production session rejection and attach its confirmed `/api/oauth/session` and `/api/auth/me` evidence. Use that result to define the initial set of signing and verification instances; keep production diagnosis separate from secret-parity implementation.

## Out of Scope
- Copying or synchronizing raw secrets automatically across hosts or production providers.
- Changing the OAuth identity model, Twenty token introspection, or member resolution.
- Declaring production healthy based only on public OAuth configuration or an unauthenticated health endpoint.

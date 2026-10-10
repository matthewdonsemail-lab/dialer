# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (October 2026)
- Power dialing: dial lists (`callCampaign`), a global dialer dock with recents,
  contacts, keypad, queue, live-call notes and script, and an after-call summary
- Contact workspace: details and people, one timeline, and panels for the call
  summary, readable record history, script, notes, and website and video
- Shared state machines for contact status, outreach, video, call result, dial
  lists and offers, enforced by the API and the screens
- `bun run twenty:schema`: creates every object, field and relation the dialer
  uses in a Twenty workspace, from one manifest; `twenty:schema:check` dry run
- `bun run twenty:seed`: the demo workspace (fictional, refuses real workspaces)
- `bun run screenshots`: every page and tab captured from the demo workspace
- `./scripts/setup.sh`: install, env files, schema check, `--apply`, `--seed`
- AST commit checks (naming, layout, dead buttons, toggle state, pipeline
  values), Conventional Commits, branch names, and a full pre-push gate

### Changed (October 2026)
- Whole repo moved to a camelCase `domains/<domain>/<primitive>` layout
- README rewritten around the screenshots and the open-source setup

### Fixed (October 2026)
- The contacts list showed Interested, Callback and Not Interested as New
- Semi-transparent brand tints written as `bg-[var(--x)]/NN` never rendered

### Added
- Self-hosted backend with SQLite database
- Express.js API server with JWT authentication
- Twenty CRM integration for member authentication
- PostgreSQL password hash verification for Twenty credentials
- Tailscale deployment support for node01
- Docker Compose deployment
- GitHub Actions CI workflow
- Comprehensive documentation
- Data seeder with sample leads

### Changed
- Rebranded from "Apex Precision Billing" to "Cold Dialer"
- Rebranded from "Cold Dialer" to "Open Twenty Dialer"
- Replaced Supabase auth with Twenty CRM credential verification
- Removed Supabase dependency entirely
- Updated hooks to use backend API exclusively

### Fixed
- Removed hardcoded email from dev user
- Updated .env.example with all configuration options
- Expanded .gitignore for better security

## [1.0.0] - 2026-01-XX

### Added
- Initial release
- React + Vite + TypeScript frontend
- Self-hosted backend with SQLite
- Twenty CRM integration
- SIP.js softphone with SignalWire support
- Lead management with CSV import
- Campaign management
- Call history and logging
- Dashboard with analytics
- Admin panel

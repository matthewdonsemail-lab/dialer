# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- WAVV-style single-line power dialer: floating dialer card, call campaigns stored in Twenty, campaign statistics and history
- WAVV dispositions (Positive / Negative) that update the contact's status
- Settings -> Audio Source: computer audio with device pickers and a test, plus phone audio (Call me / Dial in) over Telnyx Call Control
- Reports (Overview, Number Health, Team Performance, Disposition Report) replacing the Dashboard
- Shared typed data table, light / dark / system theme, Settings page, Font Awesome 6 Solid icons
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
- Valid dialer sessions were discarded after sign-in (JWT decoder rejected padded payloads)
- Do Not Contact was saved as NEW in Twenty; lead statuses did not read back after a reload
- Light theme was force-darkened by Opera GX and Chrome auto dark mode
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

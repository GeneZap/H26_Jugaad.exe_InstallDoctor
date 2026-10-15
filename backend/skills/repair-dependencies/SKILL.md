---
name: repair-dependencies
description: Investigate Python dependency compatibility failures using InstallDoctor. Use for inconsistent installations, dependency-related runtime crashes, and evidence-backed candidate repairs with a Dependency Exit Capsule.
---

# Repair Python dependencies

Use the original InstallDoctor runner, not a hardcoded package fix.

## Prerequisites

Install the repository's backend with `python -m pip install -e .` from backend/.
Start Docker Desktop. Configure INSTALLDOCTOR_MODEL to a working local open-weight Ollama model.
Use INSTALLDOCTOR_AI_PROVIDER=hermes for the event's Hermes integration.
Treat trusted-local mode as dependency isolation only, never as a security sandbox.

## Procedure

1. Obtain a public GitHub HTTPS repository URL.
2. Run `install-doctor <repository-url>` from the backend environment. Use `--analyze-only` for inspection without repair.
3. Read the final JSON for job status and the evidence directory.
4. Read capsule.json and report.md, following actual log references.
5. Separate observed source facts, AI-proposed changes and executed verification.
6. If blocked, report the exact blocker. Do not claim Docker/model execution that did not occur.
7. Review repair.patch, original test counts and source-derived contracts before describing a repair as verified.
8. Share the capsule and its verification scope. Do not edit tests, disable checks or manufacture results.

One proposal is attempted per job. Do not loop indefinitely. A new repair attempt is a new job.

## Verification and reuse

Require installation, dependency-check, pytest and applicable contract results for each requested route.
Accept verified_for_executed_checks only within its stated scope; report needs_review and skipped checks honestly.
Support Python 3.12 projects with root requirements.txt/pyproject.toml and pytest.
Discover each repository's declarations and imports dynamically. LinkWatch is a demonstration target, not a prewritten answer.
The backend owns execution and evidence; Hermes provides the diagnosis and candidate proposal.
See backend/README.md and backend/docs/API.md in the project repository for setup and HTTP integration.

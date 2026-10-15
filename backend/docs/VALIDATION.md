# Validation record

Date: 15 October 2026. Runtimes: Linux, Python 3.12.14 and 3.13.16 (API/controller).

## Backend checks

- 25 unit/API tests passed on each of Python 3.12 and 3.13; the network integration test is opt-in
  and skipped in the default suite. The target-repository worker still requires Python 3.12.
- Ruff static checks passed.
- Agent Skills frontmatter/naming validation passed.
- A separate skill forward test invoked the installed CLI with analyze-only on the real LinkWatch target.

Tests cover URL validation, manifest discovery, explicit contract extraction, local-import false positives,
patch paths and hashes, original-test protections, pytest configuration protection, JSON proposal parsing,
verification verdicts, API errors/events/artifact allowlists, cancellation/timeout behaviour and hosted-endpoint rejection.
Ollama HTTP and Hermes subprocess adapter tests use mocks, clearly separated from real model execution.

## Real repository execution

Target: https://github.com/rishrek/LinkWatch
Commit: f52f3930c8e7c33d934ccf614955a38e26984bd5.
Runner: explicitly authorized trusted-local virtual environments, NOT Docker.

| Check | requirements.txt route | pyproject.toml route |
|---|---|---|
| Original install | Passed | Passed |
| Original dependency metadata check | Passed | Passed |
| Original tests | 9 passed, 1 failed | 9 passed, 1 failed |
| Original Pydantic | 1.10.13 | 2.14.1 |
| Source-derived whitespace contract | Passed | Failed |

Both report tests failed because Jinja2 2.11.3 imports unavailable markupsafe.soft_unicode with MarkupSafe 3.0.4.
The second installation route leaves the source-declared whitespace stripping contract unsatisfied.

## Full pipeline integration test

Command: INSTALLDOCTOR_RUN_INTEGRATION=1 python -m pytest backend/tests/test_integration.py -q -s
Result: 1 passed in 108.60 seconds.

The test performs real GitHub cloning, two baseline installations, actual pytest and contract probes,
candidate patch validation, two candidate installations, result comparison and ZIP export.
Its proposal is a deterministic TEST FIXTURE, not AI inference: both manifests are changed to Jinja2>=3.1,<4
and Pydantic==1.10.13. Both candidate routes passed all 10 original tests and the inferred contract probe.
The verdict was verified_for_executed_checks. The original repository source/tests remained unchanged.
The ZIP was checked to exclude virtual environments and include the repair patch.

This test establishes orchestration and verification for that supplied patch. It does NOT establish that
Hermes or an arbitrary model will autonomously generate a correct repair.

## Not verified here

- Live Hermes CLI, Ollama inference and model-generated repair: no Hermes/model service is installed here.
- Docker execution: Docker is unavailable in this environment. Container command construction is implemented,
  but the image and mount behaviour must be checked on the team's Docker Desktop installation.
- Windows execution: start.ps1 was reviewed but native Windows/PowerShell was not available for execution.
  It checks prerequisites and stops on failures; run it on the team's Windows computer before judging.
- Behaviour outside the executed tests and inferred contracts; other repositories or Python versions.

Before judging: configure the real local model, exact model source/version/license, verify Hermes CLI flags,
start Docker Desktop, run /api/health, and demonstrate a real repair job. Keep the fixture-based integration
test labelled accurately; do not show it as an autonomous AI repair.

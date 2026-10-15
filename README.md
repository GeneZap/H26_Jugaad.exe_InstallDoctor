# InstallDoctor - Jugaad.exe

Track 2: an evidence-driven Python dependency maintenance capability with a FastAPI backend and reusable
Hermes skill. Inspect a repository, reproduce failures, propose a local-model repair, verify it and export evidence.

Start with [backend/README.md](backend/README.md). Frontend developers: [backend/docs/API.md](backend/docs/API.md).
Validation and limitations: [backend/docs/VALIDATION.md](backend/docs/VALIDATION.md).

Root application: unchanged snapshot of the organizer's [LinkWatch](https://github.com/rishrek/LinkWatch),
commit f52f3930c8e7c33d934ccf614955a38e26984bd5. Original MIT attribution is retained. Our implementation is
in backend/ and uses a separate environment from the target application.

Working components: asynchronous jobs, progress polling, dynamic inspection, isolated baseline/candidate
execution, patch validation, independent checks and capsule downloads. Hermes and direct Ollama adapters
are included; an implemented adapter does not mean a live model was tested in this environment.

The team must configure its chosen model's exact tag/source/license. No credentials or weights are committed.
This repository was created separately and is not a native GitHub fork; confirm organizer acceptance.

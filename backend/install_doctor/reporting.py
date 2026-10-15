import hashlib
import json
import zipfile
from pathlib import Path

from .models import Job


def export(job: Job, evidence: Path, inspection: dict, settings):
    capsule = {"schema_version": "1.0", "job": job.model_dump(),
               "ai": {"provider": settings.provider, "model": settings.model,
                      "access_method": "local Hermes CLI with loopback inference" if settings.provider == "hermes" else settings.provider,
                      "model_source": settings.model_source,
                      "model_license": settings.model_license},
               "inspection": inspection,
               "evidence_policy": {"observed": "Repository inspection", "ai_proposed": "Unverified model recommendation",
                                   "execution_verified": "Recorded command outcomes only"},
               "limitations": inspection.get("limitations", []) + [
                   "No vulnerability scoring is performed.",
                   "Only Python 3.12, root requirements.txt/pyproject.toml and pytest are supported in this prototype.",
                   "Docker limits processes/resources but is not a hardened hostile-code multi-tenant service.",
                   "Package installation needs network access; target tests may also access the network.",
                   "trusted-local mode is a virtual environment, NOT a security sandbox.",
                   "No model-generated proposal is represented as verified before recorded checks pass."]}
    (evidence / "capsule.json").write_text(json.dumps(capsule, indent=2))
    lines = ["# Dependency Exit Capsule", "", f"Repository: {job.request.repository_url}",
             f"Commit: {job.source_commit}", f"Status: {job.status}", f"AI: {settings.provider} / {settings.model or 'not configured'}",
             "", "## Observed findings"]
    lines += [f"- {f['id']}: {f['message']} ({f.get('path', f.get('dependency', 'manifest'))})" for f in job.findings]
    for label, runs in [("Baseline execution", job.baseline), ("Candidate execution", job.candidate)]:
        lines += ["", f"## {label}"]
        for run in runs:
            lines += [f"- Route: {run['route']}; tests: {run.get('tests')}; blocked: {run.get('blocked', 'no')}"]
            lines += [f"  - {s['name']}: exit {s['exit_code']}; log: {s['log']}" for s in run.get("steps", [])]
    lines += ["", "## AI-proposed changes", job.proposal.get("summary", "No AI proposal produced") if job.proposal else "No AI proposal produced",
              "", "## Verification verdict", json.dumps(job.verdict, indent=2), "", "## Limitations"]
    lines += [f"- {item}" for item in capsule["limitations"]]
    if job.error:
        lines += ["", "## Error or blocker", job.error]
    (evidence / "report.md").write_text("\n".join(lines))
    # Hashes are computed by the controller after execution. Include only explicit evidence files.
    entries = [p for p in evidence.rglob("*") if p.is_file() and not p.is_symlink()
               and not any(part.endswith("-venv") or part == ".venv" for part in p.relative_to(evidence).parts)
               and p.resolve().is_relative_to(evidence.resolve()) and "advisor-workspace" not in p.parts
               and p.name not in {"capsule.zip", "checksums.json"} and p.suffix in {".json", ".log", ".xml", ".txt", ".md", ".patch"}]
    hashes = {p.relative_to(evidence).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in entries}
    (evidence / "checksums.json").write_text(json.dumps(hashes, indent=2))
    with zipfile.ZipFile(evidence / "capsule.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for p in entries + [evidence / "checksums.json"]:
            archive.write(p, p.relative_to(evidence))
    job.artifacts = sorted([p.relative_to(evidence).as_posix() for p in entries] + ["checksums.json", "capsule.zip"])

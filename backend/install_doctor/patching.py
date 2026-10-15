import ast
import difflib
import tomllib
from pathlib import Path, PurePosixPath

from .inspection import digest
from .models import Proposal


def apply_proposal(root: Path, proposal: Proposal, max_bytes=100_000) -> str:
    total = sum(len(c.content.encode()) for c in proposal.changes)
    if total > max_bytes:
        raise ValueError("Proposed patch exceeds size limit")
    prepared = []
    seen = set()
    for change in proposal.changes:
        path = PurePosixPath(change.path)
        if path.is_absolute() or ".." in path.parts or "\\" in change.path or any(p.startswith(".") for p in path.parts):
            raise ValueError("Invalid patch path")
        if change.path in seen:
            raise ValueError("Duplicate patch path")
        seen.add(change.path)
        if "tests" in path.parts or path.name.startswith(("test_", "conftest")):
            raise ValueError("Original tests may not be modified")
        if path.suffix not in {".py", ".toml", ".txt"}:
            raise ValueError("Only existing Python source and dependency manifests may be changed")
        file = root / path
        if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(root.resolve()):
            raise ValueError("Patch must refer to an existing regular repository file")
        original = file.read_text()
        if digest(original) != change.original_sha256:
            raise ValueError(f"Stale or incorrect original hash for {path}")
        if not change.content.strip():
            raise ValueError("Cannot replace a file with empty content")
        if path.suffix == ".py":
            ast.parse(change.content)
        if path.suffix == ".toml":
            new = tomllib.loads(change.content)
            old = tomllib.loads(original)
            if old.get("tool", {}).get("pytest") != new.get("tool", {}).get("pytest"):
                raise ValueError("Pytest configuration may not be changed by a repair")
        prepared.append((file, original, change.content))
    # Validate the entire proposal before writing any file.
    diffs = []
    for file, original, content in prepared:
        rel = file.relative_to(root).as_posix()
        diffs.extend(difflib.unified_diff(original.splitlines(keepends=True), content.splitlines(keepends=True),
                                         fromfile=f"a/{rel}", tofile=f"b/{rel}"))
        file.write_text(content)
    return "".join(diffs)


def verdict(baseline: list, candidate: list) -> dict:
    checks = []
    originals = {r["route"]: r for r in baseline}
    for run in candidate:
        route = run["route"]
        before = originals.get(route, {})
        steps = run.get("steps", [])
        tests = run.get("tests") or {}
        before_tests = before.get("tests") or {}
        counts_ok = tests.get("tests", 0) > 0 and tests.get("tests", 0) >= before_tests.get("tests", 0)
        skips_ok = tests.get("skipped", 0) <= before_tests.get("skipped", 0)
        complete = {s["name"] for s in steps} >= {"install", "dependency-check", "tests", "probes"}
        probes = run.get("probes", [])
        probes_ok = all(p["status"] == "passed" for p in probes)
        ok = complete and not run.get("blocked") and all(s["exit_code"] == 0 for s in steps) and counts_ok and skips_ok and probes_ok
        checks.append({"route": route, "passed": ok, "tests": tests, "test_count_preserved": counts_ok,
                       "skips_not_increased": skips_ok, "all_inferred_contracts_verified": probes_ok})
    success = bool(checks) and len(checks) == len(baseline) and all(c["passed"] for c in checks)
    return {"status": "verified_for_executed_checks" if success else "needs_review", "routes": checks,
            "scope": "This verdict covers recorded tests and inferred contracts only; it is not a guarantee for all behaviours."}

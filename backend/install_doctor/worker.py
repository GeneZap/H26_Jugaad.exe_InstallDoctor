"""Standalone worker. Runs only inside Docker or explicitly trusted local execution."""
import argparse
import importlib.metadata
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def run_probe(root, contracts):
    import importlib
    sys.path.insert(0, str(root))
    results = []
    for contract in contracts:
        record = {"contract": contract, "status": "skipped"}
        try:
            cls = getattr(importlib.import_module(contract["module"]), contract["class"])
            values = {field: "  example  " for field in contract["fields"]}
            for field in values:
                if field in {"url", "uri", "website"}:
                    values[field] = "https://example.com"
            instance = cls(**values)
            record["values"] = {field: getattr(instance, field) for field in values}
            mismatches = [field for field, value in values.items() if getattr(instance, field) != value.strip()]
            record["status"] = "failed" if mismatches else "passed"
            record["mismatched_fields"] = mismatches
        except Exception as exc:
            record["reason"] = f"{type(exc).__name__}: {exc}"
        results.append(record)
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--route", choices=["requirements", "package"], required=True)
    parser.add_argument("--contracts", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    result = {"route": args.route, "python": sys.version, "steps": [], "packages": {}, "probes": [], "tests": None}

    def command(name, argv, cwd):
        log = output / f"{name}.log"
        started = time.monotonic()
        print(f"[{name}] running", flush=True)
        with log.open("w") as stream:
            try:
                proc = subprocess.run(argv, cwd=cwd, stdout=stream, stderr=subprocess.STDOUT, timeout=180,
                                      env={**os.environ, "PIP_DISABLE_PIP_VERSION_CHECK": "1", "PYTHONUNBUFFERED": "1"})
                code = proc.returncode
            except subprocess.TimeoutExpired:
                code = 124
        result["steps"].append({"name": name, "argv": argv, "exit_code": code,
                                "duration_seconds": round(time.monotonic() - started, 3), "log": log.name})
        print(f"[{name}] exit={code}", flush=True)
        return code

    try:
        if sys.version_info[:2] != (3, 12):
            raise RuntimeError("This prototype requires Python 3.12 for target execution; choose the correct executable")
        with tempfile.TemporaryDirectory(prefix="install-doctor-run-") as directory:
            root = Path(directory) / "repo"
            shutil.copytree(args.repo, root, ignore=shutil.ignore_patterns(".git", ".venv", "__pycache__", "*.egg-info"))
            argv = [sys.executable, "-m", "pip", "install"]
            if args.route == "requirements":
                argv += ["-r", "requirements.txt"]
            else:
                argv += ["."]
            if (root / "requirements-dev.txt").exists():
                argv += ["-r", "requirements-dev.txt"]
            argv += ["pytest"]
            if command("install", argv, root) != 0:
                result["blocked"] = "Dependency installation failed; tests were not run."
            else:
                result["packages"] = {d.metadata["Name"]: d.version for d in importlib.metadata.distributions()}
                command("dependency-check", [sys.executable, "-m", "pip", "check"], root)
                xml = output / "tests.xml"
                command("tests", [sys.executable, "-m", "pytest", "-q", f"--junitxml={xml}"], root)
                if xml.is_file() and not xml.is_symlink():
                    suites = list(ET.parse(xml).getroot().iter("testsuite"))
                    result["tests"] = {key: sum(int(s.get(key, 0)) for s in suites)
                                       for key in ("tests", "failures", "errors", "skipped")}
                contracts = json.loads(Path(args.contracts).read_text())
                # A child isolates import state from this worker; output is captured independently.
                probe_path = output / "probe-results.json"
                command("probes", [sys.executable, __file__, "--probe", str(root), args.contracts, str(probe_path)], root)
                if probe_path.is_file() and not probe_path.is_symlink():
                    result["probes"] = json.loads(probe_path.read_text())
                result["contract_count"] = len(contracts)
    except Exception as exc:
        result["blocked"] = f"{type(exc).__name__}: {exc}"
    (output / "result.json").write_text(json.dumps(result, indent=2))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--probe":
        root, specs, out = sys.argv[2:]
        results = run_probe(Path(root), json.loads(Path(specs).read_text()))
        Path(out).write_text(json.dumps(results, indent=2, default=str))
        sys.exit(1 if any(p["status"] == "failed" for p in results) else 0)
    main()

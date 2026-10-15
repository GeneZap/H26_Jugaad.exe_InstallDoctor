import ast
import hashlib
import re
import tomllib
from pathlib import Path

from packaging.requirements import InvalidRequirement, Requirement

IGNORE = {".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache", ".install-doctor"}
MANIFESTS = ("requirements.txt", "requirements-dev.txt", "pyproject.toml")


def digest(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def source_files(root: Path):
    for p in sorted(root.rglob("*")):
        if any(part in IGNORE for part in p.relative_to(root).parts):
            continue
        if p.is_symlink():
            raise ValueError(f"Repository symlinks are not supported: {p.relative_to(root)}")
        if p.is_file():
            yield p


def inspect(root: Path) -> dict:
    files = {}
    usages = []
    contracts = []
    findings = []
    declarations = []
    for p in source_files(root):
        rel = p.relative_to(root).as_posix()
        if p.suffix == ".py" and p.stat().st_size < 50_000:
            text = p.read_text(errors="replace")
            files[rel] = {"sha256": digest(text), "content": text}
            try:
                tree = ast.parse(text)
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    modules = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
                    for module in modules:
                        usages.append({"path": rel, "line": node.lineno, "module": module,
                                       "statement": ast.get_source_segment(text, node)})
                    if isinstance(node, ast.ImportFrom) and node.level == 0 and any(a.name.startswith("_") for a in node.names):
                        findings.append({"kind": "private_api", "status": "observed", "path": rel,
                                         "line": node.lineno, "message": "Imports a private dependency interface"})
            for cls in [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]:
                fields = [n.target.id for n in cls.body if isinstance(n, ast.AnnAssign)
                          and isinstance(n.target, ast.Name) and isinstance(n.annotation, ast.Name)
                          and n.annotation.id == "str"]
                legacy = any(isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and
                             t.id == "anystr_strip_whitespace" for t in n.targets)
                             and isinstance(n.value, ast.Constant) and n.value.value is True for n in ast.walk(cls))
                if legacy and fields:
                    module = rel.removesuffix(".py").replace("/", ".")
                    contracts.append({"module": module, "class": cls.name, "fields": fields,
                                      "path": rel, "line": cls.lineno,
                                      "expected": "strip_whitespace", "basis": "Source Config.anystr_strip_whitespace=True"})
                    findings.append({"kind": "legacy_configuration", "status": "observed", "path": rel,
                                     "line": cls.lineno, "message": "Model declares version-1 whitespace configuration"})
    for name in MANIFESTS:
        p = root / name
        if not p.exists():
            continue
        text = p.read_text()
        files[name] = {"sha256": digest(text), "content": text}
        if name.endswith(".toml"):
            entries = tomllib.loads(text).get("project", {}).get("dependencies", [])
        else:
            entries = [line.split(" #", 1)[0].strip() for line in text.splitlines()
                       if line.strip() and not line.lstrip().startswith(("#", "-"))]
        for entry in entries:
            try:
                req = Requirement(entry)
                declarations.append({"name": re.sub(r"[-_.]+", "-", req.name.lower()),
                                     "specifier": str(req.specifier), "marker": str(req.marker or ""), "path": name})
            except InvalidRequirement:
                findings.append({"kind": "unsupported_requirement", "status": "observed", "path": name,
                                 "message": f"Could not parse declaration: {entry}"})
    groups = {}
    for dec in declarations:
        groups.setdefault(dec["name"], []).append(dec)
    for name, group in groups.items():
        requirements = [d for d in group if d["path"] == "requirements.txt"]
        package = [d for d in group if d["path"] == "pyproject.toml"]
        for a in requirements:
            for b in package:
                if (a["specifier"], a["marker"]) != (b["specifier"], b["marker"]):
                    # Different ranges are not necessarily disjoint. Exact pins can be checked deterministically.
                    exact = a["specifier"].removeprefix("==") if a["specifier"].startswith("==") else None
                    conflict = bool(exact and "*" not in exact and not a["marker"] and not b["marker"]
                                    and not Requirement(name + b["specifier"]).specifier.contains(exact))
                    findings.append({"kind": "manifest_conflict" if conflict else "manifest_drift",
                                     "status": "observed", "dependency": name, "declarations": [a, b],
                                     "message": "Installation routes declare different requirements"})
    for i, finding in enumerate(findings, 1):
        finding["id"] = f"F{i:03}"
    # Keep context bounded. Original hashes remain checked before a patch is accepted.
    budget = 75_000
    selected = {}
    for key, value in sorted(files.items(), key=lambda item: (item[0] not in MANIFESTS, item[0])):
        if len(value["content"]) <= budget:
            selected[key] = value
            budget -= len(value["content"])
    return {"findings": findings, "declarations": declarations, "usages": usages,
            "contracts": contracts, "files": selected,
            "limitations": ["Static import tracing does not establish all dynamic imports or package maintenance status.",
                            "Different version ranges are reported as drift unless an exact-pin conflict is established.",
                            "Whitespace contract probes are inferred from explicit source settings; other contracts need tests."]}

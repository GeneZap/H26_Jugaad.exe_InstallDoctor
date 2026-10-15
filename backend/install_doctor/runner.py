import json
import shutil
import subprocess
import sys
from pathlib import Path
from threading import Event
from uuid import uuid4

from .config import Settings
from .process import execute


class Runner:
    def __init__(self, settings: Settings):
        self.settings = settings

    def available(self):
        if self.settings.runner == "trusted-local":
            return bool(shutil.which(self.settings.python))
        if not shutil.which("docker"):
            return False
        try:
            return subprocess.run(["docker", "info"], capture_output=True, timeout=8).returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            return False

    def run(self, source: Path, output: Path, route: str, contracts: list, cancel: Event):
        output.mkdir(parents=True, exist_ok=True)
        spec = output / "contracts.json"
        spec.write_text(json.dumps(contracts))
        worker = Path(__file__).with_name("worker.py").resolve()
        docker_name = f"install-doctor-{uuid4().hex[:12]}"
        if self.settings.runner == "docker":
            args = ["docker", "run", "--rm", "--name", docker_name, "--init", "--cap-drop=ALL",
                    "--security-opt=no-new-privileges", "--pids-limit=128", "--memory=2g", "--cpus=2",
                    "-v", f"{source.resolve()}:/input:ro", "-v", f"{output.resolve()}:/evidence",
                    "-v", f"{worker}:/worker.py:ro", self.settings.docker_image,
                    "python", "/worker.py", "--repo", "/input", "--output", "/evidence",
                    "--route", route, "--contracts", "/evidence/contracts.json"]
        else:
            env_path = output.parent.parent / "environments" / output.name
            env_path.parent.mkdir(parents=True, exist_ok=True)
            code = execute([self.settings.python, "-m", "venv", str(env_path)], cwd=output,
                           log=output / "create-env.log", timeout=60, cancel=cancel)
            if code:
                return {"route": route, "blocked": "Could not create local virtual environment", "steps": []}
            python = env_path / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
            args = [str(python), str(worker), "--repo", str(source.resolve()), "--output", str(output.resolve()),
                    "--route", route, "--contracts", str(spec.resolve())]
        try:
            code = execute(args, cwd=output, log=output / "execution.log", timeout=self.settings.command_timeout,
                           cancel=cancel)
        finally:
            if self.settings.runner == "docker":
                subprocess.run(["docker", "rm", "-f", docker_name], capture_output=True, timeout=15)
        result_path = output / "result.json"
        safe_result = result_path.is_file() and not result_path.is_symlink() and result_path.resolve().is_relative_to(output.resolve())
        result = json.loads(result_path.read_text()) if safe_result else {
            "route": route, "steps": [], "blocked": f"Runner did not finish (exit {code}); see execution.log"}
        result["runner"] = self.settings.runner
        result["execution_exit_code"] = code
        result["evidence_directory"] = output.name
        for step in result.get("steps", []):
            # Container-produced metadata cannot choose a controller-side filesystem path.
            step["log"] = f"{output.name}/{Path(step['log']).name}"
        return result

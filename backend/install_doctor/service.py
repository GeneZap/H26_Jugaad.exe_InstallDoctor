import json
import re
import shutil
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from .ai import Advisor
from .config import Settings
from .inspection import inspect, source_files
from .models import Job, JobRequest, utcnow
from .patching import apply_proposal, verdict
from .process import Cancelled, execute
from .reporting import export
from .runner import Runner

ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")


class JobService:
    def __init__(self, settings: Settings, advisor=None, runner=None):
        self.settings = settings
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.advisor = advisor or Advisor(settings)
        self.runner = runner or Runner(settings)
        self.pool = ThreadPoolExecutor(max_workers=settings.max_workers, thread_name_prefix="install-doctor")
        self.lock = threading.RLock()
        self.jobs = {}
        self.cancellations = {}
        for file in settings.data_dir.glob("*/job.json"):
            try:
                job = Job.model_validate_json(file.read_text())
                if job.status in {"queued", "running"}:
                    job.status = "blocked"
                    job.error = "Backend restarted during execution; create a new job to rerun."
                self.jobs[job.id] = job
                self.save(job)
            except (ValueError, OSError):
                continue

    def directory(self, job_id):
        if not ID_PATTERN.fullmatch(job_id):
            raise KeyError(job_id)
        return self.settings.data_dir / job_id

    def save(self, job):
        with self.lock:
            job.updated_at = utcnow()
            directory = self.directory(job.id)
            directory.mkdir(parents=True, exist_ok=True)
            tmp = directory / "job.json.tmp"
            tmp.write_text(job.model_dump_json(indent=2))
            tmp.replace(directory / "job.json")

    def event(self, job, phase, message):
        with self.lock:
            job.phase = phase
            job.events.append({"sequence": len(job.events) + 1, "time": utcnow(), "phase": phase, "message": message})
            self.save(job)

    def get(self, job_id):
        self.directory(job_id)
        with self.lock:
            if job_id not in self.jobs:
                raise KeyError(job_id)
            return self.jobs[job_id].model_copy(deep=True)

    def create(self, request: JobRequest, start=True):
        with self.lock:
            if sum(j.status in {"queued", "running"} for j in self.jobs.values()) >= 5:
                raise ValueError("Job queue is full; wait for a running job")
            job = Job(id=uuid4().hex, request=request)
            self.jobs[job.id] = job
            self.cancellations[job.id] = threading.Event()
            self.save(job)
            if start:
                self.pool.submit(self.run, job.id)
            return job.model_copy(deep=True)

    def cancel(self, job_id):
        job = self.get(job_id)
        if job.status in {"queued", "running"}:
            self.cancellations[job_id].set()
        return {"id": job_id, "cancellation_requested": job.status in {"queued", "running"}}

    def run(self, job_id):
        job = self.jobs[job_id]
        cancel = self.cancellations[job_id]
        directory = self.directory(job_id)
        evidence = directory / "evidence"
        evidence.mkdir(exist_ok=True)
        inventory = {"limitations": [], "files": {}}
        try:
            if cancel.is_set():
                raise Cancelled()
            job.status = "running"
            self.event(job, "cloning", "Cloning public GitHub repository into a private job workspace")
            source = directory / "source"
            args = ["git", "-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=never",
                    "clone", "--depth", "1", "--no-recurse-submodules", job.request.repository_url, str(source)]
            if execute(args, cwd=directory, log=evidence / "clone.log", timeout=60, cancel=cancel):
                raise RuntimeError("Clone failed; check clone.log. Only public GitHub HTTPS repositories are supported.")
            total = sum(p.stat().st_size for p in source_files(source))
            if total > self.settings.max_repo_bytes:
                raise RuntimeError("Repository exceeds prototype size limit")
            if execute(["git", "rev-parse", "HEAD"], cwd=source, log=evidence / "source-commit.txt", timeout=10, cancel=cancel):
                raise RuntimeError("Could not identify source commit")
            job.source_commit = (evidence / "source-commit.txt").read_text().strip()
            self.event(job, "inspecting", "Reading manifests, imports and explicit configuration contracts")
            inventory = inspect(source)
            job.findings = inventory["findings"]
            (evidence / "inspection.json").write_text(json.dumps(inventory, indent=2))
            self.save(job)
            if not self.runner.available():
                raise RuntimeError("Execution runner unavailable. Start Docker Desktop, or explicitly select trusted-local for reviewed repositories.")
            routes = []
            if (source / "requirements.txt").exists():
                routes.append("requirements")
            if (source / "pyproject.toml").exists() and (job.request.compare_installations or not routes):
                routes.append("package")
            if not routes:
                raise RuntimeError("No supported root dependency manifest found")
            for route in routes:
                self.event(job, "baseline", f"Recording original installation and tests: {route}")
                job.baseline.append(self.runner.run(source, evidence / f"baseline-{route}", route, inventory["contracts"], cancel))
                self.save(job)
            if job.request.mode == "analyze":
                job.verdict = {"status": "analysis_only", "message": "No repair or AI verification claimed"}
            else:
                self.event(job, "proposing", f"Requesting a repository-specific proposal through {self.settings.provider}")
                proposal = self.advisor.propose(inventory, job.baseline, evidence, cancel)
                job.proposal = proposal.model_dump()
                (evidence / "proposal.json").write_text(proposal.model_dump_json(indent=2))
                if cancel.is_set():
                    raise Cancelled()
                if not proposal.changes:
                    job.verdict = {"status": "needs_review", "message": "AI returned no justified patch"}
                else:
                    candidate = directory / "candidate"
                    shutil.copytree(source, candidate, ignore=shutil.ignore_patterns(".git"))
                    self.event(job, "patching", "Validating file hashes and preparing a candidate; original tests remain unchanged")
                    patch = apply_proposal(candidate, proposal, self.settings.max_patch_bytes)
                    (evidence / "repair.patch").write_text(patch)
                    (evidence / "candidate-inspection.json").write_text(json.dumps(inspect(candidate), indent=2))
                    for route in routes:
                        self.event(job, "verifying", f"Running the candidate with the original contracts: {route}")
                        job.candidate.append(self.runner.run(candidate, evidence / f"candidate-{route}", route, inventory["contracts"], cancel))
                        self.save(job)
                    job.verdict = verdict(job.baseline, job.candidate)
                    if any(f["kind"] == "manifest_conflict" for f in inspect(candidate)["findings"]):
                        job.verdict["status"] = "needs_review"
                        job.verdict["remaining_manifest_conflict"] = True
            job.status = "completed"
        except Cancelled:
            job.status = "cancelled"
            job.error = "Cancellation requested; incomplete checks are not verified"
        except Exception as exc:
            job.status = "blocked"
            job.error = str(exc)
            (evidence / "controller-error.log").write_text(traceback.format_exc())
        finally:
            self.event(job, "exporting", "Exporting findings, model proposal and execution evidence")
            export(job, evidence, inventory, self.settings)
            self.event(job, job.status, job.error or "Job finished; inspect the verification verdict")

    def shutdown(self):
        for event in self.cancellations.values():
            event.set()
        self.pool.shutdown(wait=False, cancel_futures=True)

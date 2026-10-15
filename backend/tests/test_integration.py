"""Opt-in network/process integration. The advisor is a test fixture, NOT a real AI run."""
import os

import pytest

from install_doctor.config import Settings
from install_doctor.models import Change, JobRequest, Proposal
from install_doctor.service import JobService


class FixtureAdvisor:
    def propose(self, inspection, baseline, evidence_dir, cancel):
        changes = []
        # Known expected patch only for testing orchestration. No production hardcoded repair exists.
        for path in ["requirements.txt", "pyproject.toml"]:
            original = inspection["files"][path]
            content = original["content"].replace("Jinja2==2.11.3", "Jinja2>=3.1,<4")
            content = content.replace('"pydantic>=2"', '"pydantic==1.10.13"')
            changes.append(Change(path=path, original_sha256=original["sha256"], content=content,
                                  reason="Deterministic integration fixture; no model invoked"))
        return Proposal(summary="Integration fixture only", diagnosis="Known patch to exercise the real runner",
                        evidence_refs=["baseline-requirements/tests.log"], changes=changes,
                        limitations=["This is not AI inference and does not test Hermes or Docker"])


@pytest.mark.skipif(os.getenv("INSTALLDOCTOR_RUN_INTEGRATION") != "1", reason="Requires network and reviewed local execution")
def test_real_linkwatch_repair_pipeline(tmp_path):
    settings = Settings(data_dir=tmp_path, runner="trusted-local", provider="none", python="python3.12")
    service = JobService(settings, advisor=FixtureAdvisor())
    try:
        job = service.create(JobRequest(repository_url="https://github.com/rishrek/LinkWatch"), start=False)
        service.run(job.id)
        result = service.get(job.id)
        assert result.status == "completed", result.error
        assert result.verdict["status"] == "verified_for_executed_checks", result.verdict
        assert len(result.baseline) == len(result.candidate) == 2
        assert all(run["tests"]["failures"] == 1 for run in result.baseline)
        assert all(run["tests"]["failures"] == 0 for run in result.candidate)
        assert "capsule.zip" in result.artifacts
        import zipfile
        evidence = service.directory(job.id) / "evidence"
        with zipfile.ZipFile(evidence / "capsule.zip") as archive:
            assert not any("site-packages" in name or "-venv/" in name for name in archive.namelist())
            assert "repair.patch" in archive.namelist()
    finally:
        service.shutdown()

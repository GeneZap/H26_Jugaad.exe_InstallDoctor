import json
import threading

import pytest
from fastapi.testclient import TestClient

from install_doctor.ai import parse_proposal
from install_doctor.api import create_app
from install_doctor.config import Settings
from install_doctor.inspection import digest, inspect
from install_doctor.models import Change, JobRequest, Proposal, normalize_repo_url
from install_doctor.patching import apply_proposal, verdict
from install_doctor.process import Cancelled, execute
from install_doctor.service import JobService


@pytest.mark.parametrize("url", ["http://github.com/a/b", "https://github.com.evil/a/b", "https://u:p@github.com/a/b",
                                 "https://github.com/a/b?token=x", "file:///tmp/repo", "https://github.com/../b"])
def test_repo_url_rejects_nonpublic_or_malformed_sources(url):
    with pytest.raises(ValueError):
        normalize_repo_url(url)


def test_repo_url_normalizes_git_suffix():
    assert normalize_repo_url("https://github.com/rishrek/LinkWatch") == "https://github.com/rishrek/LinkWatch.git"
    assert normalize_repo_url("https://github.com/rishrek/LinkWatch.git") == "https://github.com/rishrek/LinkWatch.git"


def test_inspection_discovers_conflict_and_source_contract(tmp_path):
    (tmp_path / "requirements.txt").write_text("pydantic==1.10.13\nrequests>=2\n")
    (tmp_path / "pyproject.toml").write_text('[project]\ndependencies=["pydantic>=2", "requests>=2.1"]\n')
    (tmp_path / "models.py").write_text('from pydantic import BaseModel\nclass Customer(BaseModel):\n    name: str\n    class Config:\n        anystr_strip_whitespace=True\n')
    result = inspect(tmp_path)
    assert any(f["kind"] == "manifest_conflict" and f["dependency"] == "pydantic" for f in result["findings"])
    assert any(f["kind"] == "manifest_drift" and f["dependency"] == "requests" for f in result["findings"])
    assert result["contracts"][0]["class"] == "Customer"


def test_relative_private_names_are_not_dependency_findings(tmp_path):
    (tmp_path / "local.py").write_text("from . import __version__\nfrom requests.utils import _parse_content_type_header\n")
    private = [f for f in inspect(tmp_path)["findings"] if f["kind"] == "private_api"]
    assert len(private) == 1
    assert private[0]["line"] == 2


def proposal(path, original, content):
    return Proposal(summary="repair", diagnosis="observed", evidence_refs=["F001"],
                    changes=[Change(path=path, original_sha256=digest(original), content=content, reason="compatibility")])


@pytest.mark.parametrize("path", ["../outside.py", "/tmp/out.py", "tests/test_a.py", "conftest.py", ".env", "a\\b.py"])
def test_patch_rejects_traversal_and_test_changes(tmp_path, path):
    with pytest.raises(ValueError):
        apply_proposal(tmp_path, proposal(path, "x=1\n", "x=2\n"))


def test_patch_hash_and_atomic_validation(tmp_path):
    file = tmp_path / "app.py"
    file.write_text("x=1\n")
    bad = proposal("app.py", "different", "x=2\n")
    with pytest.raises(ValueError, match="hash"):
        apply_proposal(tmp_path, bad)
    assert file.read_text() == "x=1\n"
    good = proposal("app.py", "x=1\n", "x=2\n")
    patch = apply_proposal(tmp_path, good)
    assert "+x=2" in patch
    assert file.read_text() == "x=2\n"


def test_model_cannot_disable_pytest(tmp_path):
    original = '[tool.pytest.ini_options]\ntestpaths=["tests"]\n'
    (tmp_path / "pyproject.toml").write_text(original)
    with pytest.raises(ValueError, match="Pytest"):
        apply_proposal(tmp_path, proposal("pyproject.toml", original, '[project]\nname="x"\n'))


def test_parse_hermes_json_with_console_wrapping():
    raw = 'Hermes response:\n```json\n' + proposal("app.py", "a", "b").model_dump_json() + '\n```'
    assert parse_proposal(raw).changes[0].path == "app.py"
    with pytest.raises(ValueError):
        parse_proposal("All fixed, trust me")


def successful_run(tests=10, skipped=0):
    return {"route": "requirements", "steps": [{"name": n, "exit_code": 0} for n in
            ["install", "dependency-check", "tests", "probes"]],
            "tests": {"tests": tests, "failures": 0, "errors": 0, "skipped": skipped}, "probes": []}


def test_verdict_rejects_missing_checks_dropped_tests_and_skips():
    before = [successful_run()]
    assert verdict(before, [successful_run()])["status"] == "verified_for_executed_checks"
    assert verdict(before, [successful_run(9)])["status"] == "needs_review"
    assert verdict(before, [successful_run(10, 1)])["status"] == "needs_review"
    assert verdict(before, [{"route": "requirements", "steps": []}])["status"] == "needs_review"
    run = successful_run()
    run["probes"] = [{"status": "failed"}]
    assert verdict(before, [run])["status"] == "needs_review"


def test_api_contract_validation_events_and_artifact_allowlist(tmp_path):
    settings = Settings(data_dir=tmp_path, provider="none")
    service = JobService(settings)
    app = create_app(settings, service)
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert client.post("/api/jobs", json={"repository_url": "file:///etc"}).status_code == 422
        job = service.create(JobRequest(repository_url="https://github.com/example/repo"), start=False)
        service.event(service.jobs[job.id], "inspecting", "test event")
        response = client.get(f"/api/jobs/{job.id}/events?after=0").json()
        assert response["events"][0]["message"] == "test event"
        assert client.get(f"/api/jobs/{job.id}/artifacts/job.json").status_code == 404
        assert client.get("/api/jobs/not-an-id").status_code == 404
        assert client.post(f"/api/jobs/{job.id}/cancel").json()["cancellation_requested"]


def test_process_records_timeout_and_cancellation(tmp_path):
    import sys
    event = threading.Event()
    assert execute([sys.executable, "-c", "import time;time.sleep(5)"], cwd=tmp_path,
                   log=tmp_path / "timeout.log", timeout=0, cancel=event) == 124
    event.set()
    with pytest.raises(Cancelled):
        execute([sys.executable, "-c", "import time;time.sleep(5)"], cwd=tmp_path,
                log=tmp_path / "cancel.log", timeout=10, cancel=event)


def test_hosted_ollama_endpoint_rejected(tmp_path):
    with pytest.raises(ValueError, match="loopback"):
        Settings(data_dir=tmp_path, ollama_url="https://inference.example.com")


def test_model_timeout_from_environment(monkeypatch):
    monkeypatch.setenv("INSTALLDOCTOR_MODEL_TIMEOUT", "600")
    assert Settings().model_timeout == 600
    monkeypatch.setenv("INSTALLDOCTOR_MODEL_TIMEOUT", "0")
    with pytest.raises(ValueError, match="must be positive"):
        Settings()


def test_ollama_adapter_requests_schema_and_preserves_response(tmp_path, monkeypatch):
    import httpx

    import install_doctor.ai as module
    body = proposal("app.py", "x=1", "x=2").model_dump_json()
    real_client = httpx.Client

    def handle(request):
        assert request.url.host == "127.0.0.1"
        payload = json.loads(request.content)
        assert payload["model"] == "test-model"
        assert payload["format"]["type"] == "object"
        return httpx.Response(200, json={"message": {"content": body}})

    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handle)))
    advisor = module.Advisor(Settings(data_dir=tmp_path, provider="ollama", model="test-model"))
    result = advisor.propose({"files": {}}, [], tmp_path, threading.Event())
    assert result.summary == "repair"
    assert (tmp_path / "ai-response.txt").read_text() == body


def test_hermes_adapter_uses_explicit_local_provider_and_query_file(tmp_path, monkeypatch):
    import install_doctor.ai as module
    body = proposal("app.py", "x=1", "x=2").model_dump_json()
    monkeypatch.setattr(module.shutil, "which", lambda _: "/test/hermes")

    def fake_execute(args, **kwargs):
        assert "--query-file" in args and "--ignore-user-config" in args
        assert args[args.index("--provider") + 1] == "custom"
        assert args[args.index("--base-url") + 1] == "http://127.0.0.1:11434/v1"
        kwargs["log"].write_text("Hermes response:\n" + body)
        return 0

    monkeypatch.setattr(module, "execute", fake_execute)
    advisor = module.Advisor(Settings(data_dir=tmp_path, provider="hermes", model="test-model"))
    assert advisor.propose({"files": {}}, [], tmp_path, threading.Event()).summary == "repair"


def test_nebius_adapter_uses_jiraya_model_and_structured_output(tmp_path, monkeypatch):
    import httpx

    import install_doctor.ai as module
    body = proposal("app.py", "x=1", "x=2").model_dump_json()
    real_client = httpx.Client

    def handle(request):
        assert str(request.url) == "https://api.tokenfactory.nebius.com/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-secret"
        payload = json.loads(request.content)
        assert payload["model"] == "nvidia/Nemotron-3_5-Lightning"
        assert payload["chat_template_kwargs"] == {"enable_thinking": False}
        assert payload["response_format"]["json_schema"]["schema"]["type"] == "object"
        assert payload["max_tokens"] == 8192
        return httpx.Response(200, json={"choices": [{"message": {"content": body}, "finish_reason": "stop"}],
                                        "usage": {"completion_tokens": 200}})

    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handle)))
    settings = Settings(data_dir=tmp_path, provider="nebius", nebius_api_key="test-secret")
    assert "test-secret" not in repr(settings)
    assert module.Advisor(settings).propose({"files": {}}, [], tmp_path, threading.Event()).summary == "repair"
    metadata = json.loads((tmp_path / "ai-metadata.json").read_text())
    assert metadata["finish_reason"] == "stop"
    assert "test-secret" not in "".join(p.read_text() for p in tmp_path.glob("*.json"))


@pytest.mark.parametrize("status", [401, 429, 500])
def test_nebius_http_failure_does_not_leak_credentials(tmp_path, monkeypatch, status):
    import httpx

    import install_doctor.ai as module
    real_client = httpx.Client
    transport = httpx.MockTransport(lambda request: httpx.Response(status, text="echo test-secret"))
    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: real_client(transport=transport))
    settings = Settings(data_dir=tmp_path, provider="nebius", nebius_api_key="test-secret")
    with pytest.raises(RuntimeError, match=f"Nebius HTTP {status}") as error:
        module.Advisor(settings).propose({}, [], tmp_path, threading.Event())
    assert "test-secret" not in str(error.value)
    assert "test-secret" not in (tmp_path / "ai-metadata.json").read_text()


@pytest.mark.parametrize("content,reason", [("", "stop"), ("", "length"), ('{"summary":', "length")])
def test_ollama_empty_or_truncated_response_preserves_diagnostics(tmp_path, monkeypatch, content, reason):
    import httpx

    import install_doctor.ai as module
    real_client = httpx.Client

    def handle(request):
        payload = json.loads(request.content)
        assert payload["think"] is False
        assert payload["options"]["num_predict"] == 8192
        return httpx.Response(200, json={"message": {"content": content, "thinking": "reasoning"},
                                        "done_reason": reason, "eval_count": 128})

    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handle)))
    settings = Settings(data_dir=tmp_path, provider="ollama", model="test")
    with pytest.raises(RuntimeError, match="output token limit" if reason == "length" else "empty final"):
        module.Advisor(settings).propose({}, [], tmp_path, threading.Event())
    metadata = json.loads((tmp_path / "ai-metadata.json").read_text())
    assert metadata["eval_count"] == 128
    assert metadata["thinking_characters"] == 9


def test_nebius_rejects_missing_key_and_untrusted_endpoint(tmp_path):
    from install_doctor.ai import Advisor
    settings = Settings(data_dir=tmp_path, provider="nebius", nebius_api_key="")
    with pytest.raises(RuntimeError, match="NEBIUS_API_KEY"):
        Advisor(settings).propose({}, [], tmp_path, threading.Event())
    with pytest.raises(ValueError, match="NEBIUS_BASE_URL"):
        Settings(provider="nebius", nebius_base_url="https://example.com/v1/")


def test_nebius_health_and_capsule_label_hosted_without_key(tmp_path):
    from install_doctor.reporting import export
    settings = Settings(data_dir=tmp_path, provider="nebius", nebius_api_key="test-secret")
    service = JobService(settings)
    with TestClient(create_app(settings, service)) as client:
        health = client.get("/api/health").json()
        assert health["inference_location"] == "hosted"
        assert health["api_key_configured"] is True
        assert "test-secret" not in json.dumps(health)
        job = service.create(JobRequest(repository_url="https://github.com/example/repo"), start=False)
        evidence = tmp_path / "evidence"
        evidence.mkdir()
        export(job, evidence, {}, settings)
        capsule = (evidence / "capsule.json").read_text()
        assert "hosted Nebius Token Factory API" in capsule
        assert "Hermes was not used" in capsule
        assert "test-secret" not in capsule

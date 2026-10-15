import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import Settings
from .models import Job, JobRequest
from .service import JobService


def create_app(settings: Settings | None = None, service: JobService | None = None):
    settings = settings or Settings()
    service = service or JobService(settings)

    @asynccontextmanager
    async def lifespan(app):
        yield
        service.shutdown()

    app = FastAPI(title="InstallDoctor", version="0.1.0", lifespan=lifespan,
                  description="Local maintenance workbench. Use /docs for the frontend API contract.")
    app.state.service = service
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    def get_job(job_id):
        try:
            return service.get(job_id)
        except KeyError:
            raise HTTPException(404, "Job not found") from None

    @app.get("/api/health")
    def health():
        return {"status": "ok", "runner": settings.runner, "runner_available": service.runner.available(),
                "ai_provider": settings.provider, "model": settings.model,
                "hermes_installed": bool(shutil.which(settings.hermes_bin)),
                "model_configured": bool(settings.model), "local_service": True,
                "inference_location": "hosted" if settings.provider == "nebius" else "local",
                "api_key_configured": bool(settings.nebius_api_key) if settings.provider == "nebius" else None,
                "runner_warning": "Not a security sandbox" if settings.runner == "trusted-local" else None}

    @app.post("/api/jobs", response_model=Job, status_code=202)
    def create_job(request: JobRequest):
        try:
            return service.create(request)
        except ValueError as exc:
            raise HTTPException(429, str(exc)) from None

    @app.get("/api/jobs", response_model=list[Job])
    def jobs():
        with service.lock:
            return sorted([j.model_copy(deep=True) for j in service.jobs.values()], key=lambda j: j.created_at, reverse=True)

    @app.get("/api/jobs/{job_id}", response_model=Job)
    def job(job_id: str):
        return get_job(job_id)

    @app.get("/api/jobs/{job_id}/events")
    def events(job_id: str, after: int = Query(0, ge=0)):
        job = get_job(job_id)
        return {"status": job.status, "phase": job.phase,
                "events": [e for e in job.events if e["sequence"] > after]}

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel(job_id: str):
        get_job(job_id)
        return service.cancel(job_id)

    @app.get("/api/jobs/{job_id}/artifacts/{artifact:path}")
    def artifact(job_id: str, artifact: str):
        job = get_job(job_id)
        if artifact not in job.artifacts:
            raise HTTPException(404, "Artifact unavailable")
        base = service.directory(job_id) / "evidence"
        file = (base / artifact).resolve()
        if not file.is_relative_to(base.resolve()) or not file.is_file():
            raise HTTPException(404, "Artifact unavailable")
        media = {".json": "application/json", ".zip": "application/zip"}.get(file.suffix, "text/plain")
        return FileResponse(file, media_type=media, filename=Path(artifact).name)

    return app


app = create_app()

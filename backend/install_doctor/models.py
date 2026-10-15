import re
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

REPO_PATTERN = re.compile(r"https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$")


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def normalize_repo_url(value: str) -> str:
    match = REPO_PATTERN.fullmatch(value.strip())
    if not match or any(part.startswith(".") or part.endswith(".") for part in match.groups()):
        raise ValueError("Use a public https://github.com/owner/repository URL without credentials or query")
    return f"https://github.com/{match[1]}/{match[2]}.git"


class JobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repository_url: str = Field(max_length=250)
    mode: Literal["analyze", "repair"] = "repair"
    compare_installations: bool = True

    @field_validator("repository_url")
    @classmethod
    def validate_repo(cls, value):
        return normalize_repo_url(value)


class Change(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str
    original_sha256: str
    content: str
    reason: str


class Proposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    diagnosis: str
    evidence_refs: list[str]
    changes: list[Change] = Field(default_factory=list, max_length=8)
    limitations: list[str] = Field(default_factory=list)


class Job(BaseModel):
    id: str
    request: JobRequest
    status: Literal["queued", "running", "completed", "blocked", "failed", "cancelled"] = "queued"
    phase: str = "queued"
    created_at: str = Field(default_factory=utcnow)
    updated_at: str = Field(default_factory=utcnow)
    events: list[dict] = Field(default_factory=list)
    findings: list[dict] = Field(default_factory=list)
    baseline: list[dict] = Field(default_factory=list)
    candidate: list[dict] = Field(default_factory=list)
    proposal: dict | None = None
    verdict: dict | None = None
    error: str | None = None
    artifacts: list[str] = Field(default_factory=list)
    source_commit: str | None = None

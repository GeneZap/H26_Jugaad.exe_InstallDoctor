import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("INSTALLDOCTOR_DATA_DIR", ".install-doctor")).resolve())
    runner: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_RUNNER", "docker"))
    python: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_PYTHON", "python3.12"))
    docker_image: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_DOCKER_IMAGE", "python:3.12-slim"))
    provider: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_AI_PROVIDER", "hermes"))
    model: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_MODEL", ""))
    nebius_api_key: str = field(default_factory=lambda: os.getenv("NEBIUS_API_KEY", ""), repr=False)
    nebius_base_url: str = field(default_factory=lambda: os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/"))
    nebius_model: str = field(default_factory=lambda: os.getenv("NEBIUS_MODEL", "nvidia/Nemotron-3_5-Lightning"))
    max_output_tokens: int = field(default_factory=lambda: int(os.getenv("INSTALLDOCTOR_MAX_OUTPUT_TOKENS", "8192")))
    ollama_think: bool = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_OLLAMA_THINK", "false").lower() == "true")
    model_source: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_MODEL_SOURCE", "Not supplied"))
    model_license: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_MODEL_LICENSE", "Not supplied"))
    ollama_url: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_OLLAMA_URL", "http://127.0.0.1:11434"))
    hermes_bin: str = field(default_factory=lambda: os.getenv("INSTALLDOCTOR_HERMES_BIN", "hermes"))
    hermes_provider: str = "custom"
    command_timeout: int = 240
    model_timeout: int = field(default_factory=lambda: int(os.getenv("INSTALLDOCTOR_MODEL_TIMEOUT", "180")))
    max_repo_bytes: int = 20_000_000
    max_patch_bytes: int = 100_000
    max_workers: int = 1
    cors_origins: list[str] = field(default_factory=lambda: os.getenv(
        "INSTALLDOCTOR_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    ).split(","))

    def __post_init__(self):
        if self.model_timeout <= 0:
            raise ValueError("INSTALLDOCTOR_MODEL_TIMEOUT must be positive")
        if self.runner not in {"docker", "trusted-local"}:
            raise ValueError("INSTALLDOCTOR_RUNNER must be docker or trusted-local")
        if self.provider not in {"hermes", "ollama", "nebius", "none"}:
            raise ValueError("INSTALLDOCTOR_AI_PROVIDER must be hermes, ollama, nebius or none")
        # Local mode must not silently become hosted inference.
        from urllib.parse import urlparse
        if urlparse(self.ollama_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Ollama endpoint must be on loopback; hosted inference is not enabled")
        if self.max_output_tokens <= 0:
            raise ValueError("INSTALLDOCTOR_MAX_OUTPUT_TOKENS must be positive")
        if self.provider == "nebius":
            if not self.model:
                self.model = self.nebius_model
            url = urlparse(self.nebius_base_url)
            if (url.scheme != "https" or url.hostname != "api.tokenfactory.nebius.com"
                    or url.username or url.password or url.port not in {None, 443}
                    or url.path.rstrip("/") != "/v1" or url.query or url.fragment):
                raise ValueError("NEBIUS_BASE_URL must be https://api.tokenfactory.nebius.com/v1/")

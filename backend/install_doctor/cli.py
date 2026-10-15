import argparse
import json

from .config import Settings
from .models import JobRequest
from .service import JobService


def main():
    parser = argparse.ArgumentParser(description="InstallDoctor maintenance capability")
    parser.add_argument("repository_url")
    parser.add_argument("--analyze-only", action="store_true")
    parser.add_argument("--single-route", action="store_true")
    args = parser.parse_args()
    service = JobService(Settings())
    try:
        request = JobRequest(repository_url=args.repository_url, mode="analyze" if args.analyze_only else "repair",
                             compare_installations=not args.single_route)
        job = service.create(request, start=False)
        service.run(job.id)
        result = service.get(job.id)
        print(json.dumps({"id": result.id, "status": result.status, "verdict": result.verdict,
                          "error": result.error, "evidence": str(service.directory(job.id) / "evidence")}, indent=2))
        if result.status != "completed":
            raise SystemExit(1)
    finally:
        service.shutdown()


if __name__ == "__main__":
    main()

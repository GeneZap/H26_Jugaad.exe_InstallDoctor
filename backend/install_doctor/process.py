import os
import signal
import subprocess
import time
from pathlib import Path
from threading import Event


class Cancelled(Exception):
    pass


def execute(args: list[str], *, cwd: Path, log: Path, timeout: int, cancel: Event) -> int:
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("w", encoding="utf-8") as output:
        process = subprocess.Popen(args, cwd=cwd, stdout=output, stderr=subprocess.STDOUT,
                                   stdin=subprocess.DEVNULL, start_new_session=os.name != "nt")
        started = time.monotonic()
        reason = None
        while process.poll() is None:
            if cancel.is_set():
                reason = "cancelled"
            elif time.monotonic() - started > timeout:
                reason = f"timed out after {timeout}s"
            elif log.stat().st_size > 2_000_000:
                reason = "output limit exceeded"
            if reason:
                if os.name != "nt":
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                else:
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
                process.wait()
                break
            time.sleep(0.1)
        if reason:
            output.write(f"\nInstallDoctor: {reason}\n")
            output.flush()
            if cancel.is_set():
                raise Cancelled()
            return 124
        return process.returncode

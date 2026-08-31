"""Run the Agent Moneyball API and web app as one local process group."""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"


def start(command: list[str], cwd: Path) -> subprocess.Popen:
    options: dict[str, object] = {"cwd": cwd}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options["start_new_session"] = True
    return subprocess.Popen(command, **options)


def stop(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            process.terminate()
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        if process.poll() is None:
            if os.name == "nt":
                process.kill()
            else:
                os.killpg(process.pid, signal.SIGKILL)


def main() -> int:
    if not (ROOT / ".env").exists():
        print("Missing .env. Run: cp .env.example .env, then add OPENAI_API_KEY.", file=sys.stderr)
        return 2

    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        print("npm is unavailable. Run this command through Pixi: pixi run app", file=sys.stderr)
        return 2

    if not (FRONTEND / "node_modules").exists():
        print("Installing frontend dependencies (first run only)...")
        installed = subprocess.run([npm, "install"], cwd=FRONTEND, check=False)
        if installed.returncode:
            return installed.returncode

    print("\nAgent Moneyball local stack")
    print("  Web: http://localhost:3000")
    print("  API: http://localhost:8000")
    print("  API docs: http://localhost:8000/docs")
    print("  Stop both services: Ctrl+C\n")

    api = start(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.main:app",
            "--reload",
            "--reload-dir",
            "backend",
        ],
        ROOT,
    )
    web = start([npm, "run", "dev"], FRONTEND)
    processes = [api, web]

    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.25)
        failed = next(process for process in processes if process.poll() is not None)
        return failed.returncode or 0
    except KeyboardInterrupt:
        return 0
    finally:
        for process in reversed(processes):
            stop(process)


if __name__ == "__main__":
    raise SystemExit(main())

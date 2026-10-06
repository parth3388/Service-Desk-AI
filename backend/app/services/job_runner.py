"""
Tiny in-process background job runner for the AI pipeline.

Why not FastAPI BackgroundTasks?  BackgroundTasks run inside the ASGI
request lifecycle (Starlette's TestClient and ASGI test transports do not
return until they finish), give no bound on concurrent work, and their
threads are joined at shutdown — Ctrl+C would wait for a multi-minute
Whisper run. This runner is a fixed pool of DAEMON threads pulling from a
queue, so:

  * the HTTP request returns as soon as the job is queued,
  * concurrency is bounded (PIPELINE_WORKERS),
  * a killed server simply leaves the report in an in-progress status, which
    the existing stale-run reclaim (PIPELINE_STALE_MINUTES) recovers.

The database status column stays the single source of truth; nothing here
is persisted. It is process-local by design (single-worker deployment, like
the Whisper lock and the rate limiter).
"""

import logging
import queue
import threading
import time
from collections import OrderedDict

from app.core import config

logger = logging.getLogger(__name__)


class JobRunner:

    def __init__(self, workers: int):
        self._workers = max(1, workers)
        self._queue: queue.Queue = queue.Queue()
        self._threads: list[threading.Thread] = []
        self._start_lock = threading.Lock()

    def _ensure_started(self) -> None:

        if self._threads:
            return

        with self._start_lock:

            if self._threads:
                return

            for index in range(self._workers):
                thread = threading.Thread(
                    target=self._work,
                    name=f"pipeline-worker-{index + 1}",
                    daemon=True,
                )
                thread.start()
                self._threads.append(thread)

    def _work(self) -> None:

        while True:

            fn, args, kwargs = self._queue.get()

            try:
                fn(*args, **kwargs)
            except Exception:
                # A job must never take a worker thread down.
                logger.exception("Background job crashed")
            finally:
                self._queue.task_done()

    def submit(self, fn, *args, **kwargs) -> None:
        """Queue `fn(*args, **kwargs)`; returns immediately."""

        self._ensure_started()
        self._queue.put((fn, args, kwargs))

    def wait_idle(self, timeout: float = 30.0) -> bool:
        """
        Block until every queued job has finished (used by tests and
        graceful checks). Returns False on timeout.
        """

        deadline = time.monotonic() + timeout

        while self._queue.unfinished_tasks:

            if time.monotonic() > deadline:
                return False

            time.sleep(0.01)

        return True

    @property
    def unfinished(self) -> int:
        return self._queue.unfinished_tasks


runner = JobRunner(config.PIPELINE_WORKERS)


class FailureReasons:
    """
    Bounded, thread-safe map report_id -> user-safe failure message.

    The report table has no column for a failure reason and the schema is
    intentionally untouched, so the reason lives here for the status
    endpoint. After a server restart the endpoint falls back to a generic
    message; the FAILED status itself is always in the database.
    """

    DEFAULT_MESSAGE = "Processing failed. Please try again."

    def __init__(self, limit: int = 2000):
        self._limit = limit
        self._data: OrderedDict[int, str] = OrderedDict()
        self._lock = threading.Lock()

    def set(self, report_id: int, message: str) -> None:

        with self._lock:
            self._data[report_id] = message
            self._data.move_to_end(report_id)

            while len(self._data) > self._limit:
                self._data.popitem(last=False)

    def get(self, report_id: int) -> str:

        with self._lock:
            return self._data.get(report_id, self.DEFAULT_MESSAGE)

    def clear(self, report_id: int | None = None) -> None:

        with self._lock:
            if report_id is None:
                self._data.clear()
            else:
                self._data.pop(report_id, None)


failure_reasons = FailureReasons()

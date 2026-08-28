"""Cross-platform peak-RSS reader for the Story 4.2 proof. Windows has no `resource` module."""

import psutil

_process = psutil.Process()


def peak_rss_mb() -> float:
    return _process.memory_info().rss / (1024 * 1024)

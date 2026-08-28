"""Enumerate the Python side of the dependency tree with a licence per package.

Story 6.4. `scripts/licence-audit.mjs` is the entry point and spawns this with
`--json`; it is a separate file because the Python tree can only be read from
Python's own installed-distribution metadata, and reimplementing that by parsing
`dist-info` directories from Node would be a second, worse copy of
`importlib.metadata`.

What it reads: the distributions actually installed on this machine, starting
from the packages our three requirements files pin, and walking `Requires-Dist`
transitively. It reads what is *installed*, not what a resolver would pick
today, because `docs/licence-policy.md` says to record the licence at the
version pinned, and the installed distribution is that version.

Extras are skipped. A dependency only guarded by `extra == "..."` is not
installed by a plain `pip install -r requirements.txt`, so it is not in the
tree we ship. Environment markers other than `extra` are kept: whether a
package is installed already answers them for this machine.

`shapely` is expected to be absent — `services/ingestion/requirements.txt`
records why, and `test_service.py::test_geos_is_never_loaded` holds the line.
"""

from __future__ import annotations

import argparse
import importlib.metadata as md
import json
import sys
from pathlib import Path

# The three requirements files, and what role each plays. The role travels with
# every package the file roots, because "ships at runtime" and "generated the
# fixture once" are different licence exposures and the report must not blur
# them.
ROOTS: dict[str, dict[str, object]] = {
    "services/ingestion/requirements.txt": {
        "role": "runtime",
        "note": "The ingestion service itself — this is what ships and runs.",
    },
    "services/ingestion/requirements-fixtures.txt": {
        "role": "build-time",
        "note": "The sample-report generator. Its output is committed; the tool is not run on the box.",
    },
    "services/ingestion/proof/requirements-proof.txt": {
        "role": "proof-tooling",
        "note": "The timeboxed engine proofs (Stories 4.2 and the RapidOCR swap). Not imported by the service.",
    },
}


def normalise(name: str) -> str:
    """PEP 503 style: the name `pip` and `importlib.metadata` agree on."""
    return name.lower().replace("_", "-").replace(".", "-")


def read_pins(path: Path) -> list[str]:
    """The `name==version` lines of a requirements file, as bare names."""
    names = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        for sep in ("==", ">=", "<=", "~=", ">", "<", "!="):
            if sep in line:
                line = line.split(sep, 1)[0]
                break
        names.append(normalise(line.split("[", 1)[0].strip()))
    return names


def requires(name: str) -> list[str]:
    """Direct, non-extra dependencies of an installed distribution."""
    try:
        raw = md.requires(name) or []
    except md.PackageNotFoundError:
        return []
    out = []
    for spec in raw:
        marker = spec.split(";", 1)[1] if ";" in spec else ""
        if "extra" in marker:
            continue
        dep = spec.split(";", 1)[0]
        for sep in ("==", ">=", "<=", "~=", ">", "<", "!=", "[", "("):
            if sep in dep:
                dep = dep.split(sep, 1)[0]
        dep = dep.strip()
        if dep:
            out.append(normalise(dep))
    return out


def licence_of(dist: md.Distribution) -> tuple[str, str]:
    """The declared licence and how it was read.

    Order matters. `License-Expression` (PEP 639) is an SPDX expression and is
    the only field that is machine-readable by construction, so it wins. The
    legacy `License` field is free text and is sometimes the entire licence
    body, so it is only used when short. Classifiers are the last resort and
    are coarse — "BSD License" does not say which BSD.
    """
    meta = dist.metadata
    expression = meta.get("License-Expression")
    if expression:
        return expression.strip(), "License-Expression (SPDX) in METADATA"

    legacy = (meta.get("License") or "").strip()
    if legacy and len(legacy) <= 64 and "\n" not in legacy:
        return legacy, "License field in METADATA"

    classifiers = [
        c.split("::")[-1].strip()
        for c in (meta.get_all("Classifier") or [])
        if c.startswith("License ::")
    ]
    if classifiers:
        return "; ".join(classifiers), "Trove classifier in METADATA (coarse — no SPDX id)"

    if legacy:
        return legacy.splitlines()[0][:64], "License field in METADATA (truncated free text)"
    return "", "not declared"


def licence_files(dist: md.Distribution) -> list[str]:
    """Licence texts shipped inside the distribution, relative to site-packages.

    `docs/licence-policy.md` asks for the licence read from the `LICENSE` file
    at the pinned version rather than from a summary. These are the files that
    make that possible, listed so a reviewer can open them.
    """
    found = []
    for entry in dist.files or []:
        name = Path(str(entry)).name.lower()
        if name.startswith(("license", "licence", "copying", "notice")) or ".dist-info/licenses/" in str(entry).replace("\\", "/").lower():
            found.append(str(entry).replace("\\", "/"))
    return sorted(set(found))


def collect() -> dict:
    project_root = Path(__file__).resolve().parent.parent
    packages: dict[str, dict] = {}
    missing: list[dict] = []

    def visit(name: str, role: str, parent: str | None) -> None:
        name = normalise(name)
        record = packages.get(name)
        if record is not None:
            if role not in record["roles"]:
                record["roles"].append(role)
            if parent and parent not in record["required_by"]:
                record["required_by"].append(parent)
            return

        try:
            dist = md.distribution(name)
        except md.PackageNotFoundError:
            missing.append({"name": name, "required_by": parent, "role": role})
            return

        declared, source = licence_of(dist)
        packages[name] = {
            "name": name,
            "version": dist.version,
            "licence": declared,
            "licence_source": source,
            "licence_files": licence_files(dist),
            "roles": [role],
            "required_by": [parent] if parent else [],
            "direct": parent is None,
        }
        for dep in requires(name):
            visit(dep, role, f"{name}=={dist.version}")

    for rel, meta in ROOTS.items():
        path = project_root / rel
        if not path.exists():
            continue
        for pin in read_pins(path):
            visit(pin, str(meta["role"]), None)

    return {
        "ecosystem": "python",
        "interpreter": sys.version.split()[0],
        "executable": sys.executable,
        "roots": {k: v for k, v in ROOTS.items()},
        "packages": sorted(packages.values(), key=lambda p: p["name"]),
        "declared_but_not_installed": missing,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON on stdout")
    args = parser.parse_args()

    data = collect()
    if args.json:
        json.dump(data, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0

    for pkg in data["packages"]:
        print(f"{pkg['name']:32} {pkg['version']:14} {pkg['licence']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

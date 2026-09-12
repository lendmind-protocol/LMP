#!/usr/bin/env python3
"""Evidence-first public-source harvester for Lending-Mind proposals.

The harvester deliberately stops before enforcement.  It normalizes permitted
evidence, derives repeatable signals, records contradictions, and emits a
reviewable proposal.  It does not publish a profile, sign a package, execute
repository code, or retain raw source text in its output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
import urllib.error
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

MAX_SOURCE_BYTES = 1_000_000
FETCH_TIMEOUT_SECONDS = 10
MAX_FEED_ITEMS = 20
MAX_GITHUB_COMMITS = 10
MAX_GITHUB_CRITIQUES = 20
MAX_GITHUB_PULL_REQUESTS = 20
MAX_GITHUB_REPOSITORIES = 10
MAX_GITHUB_MANIFESTS = 8
MAX_GITHUB_SOURCE_FILES = 24
MAX_GITHUB_SOURCE_BYTES = 250_000
MAX_GITHUB_TREE_ENTRIES = 2_000
MAX_IMPORTED_RECORDS = 100
USER_AGENT = "lending-mind-protocol/0.1 mind-harvester"

LAYERS = {"textual", "implementation", "critique"}
POLARITIES = {"support", "reject", "mixed"}

# This is an intentionally small, transparent lexicon.  Adding a cluster is
# a reviewed compiler change, not an opaque model decision.
CLUSTERS: dict[str, tuple[str, ...]] = {
    "dependency-minimalism": ("minimal depend", "few depend", "zero depend", "zero-dependency", "avoid lodash", "dependency bloat", "small dependency", "lodash", "dependency names"),
    "performance-budget": ("latency", "cold start", "startup", "fast path", "performance budget", "load time"),
    "security-boundary": ("security", "trust boundary", "sanitize", "authorization", "row level security", "rls"),
    "complexity-control": ("complexity", "simple functions", "readable", "cyclomatic", "logic density"),
    "test-evidence": ("test", "regression", "benchmark", "measurement", "fixture"),
    "immutability": ("immutable", "reproducible", "declarative", "no drift", "content addressed"),
}

NUMERIC_RULES: tuple[tuple[str, str, str], ...] = (
    ("cyclomatic_complexity", r"cyclomatic(?: complexity)?\s*(?:<=|at most|under|below)\s*(\d+)", "max"),
    ("cold_start_ms", r"cold[- ]start(?: latency)?\s*(?:<=|at most|under|below)\s*(\d+(?:\.\d+)?)\s*ms", "max"),
    ("bundle_size_kb", r"(?:bundle|dependency)\s*(?:weight|size)?\s*(?:<=|at most|under|below)\s*(\d+(?:\.\d+)?)\s*kb", "max"),
)


def digest_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}-{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


@dataclass(frozen=True)
class SourceRecord:
    source_id: str
    layer: str
    title: str
    source_type: str
    reference: str
    content_digest: str
    rights: str
    allowed_use: str
    evidence_tier: str
    access_method: str
    content: str = field(repr=False, compare=False, default="")
    metadata: dict[str, Any] = field(default_factory=dict, compare=False)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.source_id,
            "layer": self.layer,
            "title": self.title,
            "sourceType": self.source_type,
            "reference": self.reference,
            "contentDigest": self.content_digest,
            "rights": self.rights,
            "allowedUse": self.allowed_use,
            "evidenceTier": self.evidence_tier,
            "accessMethod": self.access_method,
            "metadata": self.metadata,
        }


def validate_reference(reference: str, allow_local: bool) -> tuple[str, str]:
    if reference.startswith(("http://", "https://")):
        if not reference.startswith("https://"):
            raise ValueError(f"only HTTPS public sources are accepted: {reference}")
        return reference, "public-http"
    if reference.startswith(("file://", "ssh://", "git@")) or not allow_local:
        raise ValueError(f"local or private source requires --allow-local: {reference}")
    return "local://redacted", "local-repository"


def fetch_public(url: str) -> tuple[str, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/plain, text/html, application/json"})
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            if response.geturl() and not response.geturl().startswith("https://"):
                raise ValueError("redirected to a non-HTTPS source")
            body = response.read(MAX_SOURCE_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ValueError(f"public source fetch failed: {url}: {exc}") from exc
    if len(body) > MAX_SOURCE_BYTES:
        raise ValueError(f"source exceeds {MAX_SOURCE_BYTES} byte limit: {url}")
    return response.headers.get_content_type(), body


def _element_text(element: ET.Element | None) -> str:
    return " ".join(part.strip() for part in (element.itertext() if element is not None else ()) if part.strip())


def _first_child_text(element: ET.Element, names: tuple[str, ...]) -> str:
    for child in list(element):
        if child.tag.rsplit("}", 1)[-1].lower() in names:
            value = _element_text(child)
            if value:
                return value
    return ""


def parse_rss_feed(payload: bytes, feed_url: str) -> list[dict[str, Any]]:
    """Convert RSS or Atom entries into source records without retaining XML."""
    if not feed_url.startswith("https://"):
        raise ValueError("RSS/Atom feeds must use HTTPS")
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise ValueError(f"RSS/Atom feed is not valid XML: {feed_url}") from exc
    entries = [element for element in root.iter() if element.tag.rsplit("}", 1)[-1].lower() in {"item", "entry"}]
    records: list[dict[str, Any]] = []
    for entry in entries[:MAX_FEED_ITEMS]:
        title = _first_child_text(entry, ("title",)) or "untitled feed entry"
        link = ""
        for child in list(entry):
            if child.tag.rsplit("}", 1)[-1].lower() == "link":
                link = str(child.attrib.get("href") or _element_text(child))
                if link:
                    break
        reference = link if link.startswith("https://") else feed_url
        description = _first_child_text(entry, ("description", "summary", "content", "encoded"))
        published = _first_child_text(entry, ("published", "updated", "pubdate"))
        content = " ".join(part for part in (title, description) if part)
        records.append({
            "id": stable_id("rss", reference + "\0" + digest_bytes(content.encode("utf-8"))),
            "layer": "textual",
            "title": title,
            "url": reference,
            "sourceType": "blog",
            "rights": "public-documentation",
            "allowedUse": "analysis-only; attribution required",
            "evidenceTier": "primary",
            "content": content,
            "metadata": {"publisher": urlparse(feed_url).hostname or "public-feed", "publishedAt": published or None},
        })
    if not records:
        raise ValueError(f"RSS/Atom feed contains no entries: {feed_url}")
    return records


def parse_github_repository_url(repository_url: str) -> tuple[str, str]:
    parsed = urlparse(repository_url)
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        raise ValueError("GitHub repository must be an HTTPS github.com URL")
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if len(parts) != 2 or not all(re.fullmatch(r"[A-Za-z0-9_.-]+", part) for part in parts):
        raise ValueError("GitHub repository must use https://github.com/<owner>/<repo>")
    return parts[0], parts[1].removesuffix(".git")


def parse_github_profile_url(profile_url: str) -> str:
    parsed = urlparse(profile_url)
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        raise ValueError("GitHub profile must be an HTTPS github.com URL")
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if len(parts) != 1 or not re.fullmatch(r"[A-Za-z0-9_.-]+", parts[0]):
        raise ValueError("GitHub profile must use https://github.com/<owner>")
    return parts[0]


def github_source_mappings(repository_url: str, commits: list[dict[str, Any]], critiques: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize bounded public GitHub API responses into implementation/critique inputs."""
    owner, repo = parse_github_repository_url(repository_url)
    records: list[dict[str, Any]] = []
    for commit in commits[:MAX_GITHUB_COMMITS]:
        sha = str(commit.get("sha") or "")
        message = str((commit.get("commit") or {}).get("message") or "")
        reference = str(commit.get("html_url") or f"https://github.com/{owner}/{repo}/commit/{sha}")
        if not sha or not message or not reference.startswith("https://"):
            continue
        records.append({
            "id": stable_id("github-commit", repository_url + "\0" + sha),
            "layer": "implementation",
            "title": f"{owner}/{repo} public commit {sha[:12]}",
            "url": reference,
            "sourceType": "repository",
            "rights": "public-documentation",
            "allowedUse": "analysis-only; attribution required",
            "evidenceTier": "primary",
            "content": message,
            "metadata": {"publisher": "github.com", "revision": sha},
        })
    for critique in critiques[:MAX_GITHUB_CRITIQUES]:
        number = str(critique.get("number") or "")
        title = str(critique.get("title") or "")
        body = str(critique.get("body") or "")
        reference = str(critique.get("html_url") or f"https://github.com/{owner}/{repo}/issues/{number}")
        if not number or not title or not reference.startswith("https://"):
            continue
        records.append({
            "id": stable_id("github-critique", repository_url + "\0" + number),
            "layer": "critique",
            "title": f"{owner}/{repo} closed review {number}: {title}",
            "url": reference,
            "sourceType": "review" if "pull_request" in critique else "review",
            "rights": "public-documentation",
            "allowedUse": "analysis-only; attribution required",
            "evidenceTier": "primary",
            "content": " ".join(part for part in (title, body) if part),
            "metadata": {"publisher": "github.com", "revision": str(critique.get("updated_at") or ""), "publishedAt": critique.get("closed_at")},
        })
    return records


def github_pull_request_mappings(repository_url: str, pull_requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize closed pull-request records as explicit critique evidence.

    The issues endpoint can contain pull requests, but it does not make that
    stream explicit in a source manifest. Keeping closed PRs separate lets a
    reviewer distinguish implementation history from decisions that were
    accepted or rejected during review.
    """
    owner, repo = parse_github_repository_url(repository_url)
    records: list[dict[str, Any]] = []
    for pull_request in pull_requests[:MAX_GITHUB_PULL_REQUESTS]:
        number = str(pull_request.get("number") or "")
        title = str(pull_request.get("title") or "")
        body = str(pull_request.get("body") or "")
        reference = str(pull_request.get("html_url") or f"https://github.com/{owner}/{repo}/pull/{number}")
        if not number or not title or not reference.startswith("https://github.com/"):
            continue
        records.append({
            "id": stable_id("github-pull-request", repository_url + "\0" + number),
            "layer": "critique",
            "title": f"{owner}/{repo} closed pull request {number}: {title}",
            "url": reference,
            "sourceType": "pull-request",
            "rights": "public-documentation",
            "allowedUse": "analysis-only; attribution required",
            "evidenceTier": "primary",
            "content": " ".join(part for part in (title, body) if part),
            "metadata": {
                "publisher": "github.com",
                "revision": str(pull_request.get("updated_at") or ""),
                "publishedAt": pull_request.get("closed_at"),
                "state": str(pull_request.get("state") or "closed"),
            },
        })
    return records


def fetch_github_sources(repository_url: str) -> list[dict[str, Any]]:
    owner, repo = parse_github_repository_url(repository_url)
    api_base = f"https://api.github.com/repos/{owner}/{repo}"
    commits = json.loads(fetch_public(f"{api_base}/commits?per_page={MAX_GITHUB_COMMITS}")[1].decode("utf-8"))
    critiques = json.loads(fetch_public(f"{api_base}/issues?state=closed&per_page={MAX_GITHUB_CRITIQUES}")[1].decode("utf-8"))
    pull_requests = json.loads(fetch_public(f"{api_base}/pulls?state=closed&sort=updated&direction=desc&per_page={MAX_GITHUB_PULL_REQUESTS}")[1].decode("utf-8"))
    if not isinstance(commits, list) or not isinstance(critiques, list) or not isinstance(pull_requests, list):
        raise ValueError(f"GitHub API returned an unexpected response for {repository_url}")
    records = github_source_mappings(repository_url, commits, critiques)
    records.extend(github_pull_request_mappings(repository_url, pull_requests))
    repository = json.loads(fetch_public(api_base)[1].decode("utf-8"))
    if isinstance(repository, dict):
        records.extend(github_repository_implementation_sources(repository))
    return records


def github_repository_observation(repository: dict[str, Any]) -> dict[str, Any]:
    """Convert public repository metadata into bounded implementation evidence."""
    full_name = str(repository.get("full_name") or "")
    if not full_name or "/" not in full_name:
        raise ValueError("GitHub repository metadata has no valid full_name")
    owner, repo = full_name.split("/", 1)
    reference = str(repository.get("html_url") or f"https://github.com/{owner}/{repo}")
    if not reference.startswith("https://github.com/"):
        raise ValueError("GitHub repository metadata has a non-public reference")
    summary = {
        "language": repository.get("language"),
        "sizeKb": repository.get("size"),
        "defaultBranch": repository.get("default_branch"),
        "topics": sorted(str(topic) for topic in repository.get("topics", []) if isinstance(topic, str))[:20],
        "archived": bool(repository.get("archived", False)),
        "fork": bool(repository.get("fork", False)),
        "stars": repository.get("stargazers_count"),
    }
    return {
        "id": stable_id("github-repository", reference),
        "layer": "implementation",
        "title": f"{full_name} public repository structure",
        "url": reference,
        "sourceType": "repository",
        "rights": "public-documentation",
        "allowedUse": "analysis-only; attribution required",
        "evidenceTier": "primary",
        "content": json.dumps(summary, sort_keys=True),
        "metadata": {
            "publisher": "github.com",
            "revision": str(repository.get("updated_at") or ""),
            "defaultBranch": summary["defaultBranch"],
            "language": summary["language"],
            "topics": summary["topics"],
        },
    }


def _manifest_dependency_names(name: str, payload: bytes) -> list[str]:
    """Extract dependency names without parsing or executing a project build file."""
    text = payload.decode("utf-8", errors="replace")
    names: set[str] = set()
    if name == "package.json":
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            return []
        if isinstance(value, dict):
            for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
                dependencies = value.get(section)
                if isinstance(dependencies, dict):
                    names.update(
                        str(key)
                        for key in dependencies
                        if re.fullmatch(r"@[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+", str(key))
                    )
    elif name == "Cargo.toml":
        section = ""
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                section = stripped.strip("[]")
            elif section in {"dependencies", "dev-dependencies", "build-dependencies"}:
                match = re.match(r"([A-Za-z0-9_-]+)\s*=", stripped)
                if match:
                    names.add(match.group(1))
    elif name == "go.mod":
        for match in re.finditer(r"(?m)^\s*(?:[A-Za-z0-9_.-]+\s+)?([A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+)\s+v", text):
            names.add(match.group(1))
    elif name in {"requirements.txt", "requirements-dev.txt"}:
        for line in text.splitlines():
            match = re.match(r"\s*([A-Za-z0-9_.-]+)", line)
            if match and not line.lstrip().startswith("#"):
                names.add(match.group(1))
    elif name == "pyproject.toml":
        for match in re.finditer(r"[\"']([A-Za-z0-9_.-]+)\s*[<>=!~]", text):
            names.add(match.group(1))
    return sorted(names)[:100]


SOURCE_SUFFIXES = {
    ".c", ".cc", ".cpp", ".go", ".java", ".js", ".jsx", ".py", ".rs",
    ".ts", ".tsx", ".kt", ".swift",
}


def _source_structure(path: str, payload: bytes) -> dict[str, Any]:
    """Extract bounded structural counters without retaining source text.

    This is deliberately a language-neutral observation pass. It does not
    pretend to replace compiler-grade AST analysis: the Rust evaluator remains
    authoritative for supported enforcement rules. The harvester uses these
    counters only as attributable implementation evidence.
    """
    text = payload.decode("utf-8", errors="replace")
    suffix = Path(path).suffix.lower()
    declarations = {
        "function": 0,
        "class": 0,
        "type": 0,
        "variable": 0,
        "module": 0,
    }
    patterns: tuple[tuple[str, str], ...]
    if suffix == ".rs":
        patterns = (
            ("function", r"\b(?:pub\s+)?(?:async\s+)?fn\s+[A-Za-z_]\w*"),
            ("class", r"\bstruct\s+[A-Za-z_]\w*"),
            ("type", r"\b(?:enum|trait|type)\s+[A-Za-z_]\w*"),
            ("variable", r"\blet(?:\s+mut)?\s+[A-Za-z_]\w*"),
            ("module", r"\bmod\s+[A-Za-z_]\w*"),
        )
    elif suffix in {".ts", ".tsx", ".js", ".jsx"}:
        patterns = (
            ("function", r"\b(?:async\s+)?function\s+[A-Za-z_$][\w$]*|\b(?:async\s+)?[A-Za-z_$][\w$]*\s*=\s*\([^\n]{0,160}\)\s*=>"),
            ("class", r"\bclass\s+[A-Za-z_$][\w$]*"),
            ("type", r"\b(?:interface|type)\s+[A-Za-z_$][\w$]*"),
            ("variable", r"\b(?:const|let|var)\s+[A-Za-z_$][\w$]*"),
            ("module", r"\b(?:import|export)\b"),
        )
    elif suffix == ".go":
        patterns = (
            ("function", r"\bfunc\s+(?:\([^)]*\)\s*)?[A-Za-z_]\w*"),
            ("type", r"\btype\s+[A-Za-z_]\w*"),
            ("variable", r"\b(?:var|const)\s+[A-Za-z_]\w*"),
            ("module", r"\b(?:import|package)\s+[A-Za-z_.\"/]+"),
        )
    elif suffix == ".py":
        patterns = (
            ("function", r"\bdef\s+[A-Za-z_]\w*"),
            ("class", r"\bclass\s+[A-Za-z_]\w*"),
            ("variable", r"(?m)^\s*[A-Za-z_]\w*\s*="),
            ("module", r"\b(?:from|import)\s+[A-Za-z_.][\w.]*"),
        )
    else:
        patterns = (
            ("function", r"\b(?:function|def)\s+[A-Za-z_]\w*"),
            ("class", r"\bclass\s+[A-Za-z_]\w*"),
            ("type", r"\b(?:struct|enum|interface|type)\s+[A-Za-z_]\w*"),
            ("variable", r"\b(?:const|let|var)\s+[A-Za-z_]\w*"),
            ("module", r"\b(?:import|include|require)\b"),
        )
    for kind, pattern in patterns:
        declarations[kind] = len(re.findall(pattern, text))
    return {
        "pathDigest": digest_bytes(path.encode("utf-8")),
        "contentDigest": digest_bytes(payload),
        "language": suffix.removeprefix(".") or "unknown",
        "bytes": len(payload),
        "declarations": declarations,
    }


def _github_source_tree(repository: dict[str, Any]) -> list[dict[str, Any]]:
    """Return a bounded list of public source-tree entries for one repository."""
    full_name = str(repository.get("full_name") or "")
    default_branch = str(repository.get("default_branch") or "main")
    if "/" not in full_name:
        return []
    owner, repo = full_name.split("/", 1)
    tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"
    _, payload = fetch_public(tree_url)
    value = json.loads(payload.decode("utf-8"))
    entries = value.get("tree", []) if isinstance(value, dict) else []
    if not isinstance(entries, list):
        return []
    candidates = []
    for entry in entries[:MAX_GITHUB_TREE_ENTRIES]:
        if not isinstance(entry, dict) or entry.get("type") != "blob":
            continue
        path = str(entry.get("path") or "")
        if Path(path).suffix.lower() not in SOURCE_SUFFIXES:
            continue
        if any(part in {".git", "node_modules", "target", "dist", "vendor"} for part in Path(path).parts):
            continue
        candidates.append({"path": path, "url": f"https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/{path}"})
    return sorted(candidates, key=lambda entry: entry["path"])[:MAX_GITHUB_SOURCE_FILES]


def github_source_structure(repository: dict[str, Any]) -> dict[str, Any]:
    """Inspect bounded public source files and return aggregate structure only."""
    files = _github_source_tree(repository)
    observations: list[dict[str, Any]] = []
    total_bytes = 0
    for entry in files:
        if total_bytes >= MAX_GITHUB_SOURCE_BYTES:
            break
        _, payload = fetch_public(entry["url"])
        remaining = MAX_GITHUB_SOURCE_BYTES - total_bytes
        bounded = payload[:remaining]
        observations.append(_source_structure(entry["path"], bounded))
        total_bytes += len(bounded)
    declaration_counts: dict[str, int] = defaultdict(int)
    languages: dict[str, int] = defaultdict(int)
    for observation in observations:
        languages[observation["language"]] += 1
        for kind, count in observation["declarations"].items():
            declaration_counts[kind] += count
    return {
        "filesInspected": len(observations),
        "bytesInspected": total_bytes,
        "languages": dict(sorted(languages.items())),
        "declarationCounts": dict(sorted(declaration_counts.items())),
        "fileDigests": [observation["contentDigest"] for observation in observations],
        "codeExecuted": False,
        "rawSourceRetained": False,
    }


def github_repository_implementation_sources(repository: dict[str, Any]) -> list[dict[str, Any]]:
    """Inspect bounded public metadata and dependency manifests for one repository.

    This is observation-only: it fetches file bytes over GitHub's public API/raw
    host, extracts names and language metadata, and never clones, installs,
    imports, or executes repository code.
    """
    full_name = str(repository.get("full_name") or "")
    reference = str(repository.get("html_url") or "")
    default_branch = str(repository.get("default_branch") or "main")
    if not full_name or "/" not in full_name or not reference.startswith("https://github.com/"):
        raise ValueError("GitHub repository metadata is incomplete")
    owner, repo = full_name.split("/", 1)
    api_base = f"https://api.github.com/repos/{owner}/{repo}"
    languages_payload = json.loads(fetch_public(f"{api_base}/languages")[1].decode("utf-8"))
    languages = sorted(str(language) for language in languages_payload) if isinstance(languages_payload, dict) else []
    contents_payload = json.loads(fetch_public(f"{api_base}/contents?ref={default_branch}")[1].decode("utf-8"))
    manifest_names = {"package.json", "Cargo.toml", "go.mod", "requirements.txt", "requirements-dev.txt", "pyproject.toml"}
    dependency_manifests: dict[str, list[str]] = {}
    if isinstance(contents_payload, list):
        for item in contents_payload[:MAX_GITHUB_MANIFESTS]:
            if not isinstance(item, dict) or item.get("name") not in manifest_names:
                continue
            name = str(item["name"])
            download_url = str(item.get("download_url") or "")
            if not download_url.startswith("https://"):
                continue
            _, payload = fetch_public(download_url)
            dependency_manifests[name] = _manifest_dependency_names(name, payload)
    structure = github_source_structure(repository)
    observation = {
        "repository": full_name,
        "revision": str(repository.get("updated_at") or default_branch),
        "defaultBranch": default_branch,
        "languages": languages,
        "dependencyManifests": dependency_manifests,
        "dependencyNames": sorted({name for names in dependency_manifests.values() for name in names}),
        "sourceStructure": structure,
        "codeExecuted": False,
        "rawSourceRetained": False,
    }
    return [{
        "id": stable_id("github-implementation", reference + "\0" + digest_bytes(canonical_bytes(observation))),
        "layer": "implementation",
        "title": f"{full_name} public language and dependency observation",
        "url": reference,
        "sourceType": "repository",
        "rights": "public-documentation",
        "allowedUse": "analysis-only; attribution required",
        "evidenceTier": "primary",
        "content": json.dumps(observation, sort_keys=True),
        "metadata": {
            "publisher": "github.com",
            "revision": observation["revision"],
            "language": ",".join(languages) or None,
            "dependencyManifestNames": sorted(dependency_manifests),
            "dependencyNames": observation["dependencyNames"],
            "sourceStructure": structure,
            "codeExecuted": False,
        },
    }]


def fetch_github_profile_sources(profile_url: str) -> list[dict[str, Any]]:
    """Discover up to ten public repositories and their bounded evidence."""
    owner = parse_github_profile_url(profile_url)
    endpoint = f"https://api.github.com/users/{owner}/repos?sort=stars&direction=desc&per_page={MAX_GITHUB_REPOSITORIES}"
    repositories = json.loads(fetch_public(endpoint)[1].decode("utf-8"))
    if not isinstance(repositories, list):
        raise ValueError(f"GitHub profile API returned an unexpected response for {profile_url}")
    records: list[dict[str, Any]] = []
    for repository in repositories[:MAX_GITHUB_REPOSITORIES]:
        if not isinstance(repository, dict) or repository.get("fork"):
            continue
        repository_url = str(repository.get("html_url") or "")
        if not repository_url.startswith("https://github.com/"):
            continue
        records.append(github_repository_observation(repository))
        records.extend(fetch_github_sources(repository_url))
    return records


def parse_transcript_payload(payload: bytes, transcript_url: str, title: str | None = None) -> list[dict[str, Any]]:
    """Normalize VTT, timed-text XML, JSON, or plain transcript text."""
    if not transcript_url.startswith("https://"):
        raise ValueError("transcripts must use HTTPS")
    text = payload.decode("utf-8", errors="replace")
    content_type = "text/plain"
    stripped = text.lstrip()
    if stripped.startswith("<?xml") or stripped.startswith("<transcript"):
        try:
            root = ET.fromstring(text)
        except ET.ParseError as exc:
            raise ValueError(f"transcript XML is not valid: {transcript_url}") from exc
        segments = [_element_text(node) for node in root.iter() if node.tag.rsplit("}", 1)[-1].lower() in {"text", "p"}]
        text = " ".join(segment for segment in segments if segment)
        content_type = "application/xml"
    elif stripped.startswith("{") or stripped.startswith("["):
        try:
            value = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"transcript JSON is not valid: {transcript_url}") from exc
        segments: list[str] = []
        values = value if isinstance(value, list) else value.get("segments", []) if isinstance(value, dict) else []
        for item in values:
            if isinstance(item, str):
                segments.append(item)
            elif isinstance(item, dict):
                segment = item.get("text") or item.get("utf8")
                if isinstance(segment, str):
                    segments.append(segment)
        text = " ".join(segments)
        content_type = "application/json"
    else:
        lines = []
        for line in text.splitlines():
            candidate = line.strip()
            if not candidate or candidate == "WEBVTT" or re.fullmatch(r"\d+", candidate) or "-->" in candidate:
                continue
            lines.append(candidate)
        text = " ".join(lines)
        if "WEBVTT" in stripped[:32]:
            content_type = "text/vtt"
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        raise ValueError(f"transcript contains no spoken text: {transcript_url}")
    return [{
        "id": stable_id("transcript", transcript_url + "\0" + digest_bytes(text.encode("utf-8"))),
        "layer": "textual",
        "title": title or "Public conference transcript",
        "url": transcript_url,
        "sourceType": "transcript",
        "rights": "public-documentation",
        "allowedUse": "analysis-only; attribution required",
        "evidenceTier": "primary",
        "content": text,
        "metadata": {"contentType": content_type, "publisher": urlparse(transcript_url).hostname or "public-transcript"},
    }]


def youtube_video_id(video_url: str) -> str:
    parsed = urlparse(video_url)
    if parsed.scheme != "https" or parsed.netloc.lower() not in {"youtube.com", "www.youtube.com", "youtu.be"}:
        raise ValueError("YouTube video must use an HTTPS youtube.com or youtu.be URL")
    if parsed.netloc.lower() == "youtu.be":
        video_id = parsed.path.strip("/").split("/", 1)[0]
    else:
        from urllib.parse import parse_qs
        video_id = parse_qs(parsed.query).get("v", [""])[0]
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", video_id):
        raise ValueError("YouTube URL has no valid video identifier")
    return video_id


def fetch_youtube_transcript(video_url: str, language: str = "en") -> list[dict[str, Any]]:
    video_id = youtube_video_id(video_url)
    if not re.fullmatch(r"[A-Za-z-]{2,12}", language):
        raise ValueError("transcript language must be a simple BCP-47 language tag")
    transcript_url = f"https://www.youtube.com/api/timedtext?v={video_id}&lang={language}&fmt=srv3"
    _, payload = fetch_public(transcript_url)
    return parse_transcript_payload(payload, transcript_url, title=f"YouTube transcript {video_id}")


def source_from_mapping(raw: dict[str, Any], allow_local: bool, fetch: bool) -> SourceRecord:
    layer = raw.get("layer")
    if layer not in LAYERS:
        raise ValueError(f"source layer must be one of {sorted(LAYERS)}")
    reference_raw = str(raw.get("url") or raw.get("path") or raw.get("reference") or "")
    if not reference_raw:
        raise ValueError("source requires url, path, or reference")
    reference, access_method = validate_reference(reference_raw, allow_local)
    content = str(raw.get("content") or raw.get("text") or "")
    metadata = dict(raw.get("metadata") or {})
    if fetch and reference.startswith("https://") and not content:
        content_type, body = fetch_public(reference)
        content = body.decode("utf-8", errors="replace")
        metadata = {**metadata, "contentType": content_type, "fetched": True}
    if not content and raw.get("claims"):
        content = " ".join(str(claim) for claim in raw["claims"])
    if not content:
        raise ValueError(f"source has no analyzable content: {reference_raw}")
    requested_id = str(raw.get("id") or "")
    source_id = requested_id if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", requested_id) else stable_id("source", reference + "\0" + digest_bytes(content.encode()))
    digest = digest_bytes(content.encode("utf-8"))
    metadata = {
        key: value
        for key, value in metadata.items()
        if key in {
            "contentType", "fetched", "revision", "publishedAt", "publisher",
            "defaultBranch", "language", "topics", "dependencyManifestNames",
            "dependencyNames", "codeExecuted", "provider", "importFormat", "section",
        }
        and (
            isinstance(value, (str, int, float, bool, type(None)))
            or (isinstance(value, list) and all(isinstance(item, str) for item in value))
        )
    }
    supplied_structure = raw.get("metadata", {}).get("sourceStructure") if isinstance(raw.get("metadata"), dict) else None
    if isinstance(supplied_structure, dict):
        # Keep only the compiler-owned aggregate shape; never copy arbitrary
        # nested source data from an untrusted input manifest.
        structure: dict[str, Any] = {}
        for key in ("filesInspected", "bytesInspected"):
            value = supplied_structure.get(key)
            if isinstance(value, int) and value >= 0:
                structure[key] = value
        for key in ("languages", "declarationCounts"):
            value = supplied_structure.get(key)
            if isinstance(value, dict):
                structure[key] = {
                    str(name): count
                    for name, count in value.items()
                    if isinstance(name, str) and isinstance(count, int) and count >= 0
                }
        for key in ("fileDigests",):
            value = supplied_structure.get(key)
            if isinstance(value, list) and all(isinstance(item, str) for item in value):
                structure[key] = value[:MAX_GITHUB_SOURCE_FILES]
        for key in ("codeExecuted", "rawSourceRetained"):
            value = supplied_structure.get(key)
            if isinstance(value, bool):
                structure[key] = value
        if structure:
            metadata["sourceStructure"] = structure
    return SourceRecord(
        source_id=source_id,
        layer=layer,
        title=str(raw.get("title") or source_id),
        source_type=str(raw.get("sourceType") or ({"textual": "blog", "implementation": "repository", "critique": "review"}[layer])),
        reference=reference,
        content_digest=digest,
        rights=str(raw.get("rights") or "unknown"),
        allowed_use=str(raw.get("allowedUse") or "analysis-only; attribution required"),
        evidence_tier=str(raw.get("evidenceTier") or "primary"),
        access_method=access_method,
        content=content,
        metadata=metadata,
    )


def _safe_import_text(value: Any) -> str:
    """Extract bounded evidence text from untrusted JSON values."""
    if isinstance(value, str):
        return value[:MAX_SOURCE_BYTES]
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(_safe_import_text(item) for item in value[:MAX_IMPORTED_RECORDS])
    if isinstance(value, dict):
        allowed = {"content", "markdown", "html", "text", "description", "rationale", "application", "key_takeaway", "rule", "decision", "concept", "topic", "method_name", "company_name"}
        return "\n".join(f"{key}: {_safe_import_text(item)}" for key, item in list(value.items())[:MAX_IMPORTED_RECORDS] if key in allowed and _safe_import_text(item))[:MAX_SOURCE_BYTES]
    return ""


def _citation_url(value: Any) -> str:
    return value if isinstance(value, str) and value.startswith("https://") else ""


def _structured_profile_sources(payload: dict[str, Any], reference: str) -> list[dict[str, Any]]:
    """Convert the canonical profile-source export into reviewable evidence records."""
    fields = (("engineering_philosophies", "concept", "description"), ("technical_tradeoffs", "topic", "decision"), ("development_methods", "method_name", "application"), ("media_references", "title", "key_takeaway"), ("engineering_rules", "rule", "context"))
    records = []
    for section, title_key, detail_key in fields:
        for index, entry in enumerate(payload.get(section, [])[:MAX_IMPORTED_RECORDS] if isinstance(payload.get(section), list) else []):
            if not isinstance(entry, dict):
                continue
            title = str(entry.get(title_key) or f"{section} {index + 1}")
            content = _safe_import_text({title_key: entry.get(title_key), detail_key: entry.get(detail_key)})
            if not content:
                continue
            citation = next((_citation_url(value) for key, value in entry.items() if key.endswith("citation") and _citation_url(value)), "")
            records.append({"id": stable_id("json", f"{reference}\0{section}\0{index}\0{title}"), "layer": "textual", "title": title, "url": citation or reference, "sourceType": "json-profile-source", "content": content, "rights": "user-supplied", "allowedUse": "analysis-only; attribution required", "evidenceTier": "primary" if citation else "secondary", "metadata": {"provider": "json-import", "importFormat": "engineering-profile-source", "section": section}})
    return records


def _company_sources(payload: dict[str, Any], reference: str) -> list[dict[str, Any]]:
    records = []
    for index, company in enumerate(payload.get("companies", [])[:MAX_IMPORTED_RECORDS] if isinstance(payload.get("companies"), list) else []):
        if not isinstance(company, dict):
            continue
        name = str(company.get("company_name") or f"Company {index + 1}")
        content = _safe_import_text(company)
        if content:
            citation = _citation_url(company.get("company_name_citation"))
            records.append({"id": stable_id("json-company", f"{reference}\0{index}\0{name}"), "layer": "textual", "title": f"{name} structured engineering export", "url": citation or reference, "sourceType": "json-company-export", "content": content, "rights": "user-supplied", "allowedUse": "analysis-only; attribution required", "evidenceTier": "primary" if citation else "secondary", "metadata": {"provider": "json-import", "importFormat": "company-profile-export"}})
    return records


def _firecrawl_item(item: dict[str, Any], reference: str, index: int) -> dict[str, Any] | None:
    data = item.get("data") if isinstance(item.get("data"), dict) else item
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    content = data.get("markdown") or data.get("text") or data.get("content") or data.get("html")
    if not isinstance(content, str) or not content.strip():
        return None
    url = next((_citation_url(metadata.get(key)) for key in ("sourceURL", "sourceUrl", "url", "canonicalUrl") if _citation_url(metadata.get(key))), "")
    title = str(metadata.get("title") or item.get("title") or url or f"Firecrawl import {index + 1}")
    return {"id": stable_id("firecrawl", f"{reference}\0{index}\0{url}\0{title}"), "layer": "textual", "title": title, "url": url or reference, "sourceType": "firecrawl-json", "content": content[:MAX_SOURCE_BYTES], "rights": "user-supplied", "allowedUse": "analysis-only; attribution required", "evidenceTier": "primary" if url else "secondary", "metadata": {"provider": "firecrawl", "importFormat": "firecrawl-json", "contentType": "text/markdown" if data.get("markdown") else "text/plain"}}


def json_input_sources(payload: Any, reference: str) -> list[dict[str, Any]]:
    """Normalize profile exports, Firecrawl responses, and existing manifests."""
    if isinstance(payload, dict) and any(key in payload for key in ("engineering_philosophies", "technical_tradeoffs", "development_methods")):
        records = _structured_profile_sources(payload, reference)
    elif isinstance(payload, dict) and isinstance(payload.get("companies"), list):
        records = _company_sources(payload, reference)
    else:
        candidates = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), list) else payload
        candidates = [candidates] if isinstance(candidates, dict) else candidates
        records = []
        if isinstance(candidates, list):
            for index, item in enumerate(candidates[:MAX_IMPORTED_RECORDS]):
                if isinstance(item, dict):
                    imported = _firecrawl_item(item, reference, index)
                    if imported:
                        records.append(imported)
                    elif item.get("layer") in LAYERS and (item.get("content") or item.get("text")):
                        records.append(item)
        if not records:
            raise ValueError("JSON input contains no supported analyzable records")
    return records


def scan_repository(path: Path) -> dict[str, Any]:
    """Collect names and dependency declarations without executing repository code."""
    if not path.is_dir():
        raise ValueError(f"repository path is not a directory: {path}")
    file_count = 0
    dependency_manifest_names: set[str] = set()
    observed_patterns: list[str] = []
    for candidate in sorted(path.rglob("*")):
        if not candidate.is_file() or any(part in {".git", "node_modules", "target", "dist"} for part in candidate.parts):
            continue
        file_count += 1
        if candidate.name in {"package.json", "Cargo.toml", "go.mod", "requirements.txt", "pyproject.toml"}:
            dependency_manifest_names.add(candidate.name)
        if candidate.suffix in {".rs", ".ts", ".tsx", ".go", ".py", ".js"} and len(observed_patterns) < 100:
            text = candidate.read_text(encoding="utf-8", errors="ignore")
            for pattern in ("unsafe", "global mutable", "lodash", "row level security", "TODO", "panic!", "if err != nil"):
                if pattern in text.lower() and pattern not in observed_patterns:
                    observed_patterns.append(pattern)
    return {
        "fileCount": file_count,
        "dependencyManifestCount": len(dependency_manifest_names),
        "dependencyManifestNames": sorted(dependency_manifest_names),
        "observedPatterns": observed_patterns,
        "codeExecuted": False,
        "rawPathsIncluded": False,
    }


def extract_signals(sources: Iterable[SourceRecord]) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for source in sources:
        text = normalize_text(source.content)
        for cluster, terms in CLUSTERS.items():
            hits = [term for term in terms if term in text]
            if not hits:
                continue
            polarity = "reject" if source.layer == "critique" and any(word in text for word in ("reject", "avoid", "refuse", "do not", "don't", "never")) else "support"
            signals.append({
                "id": stable_id("signal", source.source_id + "\0" + cluster + "\0" + polarity),
                "cluster": cluster,
                "sourceId": source.source_id,
                "polarity": polarity,
                "matchedTerms": sorted(hits),
                "evidenceKind": source.layer,
                "classification": "review-pattern" if source.layer == "critique" else ("repeated-code-pattern" if source.layer == "implementation" else "inferred-hypothesis"),
            })
        for rule_id, pattern, operator in NUMERIC_RULES:
            for match in re.finditer(pattern, text):
                signals.append({
                    "id": stable_id("signal", source.source_id + "\0" + rule_id + "\0" + match.group(1)),
                    "cluster": rule_id,
                    "sourceId": source.source_id,
                    "polarity": "support",
                    "matchedTerms": [match.group(0)],
                    "evidenceKind": source.layer,
                    "classification": "explicit-statement",
                    "numeric": {"operator": operator, "value": float(match.group(1)) if "." in match.group(1) else int(match.group(1))},
                })
    return sorted(signals, key=lambda signal: signal["id"])


def compile_proposal(entity: str, sources: list[SourceRecord], signals: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for signal in signals:
        grouped[signal["cluster"]].append(signal)
    contradictions: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for cluster, cluster_signals in sorted(grouped.items()):
        supporting = sorted({s["sourceId"] for s in cluster_signals if s["polarity"] == "support"})
        rejecting = sorted({s["sourceId"] for s in cluster_signals if s["polarity"] == "reject"})
        if supporting and rejecting:
            contradictions.append({
                "id": stable_id("contradiction", cluster),
                "cluster": cluster,
                "supportingSourceIds": supporting,
                "rejectingSourceIds": rejecting,
                "resolution": "human-review-required",
                "reason": "the harvested footprint contains both supporting and rejecting evidence",
            })
        independent_count = len(set(supporting))
        status = "contradicted" if supporting and rejecting else ("supported" if independent_count >= 2 else "insufficient-evidence")
        candidate: dict[str, Any] = {
            "id": f"candidate:{cluster}",
            "cluster": cluster,
            "status": status,
            "sourceIds": sorted({s["sourceId"] for s in cluster_signals}),
            "independentSupportingSources": independent_count,
            "enforcement": "none",
            "promotionEligible": False,
        }
        classifications = sorted({str(signal["classification"]) for signal in cluster_signals})
        candidate["classifications"] = classifications
        candidate["classification"] = classifications[0] if len(classifications) == 1 else "inferred-hypothesis"
        numeric = [s["numeric"] | {"sourceId": s["sourceId"]} for s in cluster_signals if "numeric" in s]
        if numeric:
            candidate["explicitNumericEvidence"] = sorted(numeric, key=lambda value: (str(value["value"]), value["sourceId"]))
        candidates.append(candidate)
    proposal_id = stable_id("proposal", entity + "\0" + digest_bytes(canonical_bytes([s.public() for s in sources])))
    signaled_source_ids = {signal["sourceId"] for signal in signals}
    unsupported_source_ids = sorted(source.source_id for source in sources if source.source_id not in signaled_source_ids)
    return {
        "proposalId": proposal_id,
        "profileId": f"lmp:mind:{entity}",
        "profileVersion": "0.1.0-proposal",
        "selectedArtifacts": [source.source_id for source in sources],
        "candidateChanges": candidates,
        "unsupportedSourceIds": unsupported_source_ids,
        "unsupportedSources": [
            {"sourceId": source_id, "classification": "unsupported"}
            for source_id in unsupported_source_ids
        ],
        "rationale": "Candidates are derived from repeated, attributable source signals; contradictions remain unresolved until human review.",
        "expectedBenefit": "A compact, attributable rule proposal that separates observed practice from inferred constraints.",
        "falsePositiveRisk": "Inferred clusters can overgeneralize across projects, time periods, or contexts; numeric limits require explicit source evidence.",
        "requiredVersionBump": "minor",
        "requiredTests": ["source provenance review", "contradiction resolution", "positive and negative fixtures", "benchmark comparison"],
        "benchmarkPlan": ["compare baseline and candidate profile on the same changed-file fixtures", "record evaluator and source revisions", "retain artifacts before promotion"],
        "approver": None,
        "status": "draft",
        "promotionEligible": False,
    }


def harvest(entity: str, raw_sources: list[dict[str, Any]], allow_local: bool = False, fetch: bool = False, repo: Path | None = None) -> dict[str, Any]:
    sources = [source_from_mapping(raw, allow_local, fetch) for raw in raw_sources]
    if repo:
        observation = scan_repository(repo)
        repo_bytes = canonical_bytes(observation)
        sources.append(SourceRecord(
            source_id=stable_id("source", "repository\0" + digest_bytes(repo_bytes)),
            layer="implementation",
            title="Explicit local repository observation",
            source_type="repository",
            reference="local://redacted",
            content_digest=digest_bytes(repo_bytes),
            rights="local-workspace",
            allowed_use="analysis-only",
            evidence_tier="primary",
            access_method="local-repository",
            content=json.dumps(observation, sort_keys=True),
            metadata=observation,
        ))
    if not sources:
        raise ValueError("at least one source or --repo is required")
    deduplicated = {source.source_id: source for source in sources}
    sources = [deduplicated[key] for key in sorted(deduplicated)]
    signals = extract_signals(sources)
    proposal = compile_proposal(entity, sources, signals)
    contradictions = []
    for candidate in proposal["candidateChanges"]:
        if candidate["status"] == "contradicted":
            contradictions.append(candidate["cluster"])
    return {
        "schemaVersion": "lmp.mind-harvest/1",
        "entity": entity,
        "sources": [source.public() for source in sources],
        "signals": signals,
        "contradictions": [item for item in _contradictions(sources, signals)],
        "proposal": proposal,
        "limitations": [
            "Only explicitly supplied or explicitly fetched public HTTPS material is analyzed.",
            "No private sources, credentials, hidden reasoning, or raw source text are retained in this artifact.",
            "Repository observations do not execute code and do not claim complete AST or dependency analysis.",
            "Inferred candidates are advisory proposals until a human resolves contradictions and signs a reviewed package.",
        ],
        "privacy": {"sourceContentIncluded": False, "rawPathsIncluded": False, "privateReasoningIncluded": False},
        "status": "needs-review" if contradictions else "draft",
    }


def _contradictions(sources: list[SourceRecord], signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_cluster: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for signal in signals:
        by_cluster[signal["cluster"]].append(signal)
    result = []
    for cluster, items in sorted(by_cluster.items()):
        supporting = sorted({item["sourceId"] for item in items if item["polarity"] == "support"})
        rejecting = sorted({item["sourceId"] for item in items if item["polarity"] == "reject"})
        if supporting and rejecting:
            result.append({
                "id": stable_id("contradiction", cluster),
                "cluster": cluster,
                "supportingSourceIds": supporting,
                "rejectingSourceIds": rejecting,
                "resolution": "human-review-required",
                "reason": "the harvested footprint contains both supporting and rejecting evidence",
            })
    return result


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entity", required=True, help="kebab-case public profile identity")
    parser.add_argument("--input", action="append", default=[], help="JSON source manifest; may be repeated")
    parser.add_argument("--url", action="append", default=[], help="explicit public HTTPS source URL; may be repeated")
    parser.add_argument("--rss", action="append", default=[], help="public HTTPS RSS/Atom feed to fetch and normalize; may be repeated")
    parser.add_argument("--github-repo", action="append", default=[], help="public HTTPS GitHub repository to inspect through bounded API calls; may be repeated")
    parser.add_argument("--github-profile", action="append", default=[], help="public HTTPS GitHub user or organization; inspect up to ten top repositories")
    parser.add_argument("--youtube-video", action="append", default=[], help="public HTTPS YouTube video with an available timed-text transcript; may be repeated")
    parser.add_argument("--transcript-language", default="en", help="language for --youtube-video transcripts (default: en)")
    parser.add_argument("--repo", type=Path, help="explicit local repository to inspect without executing code")
    parser.add_argument("--allow-local", action="store_true", help="allow local source records in --input")
    parser.add_argument("--fetch", action="store_true", help="fetch supplied HTTPS URLs or URL records")
    parser.add_argument("--output", type=Path, required=True, help="reviewable JSON artifact path")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        raw_sources: list[dict[str, Any]] = []
        for input_path in args.input:
            payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
            if isinstance(payload, dict) and isinstance(payload.get("sources"), list):
                raw_sources.extend(payload["sources"])
            else:
                raw_sources.extend(json_input_sources(payload, str(input_path)))
        raw_sources.extend({"url": url, "layer": "textual", "title": url} for url in args.url)
        for feed_url in args.rss:
            _, payload = fetch_public(feed_url)
            raw_sources.extend(parse_rss_feed(payload, feed_url))
        for repository_url in args.github_repo:
            raw_sources.extend(fetch_github_sources(repository_url))
        for profile_url in args.github_profile:
            raw_sources.extend(fetch_github_profile_sources(profile_url))
        for video_url in args.youtube_video:
            raw_sources.extend(fetch_youtube_transcript(video_url, args.transcript_language))
        artifact = harvest(args.entity, raw_sources, args.allow_local, args.fetch, args.repo)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(canonical_bytes(artifact) + b"\n")
        print(json.dumps({"status": artifact["status"], "output": str(args.output), "sources": len(artifact["sources"]), "signals": len(artifact["signals"]), "contradictions": len(artifact["contradictions"])}, sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"mind harvester error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

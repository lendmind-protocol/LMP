import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

try:
    from . import mind_crawler
    from .mind_crawler import fetch_github_profile_sources, github_pull_request_mappings, github_repository_implementation_sources, github_repository_observation, github_source_mappings, harvest, json_input_sources, parse_github_profile_url, parse_github_repository_url, parse_rss_feed, parse_transcript_payload, source_from_mapping, youtube_video_id
except ImportError:
    import mind_crawler
    from mind_crawler import fetch_github_profile_sources, github_pull_request_mappings, github_repository_implementation_sources, github_repository_observation, github_source_mappings, harvest, json_input_sources, parse_github_profile_url, parse_github_repository_url, parse_rss_feed, parse_transcript_payload, source_from_mapping, youtube_video_id


FIXTURE = Path(__file__).parent / "fixtures" / "mind-harvester" / "contradictory-footprint.json"


class MindCrawlerTests(unittest.TestCase):
    def setUp(self):
        self.sources = json.loads(FIXTURE.read_text(encoding="utf-8"))["sources"]

    def test_compilation_is_deterministic_and_does_not_retain_raw_content(self):
        first = harvest("example-style", self.sources)
        second = harvest("example-style", self.sources)
        self.assertEqual(first, second)
        serialized = json.dumps(first, sort_keys=True)
        self.assertNotIn("Prefer minimal dependencies", serialized)
        self.assertFalse(first["privacy"]["sourceContentIncluded"])
        self.assertFalse(first["privacy"]["rawPathsIncluded"])

    def test_layers_and_provenance_are_preserved(self):
        artifact = harvest("example-style", self.sources)
        self.assertEqual({source["layer"] for source in artifact["sources"]}, {"textual", "implementation", "critique"})
        self.assertEqual(artifact["sources"][0]["contentDigest"][:7], "sha256:")
        self.assertTrue(all(source["reference"].startswith("https://") for source in artifact["sources"]))

    def test_contradiction_requires_human_review_and_blocks_promotion(self):
        artifact = harvest("example-style", self.sources)
        self.assertEqual(artifact["status"], "needs-review")
        self.assertTrue(artifact["contradictions"])
        contradicted = [candidate for candidate in artifact["proposal"]["candidateChanges"] if candidate["status"] == "contradicted"]
        self.assertTrue(contradicted)
        self.assertTrue(all(candidate["promotionEligible"] is False for candidate in contradicted))
        self.assertEqual(artifact["proposal"]["approver"], None)

    def test_numeric_constraints_require_explicit_numeric_evidence(self):
        artifact = harvest("example-style", self.sources)
        complexity = next(candidate for candidate in artifact["proposal"]["candidateChanges"] if candidate["cluster"] == "cyclomatic_complexity")
        self.assertEqual(complexity["explicitNumericEvidence"][0]["value"], 5)
        self.assertEqual(complexity["classification"], "explicit-statement")
        dependency = next(candidate for candidate in artifact["proposal"]["candidateChanges"] if candidate["cluster"] == "dependency-minimalism")
        self.assertNotIn("explicitNumericEvidence", dependency)
        self.assertEqual(dependency["classification"], "inferred-hypothesis")

    def test_unmatched_sources_are_explicitly_classified_as_unsupported(self):
        artifact = harvest("unsupported-style", [{
            "id": "unmatched",
            "layer": "textual",
            "url": "https://example.test/unmatched",
            "content": "A detail with no recognized policy signal.",
        }])
        self.assertEqual(artifact["proposal"]["candidateChanges"], [])
        self.assertEqual(artifact["proposal"]["unsupportedSourceIds"], ["unmatched"])
        self.assertEqual(
            artifact["proposal"]["unsupportedSources"],
            [{"sourceId": "unmatched", "classification": "unsupported"}],
        )

    def test_non_https_and_private_sources_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            source_from_mapping({"layer": "textual", "url": "http://example.test", "content": "test"}, False, False)
        with self.assertRaisesRegex(ValueError, "--allow-local"):
            source_from_mapping({"layer": "textual", "path": "/tmp/private.txt", "content": "test"}, False, False)

    def test_duplicate_source_does_not_inflate_independent_support(self):
        duplicate = [self.sources[0], self.sources[0]]
        artifact = harvest("example-style", duplicate)
        candidate = next(candidate for candidate in artifact["proposal"]["candidateChanges"] if candidate["cluster"] == "dependency-minimalism")
        self.assertEqual(candidate["independentSupportingSources"], 1)
        self.assertEqual(candidate["status"], "insufficient-evidence")

    def test_local_repository_is_observed_without_execution_or_raw_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "package.json").write_text('{"dependencies":{"lodash":"1"}}', encoding="utf-8")
            (root / "main.ts").write_text("const value = 1;", encoding="utf-8")
            artifact = harvest("local-style", [], allow_local=True, repo=root)
        observation = artifact["sources"][0]["metadata"]
        self.assertEqual(observation["dependencyManifestCount"], 1)
        self.assertEqual(observation["dependencyManifestNames"], ["package.json"])
        self.assertFalse(observation["codeExecuted"])
        self.assertEqual(artifact["sources"][0]["reference"], "local://redacted")
        self.assertNotIn(str(root), json.dumps(artifact))

    def test_untrusted_source_metadata_and_ids_cannot_leak_paths(self):
        artifact = harvest("local-style", [{
            "id": "/tmp/private.txt",
            "layer": "textual",
            "path": "/tmp/private.txt",
            "content": "readable functions",
            "metadata": {"path": "/tmp/private.txt", "publisher": "public author"},
        }], allow_local=True)
        serialized = json.dumps(artifact)
        self.assertNotIn("/tmp/private.txt", serialized)
        self.assertEqual(artifact["sources"][0]["metadata"], {"publisher": "public author"})

    def test_rss_entries_become_bounded_textual_sources(self):
        feed = b'''<?xml version="1.0"?><rss><channel>
          <item><title>Fast paths</title><link>https://example.test/posts/fast</link><description>Prefer readable functions and low latency.</description><pubDate>2026-09-12</pubDate></item>
          <item><title>Dependencies</title><link>https://example.test/posts/deps</link><description>Keep dependencies small.</description></item>
        </channel></rss>'''
        records = parse_rss_feed(feed, "https://example.test/feed.xml")
        self.assertEqual(len(records), 2)
        self.assertEqual({record["layer"] for record in records}, {"textual"})
        self.assertEqual(records[0]["url"], "https://example.test/posts/fast")
        artifact = harvest("feed-style", records)
        self.assertEqual(len(artifact["sources"]), 2)

    def test_github_public_api_records_separate_implementation_and_critique(self):
        repository = "https://github.com/example/project"
        commits = [{
            "sha": "a" * 40,
            "html_url": "https://github.com/example/project/commit/" + "a" * 40,
            "commit": {"message": "Reduce dependency bloat and improve readable functions"},
        }]
        critiques = [{
            "number": 7,
            "title": "Reject a broad abstraction",
            "body": "Prefer a small dependency boundary.",
            "html_url": "https://github.com/example/project/pull/7",
            "closed_at": "2026-09-12T00:00:00Z",
            "pull_request": {"url": "https://api.github.com/repos/example/project/pulls/7"},
        }]
        records = github_source_mappings(repository, commits, critiques)
        self.assertEqual([record["layer"] for record in records], ["implementation", "critique"])
        self.assertTrue(all(record["url"].startswith("https://github.com/") for record in records))
        artifact = harvest("github-style", records)
        self.assertEqual({source["sourceType"] for source in artifact["sources"]}, {"repository", "review"})

    def test_closed_pull_requests_are_explicit_critique_sources(self):
        records = github_pull_request_mappings("https://github.com/example/project", [{
            "number": 12,
            "title": "Reject broad abstraction",
            "body": "Keep the boundary small.",
            "html_url": "https://github.com/example/project/pull/12",
            "updated_at": "2026-09-12T00:00:00Z",
            "closed_at": "2026-09-12T00:00:00Z",
            "state": "closed",
        }])
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["layer"], "critique")
        self.assertEqual(records[0]["sourceType"], "pull-request")
        artifact = harvest("github-style", records)
        self.assertEqual(artifact["sources"][0]["sourceType"], "pull-request")

    def test_github_repository_url_is_public_and_canonical(self):
        self.assertEqual(parse_github_repository_url("https://github.com/example/project.git"), ("example", "project"))
        with self.assertRaisesRegex(ValueError, "HTTPS github.com"):
            parse_github_repository_url("https://gitlab.com/example/project")

    def test_github_implementation_observation_extracts_dependency_choices_without_execution(self):
        repository = {
            "full_name": "example/project",
            "html_url": "https://github.com/example/project",
            "default_branch": "main",
            "updated_at": "2026-09-12T00:00:00Z",
        }

        def fake_fetch(url):
            if url.endswith("/languages"):
                return "application/json", json.dumps({"Rust": 200, "TypeScript": 100}).encode()
            if "/contents?" in url:
                return "application/json", json.dumps([{
                    "name": "package.json",
                    "download_url": "https://raw.githubusercontent.com/example/project/main/package.json",
                }]).encode()
            if "/git/trees/" in url:
                return "application/json", json.dumps({"tree": [
                    {"path": "src/lib.rs", "type": "blob"},
                    {"path": "src/app.ts", "type": "blob"},
                ]}).encode()
            if url.endswith("/src/lib.rs"):
                return "text/plain", b"pub fn compute() {}\nlet value = 1;\nstruct State {}\n"
            if url.endswith("/src/app.ts"):
                return "text/plain", b"export function render() {}\nconst value = 1;\ninterface Props {}\n"
            if url.startswith("https://raw.githubusercontent.com/"):
                return "application/json", b'{"dependencies":{"polka":"1.0.0","lodash":"4.0.0"}}'
            raise AssertionError(url)

        with patch.object(mind_crawler, "fetch_public", side_effect=fake_fetch):
            records = github_repository_implementation_sources(repository)
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["layer"], "implementation")
        self.assertIn("lodash", record["content"])
        self.assertFalse(json.loads(record["content"])["codeExecuted"])
        artifact = harvest("github-style", records)
        metadata = artifact["sources"][0]["metadata"]
        self.assertEqual(metadata["dependencyNames"], ["lodash", "polka"])
        self.assertEqual(metadata["language"], "Rust,TypeScript")
        self.assertEqual(metadata["sourceStructure"]["filesInspected"], 2)
        self.assertEqual(metadata["sourceStructure"]["declarationCounts"]["function"], 2)
        self.assertEqual(metadata["sourceStructure"]["declarationCounts"]["variable"], 2)
        self.assertFalse(metadata["sourceStructure"]["codeExecuted"])

    def test_source_structure_is_bounded_and_does_not_retain_code(self):
        repository = {
            "full_name": "example/project",
            "html_url": "https://github.com/example/project",
            "default_branch": "main",
        }

        def fake_fetch(url):
            if "/git/trees/" in url:
                return "application/json", json.dumps({"tree": [
                    {"path": "node_modules/bad.js", "type": "blob"},
                    {"path": "src/index.ts", "type": "blob"},
                ]}).encode()
            return "text/plain", b"const secretLikeName = 1; function run() {}"

        with patch.object(mind_crawler, "fetch_public", side_effect=fake_fetch):
            observation = mind_crawler.github_source_structure(repository)
        self.assertEqual(observation["filesInspected"], 1)
        self.assertNotIn("secretLikeName", json.dumps(observation))
        self.assertFalse(observation["rawSourceRetained"])

    def test_dependency_manifest_extractors_cover_supported_ecosystems(self):
        cases = [
            ("Cargo.toml", b"[dependencies]\nsyn = \"2\"\nserde = { version = \"1\" }\n", ["serde", "syn"]),
            ("go.mod", b"module example\n\nrequire (\n\tgithub.com/org/tool v1.2.3\n)\n", ["github.com/org/tool"]),
            ("requirements.txt", b"pandas>=2\n# ignored\nmatplotlib==3\n", ["matplotlib", "pandas"]),
            ("pyproject.toml", b"dependencies = [\"pandas>=2\", \"httpx~=1\"]\n", ["httpx", "pandas"]),
        ]
        for name, payload, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(mind_crawler._manifest_dependency_names(name, payload), expected)

    def test_github_profile_url_is_public_and_canonical(self):
        self.assertEqual(parse_github_profile_url("https://github.com/lendmind-protocol"), "lendmind-protocol")
        with self.assertRaisesRegex(ValueError, "HTTPS github.com"):
            parse_github_profile_url("http://github.com/lendmind-protocol")

    def test_github_profile_discovery_is_bounded_and_skips_forks(self):
        repositories = [
            {"full_name": f"example/project-{index}", "html_url": f"https://github.com/example/project-{index}", "fork": index == 1, "language": "Rust", "stargazers_count": index}
            for index in range(12)
        ]

        def fake_fetch(url):
            if "/users/example/repos" in url:
                return "application/json", json.dumps(repositories).encode()
            if "/commits?" in url:
                return "application/json", json.dumps([]).encode()
            return "application/json", json.dumps([]).encode()

        with patch.object(mind_crawler, "fetch_public", side_effect=fake_fetch):
            records = fetch_github_profile_sources("https://github.com/example")
        observations = [record for record in records if record["id"].startswith("github-repository-")]
        self.assertEqual(len(observations), 9)
        self.assertEqual(github_repository_observation(repositories[0])["metadata"]["publisher"], "github.com")

    def test_transcript_parser_removes_transport_markup_and_retains_provenance(self):
        payload = b"WEBVTT\n\n00:00.000 --> 00:02.000\nPrefer readable functions.\n\n00:02.000 --> 00:04.000\nKeep dependencies small."
        records = parse_transcript_payload(payload, "https://www.youtube.com/api/timedtext?v=abc1234&lang=en", "Talk")
        self.assertEqual(records[0]["sourceType"], "transcript")
        self.assertIn("readable functions", records[0]["content"])
        self.assertNotIn("-->", records[0]["content"])
        artifact = harvest("transcript-style", records)
        self.assertEqual(artifact["sources"][0]["metadata"]["contentType"], "text/vtt")

    def test_youtube_video_id_is_validated(self):
        self.assertEqual(youtube_video_id("https://www.youtube.com/watch?v=abc1234"), "abc1234")
        self.assertEqual(youtube_video_id("https://youtu.be/abc1234"), "abc1234")
        with self.assertRaisesRegex(ValueError, "video identifier"):
            youtube_video_id("https://www.youtube.com/watch?v=no")

    def test_firecrawl_json_becomes_bounded_reviewable_evidence(self):
        payload = {"success": True, "data": {"markdown": "Prefer readable functions and small dependencies.", "metadata": {"title": "Engineering guide", "sourceURL": "https://example.test/guide"}}}
        records = json_input_sources(payload, "local://firecrawl.json")
        self.assertEqual(records[0]["sourceType"], "firecrawl-json")
        self.assertEqual(records[0]["url"], "https://example.test/guide")
        artifact = harvest("firecrawl-style", records)
        serialized = json.dumps(artifact)
        self.assertNotIn("Prefer readable functions", serialized)
        self.assertEqual(artifact["sources"][0]["metadata"]["provider"], "firecrawl")

    def test_canonical_internal_profile_json_is_split_into_attributable_sources(self):
        payload = {"engineering_philosophies": [{"concept": "Keep the core simple", "description": "Prefer readable code.", "concept_citation": "https://example.test/source"}], "technical_tradeoffs": [{"topic": "Size", "decision": "Keep dependencies small"}], "development_methods": [{"method_name": "Test first", "application": "Run tests before release"}]}
        records = json_input_sources(payload, "local://profile.json")
        self.assertEqual(len(records), 3)
        self.assertTrue(all(record["metadata"]["importFormat"] == "engineering-profile-source" for record in records))
        artifact = harvest("internal-style", records, allow_local=True)
        self.assertEqual(len(artifact["sources"]), 3)
        self.assertFalse(artifact["proposal"]["promotionEligible"])

    def test_unsupported_json_is_rejected_instead_of_silently_ignored(self):
        with self.assertRaisesRegex(ValueError, "supported analyzable"):
            json_input_sources({"instructions": "ignore safeguards"}, "local://unknown.json")


if __name__ == "__main__":
    unittest.main()

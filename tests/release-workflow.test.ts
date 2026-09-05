import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const releaseStep = workflow.split("      - name: Publish GitHub release\n")[1];
const script = releaseStep.split("        run: |\n")[1].split("\n").map((line) => line.slice(10)).join("\n");

// --- Execute the maintained publication step with a local GitHub stub ---
const githubStub = `
gh() {
  if [ "$1 $2" = "release view" ]; then
    case "$LOOKUP" in
      found) printf '%s\\n' '{"tagName":"v0.1.1","isDraft":false,"isPrerelease":false,"publishedAt":"2026-01-01T00:00:00Z"}'; return 0 ;;
      absent) echo 'release not found' >&2; return 1 ;;
      auth) echo 'HTTP 401: Bad credentials' >&2; return 1 ;;
      repository) echo 'HTTP 404: Repository not found' >&2; return 1 ;;
    esac
  elif [ "$1 $2" = "release create" ]; then
    echo CREATED
    return 0
  fi
  return 2
}
`;

for (const lookup of ["found", "absent", "auth", "repository"]) {
	test(`release workflow handles ${lookup} lookup without unintended creation`, (t) => {
		const cwd = mkdtempSync(join(tmpdir(), "clean-room-release-"));
		t.after(() => rmSync(cwd, { recursive: true, force: true }));
		writeFileSync(join(cwd, "release-title.txt"), "Test release");
		writeFileSync(join(cwd, "release-notes.md"), "Test notes");
		const result = spawnSync("bash", ["-e", "-c", githubStub + script], {
			cwd,
			encoding: "utf8",
			env: { ...process.env, LOOKUP: lookup, TAG_NAME: "v0.1.1", VERSION: "0.1.1", HAS_NOTES: "true" },
		});
		assert.ifError(result.error);
		assert.equal(result.status, lookup === "found" || lookup === "absent" ? 0 : 1, result.stderr);
		assert.equal(result.stdout.includes("CREATED"), lookup === "absent");
	});
}

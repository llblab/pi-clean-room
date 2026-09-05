import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { buildCleanRoomArgs, discoverExtensionNames, resolveExtension, resolveSkill } from "../index.ts";

test("buildCleanRoomArgs disables discovered behavioral resources and custom system prompts", () => {
	assert.deepEqual(
		buildCleanRoomArgs(["/ext/a", "/ext/b"], { provider: "anthropic", id: "sonnet" }, "high"),
		[
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--no-context-files",
			"--system-prompt",
			"",
			"--append-system-prompt",
			"",
			"--model",
			"anthropic/sonnet",
			"--thinking",
			"high",
			"--extension",
			"/ext/a",
			"--extension",
			"/ext/b",
		],
	);
});

test("buildCleanRoomArgs explicitly enables selected global resources", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-clean-room-resources-"));
	writeFileSync(join(root, "SYSTEM.md"), "custom system");
	writeFileSync(join(root, "AGENTS.md"), "agent notes");
	writeFileSync(join(root, "APPEND_SYSTEM.md"), "extra system");

	const args = buildCleanRoomArgs([], undefined, undefined, new Set([
		"skills", "agents", "system", "append-system",
	]), root);
	assert.ok(!args.includes("--no-skills"));
	assert.ok(!args.includes("--skill"));
	assert.ok(args.includes("custom system"));
	assert.ok(args.includes(join(root, "AGENTS.md")));
	assert.ok(args.includes(join(root, "APPEND_SYSTEM.md")));
});

test("resolveSkill finds a specific named skill", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-clean-room-skill-"));
	const cwd = join(root, "project");
	const agentDir = join(root, "agent");
	const skill = join(agentDir, "skills", "brain-storm");
	mkdirSync(skill, { recursive: true });
	assert.equal(resolveSkill("brain-storm", cwd, agentDir), skill);
	assert.equal(resolveSkill("../outside", cwd, agentDir), undefined);
});

test("buildCleanRoomArgs loads selected skills while keeping discovery disabled", () => {
	const args = buildCleanRoomArgs([], undefined, undefined, new Set(), "/agent", ["/skills/brain-storm"]);
	assert.ok(args.includes("--no-skills"));
	assert.deepEqual(args.slice(args.indexOf("--skill"), args.indexOf("--skill") + 2), ["--skill", "/skills/brain-storm"]);
});

test("resolveExtension prefers project-local extensions over global extensions", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-clean-room-"));
	const cwd = join(root, "project");
	const agentDir = join(root, "agent");
	const local = join(cwd, ".pi", "extensions", "sample");
	const global = join(agentDir, "extensions", "sample");
	mkdirSync(local, { recursive: true });
	mkdirSync(global, { recursive: true });
	assert.equal(resolveExtension("sample", cwd, agentDir), local);
});

test("discovers directory and source-file extension names", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-clean-room-"));
	const cwd = join(root, "project");
	const agentDir = join(root, "agent");
	const extensions = join(agentDir, "extensions");
	mkdirSync(join(extensions, "alpha"), { recursive: true });
	writeFileSync(join(extensions, "beta.ts"), "");
	assert.deepEqual(discoverExtensionNames(cwd, agentDir), ["alpha", "beta"]);
});

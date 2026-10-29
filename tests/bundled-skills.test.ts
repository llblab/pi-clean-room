import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import cleanRoom from "../index.ts";

test("bundled skills require their selected extension, independently of argument order", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "clean-room-bundled-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const cwd = join(root, "project");
	const owner = join(cwd, ".pi", "extensions", "owner");
	const sibling = `${owner}-other`;
	const bundled = join(owner, "skills", "clean-room-bundled-probe", "SKILL.md");
	const standalone = join(cwd, ".pi", "skills", "clean-room-standalone-probe.md");
	mkdirSync(join(owner, "skills", "clean-room-bundled-probe"), { recursive: true });
	mkdirSync(sibling);
	mkdirSync(join(cwd, ".pi", "skills"), { recursive: true });
	writeFileSync(bundled, "bundled");
	writeFileSync(standalone, "standalone");
	const entry = join(owner, "index.ts");
	const unrelatedEntry = join(owner, "other.ts");
	writeFileSync(entry, "");
	writeFileSync(unrelatedEntry, "");
	const alias = join(cwd, "owner-alias");
	symlinkSync(owner, alias, "dir");
	const outside = join(root, "external-skill.md");
	writeFileSync(outside, "externally contributed skill");
	let commands: SlashCommandInfo[] = [{
		name: "skill:clean-room-bundled-probe",
		source: "skill",
		sourceInfo: { path: bundled, source: "extension:index", scope: "temporary", origin: "top-level", baseDir: owner },
	}];
	const launches: string[][] = [];
	const notifications: string[] = [];
	const spawnMock = t.mock.method(childProcess, "spawnSync", (_command: string, args: readonly string[]) => {
		launches.push([...args]);
		return { status: 0, signal: null };
	});
	syncBuiltinESMExports();
	t.after(() => { spawnMock.mock.restore(); syncBuiltinESMExports(); });
	let handler!: Parameters<ExtensionAPI["registerCommand"]>[1]["handler"];
	cleanRoom({
		getCommands: () => commands,
		registerCommand(_name, options) { handler = options.handler; },
	} as ExtensionAPI);
	const ctx = {
		mode: "tui",
		cwd,
		modelRegistry: { getRegisteredProviderIds: () => [] },
		ui: {
			notify(message: string) { notifications.push(message); },
			async custom(factory: (tui: { stop(): void; start(): void; requestRender(full: boolean): void }, theme: undefined, keybindings: undefined, done: () => void) => unknown) {
				factory({ stop() {}, start() {}, requestRender() {} }, undefined, undefined, () => {});
			},
		},
	} as unknown as ExtensionCommandContext;
	for (const args of [
		"owner skills/clean-room-bundled-probe",
		"skills/clean-room-bundled-probe owner",
		`${entry} skills/clean-room-bundled-probe`,
		`${alias} skills/clean-room-bundled-probe`,
	].flatMap((args) => ["/", ":", "::"].map((separator) => args.replaceAll("skills/", `skills${separator}`)))) {
		await t.test(`accepts ${args}`, async () => {
			launches.length = 0;
			notifications.length = 0;
			await handler(args, ctx);
			assert.deepEqual(notifications, []);
			assert.equal(launches.length, 1);
			const selected = launches[0].flatMap((arg, index) => arg === "--skill" ? [launches[0][index + 1]] : []);
			assert.deepEqual(selected, [bundled]);
			assert.ok(launches[0].includes("--no-skills"));
			assert.ok(launches[0].includes("--no-extensions"));
			assert.ok(launches[0].includes("--extension"));
		});
	}
	for (const args of [
		"skills/clean-room-bundled-probe",
		"owner-other skills/clean-room-bundled-probe",
		`${unrelatedEntry} skills/clean-room-bundled-probe`,
		"owner skills/clean-room-unknown-probe",
		"missing-owner skills/clean-room-bundled-probe",
	].flatMap((args) => ["/", ":", "::"].map((separator) => args.replaceAll("skills/", `skills${separator}`)))) {
		await t.test(`rejects ${args}`, async () => {
			launches.length = 0;
			notifications.length = 0;
			await handler(args, ctx);
			assert.equal(launches.length, 0);
			assert.deepEqual(notifications, [args.includes("clean-room-unknown-probe")
				? "Unknown skill: clean-room-unknown-probe"
				: "Skill clean-room-bundled-probe belongs to owner; use /clean-room owner"]);
		});
	}
	notifications.length = 0;
	await handler("owner skills/clean-room-unknown-probe skills/clean-room-other-unknown-probe", ctx);
	assert.deepEqual(notifications, ["Unknown skills: clean-room-unknown-probe, clean-room-other-unknown-probe"]);
	assert.equal(launches.length, 0);
	for (const separator of ["/", ":", "::"]) {
		await t.test(`standalone skills${separator} selects the same isolated arguments`, async () => {
			notifications.length = 0;
			await handler(`skills${separator}clean-room-standalone-probe`, ctx);
			assert.deepEqual(notifications, []);
			assert.ok(launches[0].includes(standalone));
			assert.deepEqual(launches.at(-1), launches[0]);
		});
	}
	// The selected extension owns a colliding name instead of the standalone copy.
	const shadow = join(cwd, ".pi", "skills", "clean-room-bundled-probe.md");
	writeFileSync(shadow, "standalone shadow");
	launches.length = 0;
	await handler("owner skills/clean-room-bundled-probe", ctx);
	assert.ok(launches[0].includes(bundled));
	assert.ok(!launches[0].includes(shadow));
	// Extension discovery may contribute a skill outside its own directory.
	commands[0].sourceInfo.path = outside;
	for (const extension of ["owner", entry]) {
		launches.length = 0;
		await handler(`${extension} skills/clean-room-bundled-probe`, ctx);
		assert.ok(launches[0].includes(outside));
	}
	// Manifest-loaded packages use package provenance rather than an extension label.
	commands[0].sourceInfo = { path: bundled, source: "npm:owner", scope: "user", origin: "package", baseDir: owner };
	launches.length = 0;
	await handler(`${entry} skills/clean-room-bundled-probe`, ctx);
	assert.ok(launches[0].includes(bundled));
	commands = [];
	launches.length = 0;
	await handler("owner skills/clean-room-bundled-probe", ctx);
	assert.ok(launches[0].includes(shadow));
	await t.test("suggests the owning scoped npm package", async () => {
		const packageRoot = join(cwd, ".pi", "npm", "node_modules", "@example", "owner");
		mkdirSync(packageRoot, { recursive: true });
		writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@example/owner", pi: { extensions: ["./index.ts"] } }));
		const skill = join(packageRoot, "skill.md");
		writeFileSync(skill, "package-owned skill");
		commands = [{ name: "skill:clean-room-package-probe", source: "skill", sourceInfo: {
			path: skill, source: "npm:@example/owner", scope: "project", origin: "package", baseDir: packageRoot,
		} }];
		launches.length = 0;
		notifications.length = 0;
		await handler("skills/clean-room-package-probe", ctx);
		assert.deepEqual(notifications, ["Skill clean-room-package-probe belongs to @example/owner; use /clean-room @example/owner"]);
		assert.equal(launches.length, 0);
	});
});

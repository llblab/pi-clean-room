import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import cleanRoom, { buildCleanRoomArgs, discoverExtensionNames, resolveExtension } from "../index.ts";

test("append selection always overrides discovery, including missing selected files", (t) => {
	const root = mkdtempSync(join(tmpdir(), "clean-room-append-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const present of [[], ["AGENTS.md"], ["APPEND_SYSTEM.md"], ["AGENTS.md", "APPEND_SYSTEM.md"]]) {
		const agent = join(root, String(present.length) + present.join("-"));
		mkdirSync(agent);
		for (const file of present) writeFileSync(join(agent, file), "probe");
		for (const agents of [false, true]) {
			for (const append of [false, true]) {
				const resources = new Set<"agents" | "append-system">();
				if (agents) resources.add("agents");
				if (append) resources.add("append-system");
				const args = buildCleanRoomArgs([], undefined, undefined, resources, agent);
				const values = args.flatMap((arg, index) => arg === "--append-system-prompt" ? [args[index + 1]] : []);
				const expected = [
					...(agents && present.includes("AGENTS.md") ? [join(agent, "AGENTS.md")] : []),
					...(append && present.includes("APPEND_SYSTEM.md") ? [join(agent, "APPEND_SYSTEM.md")] : []),
				];
				assert.deepEqual(values, expected.length ? expected : [""]);
			}
		}
	}
});

test("every discovered source suffix resolves by name with project-local precedence", (t) => {
	const root = mkdtempSync(join(tmpdir(), "clean-room-suffixes-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const cwd = join(root, "project");
	const agent = join(root, "agent");
	const local = join(cwd, ".pi", "extensions");
	const global = join(agent, "extensions");
	mkdirSync(local, { recursive: true });
	mkdirSync(global, { recursive: true });
	const suffixes = ["ts", "js", "mts", "mjs", "cts", "cjs"];
	for (const suffix of suffixes) {
		const name = `sample-${suffix}`;
		writeFileSync(join(local, `${name}.${suffix}`), "");
		writeFileSync(join(global, `${name}.ts`), "");
		assert.equal(resolveExtension(name, cwd, agent), join(local, `${name}.${suffix}`));
	}
	assert.deepEqual(discoverExtensionNames(cwd, agent), suffixes.map((suffix) => `sample-${suffix}`).sort());
});

test("terminal ownership is restored before reporting each child outcome", async (t) => {
	const outcomes = [
		{ name: "success", result: { status: 0, signal: null }, message: undefined },
		{ name: "exit failure", result: { status: 2, signal: null }, message: "exited with code 2" },
		{ name: "spawn error", result: { status: null, signal: null, error: new Error("ENOENT") }, message: "failed to start: ENOENT" },
		{ name: "signal", result: { status: null, signal: "SIGTERM" }, message: "terminated by SIGTERM" },
		{ name: "unknown status", result: { status: null, signal: null }, message: "exited with code unknown" },
		{ name: "exception", result: undefined, message: "failed: launch exception" },
	];
	for (const outcome of outcomes) {
		await t.test(outcome.name, async (t) => {
			const events: string[] = [];
			const spawnMock = t.mock.method(childProcess, "spawnSync", () => {
				events.push("spawn");
				if (!outcome.result) throw new Error("launch exception");
				return outcome.result;
			});
			syncBuiltinESMExports();
			t.after(() => { spawnMock.mock.restore(); syncBuiltinESMExports(); });
			let handler!: Parameters<ExtensionAPI["registerCommand"]>[1]["handler"];
			cleanRoom({ registerCommand(_name, options) { handler = options.handler; } } as ExtensionAPI);
			const notifications: string[] = [];
			const ctx = {
				mode: "tui",
				cwd: process.cwd(),
				ui: {
					async custom(factory: (
						tui: { stop(): void; start(): void; requestRender(full: boolean): void },
						theme: undefined,
						keybindings: undefined,
						done: () => void,
					) => { render(): string[]; invalidate(): void }) {
						const component = factory({
							stop: () => events.push("stop"),
							start: () => events.push("start"),
							requestRender: (full: boolean) => { assert.equal(full, true); events.push("render"); },
						}, undefined, undefined, () => events.push("done"));
						assert.deepEqual(component.render(), []);
						events.push("custom-returned");
					},
					notify(message: string, level: string) {
						assert.equal(level, "error");
						events.push("notify");
						notifications.push(message);
					},
				},
			} as unknown as ExtensionCommandContext;
			await handler("", ctx);
			assert.deepEqual(events, ["stop", "spawn", "start", "render", "done", "custom-returned", ...(outcome.message ? ["notify"] : [])]);
			assert.equal(notifications.length, outcome.message ? 1 : 0);
			if (outcome.message) assert.ok(notifications[0].includes(outcome.message));
		});
	}
});

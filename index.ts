import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
	CONFIG_DIR_NAME,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const EMPTY_COMPONENT = { render: () => [], invalidate: () => {} };
const EXTENSION_SUFFIXES = [".ts", ".js", ".mts", ".mjs", ".cts", ".cjs"];

function npmPackageRoots(cwd: string, agentDir: string): string[] {
	return [join(cwd, CONFIG_DIR_NAME, "npm", "node_modules"), join(agentDir, "npm", "node_modules")];
}

function installedExtensionPackage(name: string, root: string): string | undefined {
	if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name) || name === "." || name === "..") return undefined;
	const path = join(root, name);
	try {
		const manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
		if (manifest.name !== name) return undefined;
		if (Array.isArray(manifest.pi?.extensions) && manifest.pi.extensions.length > 0) return path;
		if (!manifest.pi && existsSync(join(path, "extensions"))) return path;
	} catch {
		// Missing or invalid npm package manifest.
	}
	return undefined;
}

function discoverInstalledExtensionNames(cwd: string, agentDir: string): string[] {
	const names = new Set<string>();
	for (const root of npmPackageRoots(cwd, agentDir)) {
		if (!existsSync(root)) continue;
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			if (entry.name.startsWith("@") && entry.isDirectory()) {
				for (const child of readdirSync(join(root, entry.name), { withFileTypes: true })) {
					const name = `${entry.name}/${child.name}`;
					if (child.isDirectory() && installedExtensionPackage(name, root)) names.add(name);
				}
			} else if (entry.isDirectory() && installedExtensionPackage(entry.name, root)) names.add(entry.name);
		}
	}
	return [...names];
}

export function discoverExtensionNames(cwd: string, agentDir = getAgentDir()): string[] {
	const roots = [join(agentDir, "extensions"), join(cwd, CONFIG_DIR_NAME, "extensions")];
	const names = new Set<string>();
	for (const root of roots) {
		if (!existsSync(root)) continue;
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			if (entry.isDirectory()) names.add(entry.name);
			const suffix = EXTENSION_SUFFIXES.find((suffix) => entry.name.endsWith(suffix));
			if (entry.isFile() && suffix) names.add(entry.name.slice(0, -suffix.length));
		}
	}
	for (const name of discoverInstalledExtensionNames(cwd, agentDir)) names.add(name);
	return [...names].sort();
}

export function resolveExtension(source: string, cwd: string, agentDir = getAgentDir()): string | undefined {
	const direct = isAbsolute(source) ? source : resolve(cwd, source);
	if (existsSync(direct)) return direct;

	const roots = [join(cwd, CONFIG_DIR_NAME, "extensions"), join(agentDir, "extensions")];
	for (const root of roots) {
		for (const candidate of [join(root, source), ...EXTENSION_SUFFIXES.map((suffix) => join(root, `${source}${suffix}`))]) {
			if (existsSync(candidate)) return candidate;
		}
	}
	for (const root of npmPackageRoots(cwd, agentDir)) {
		const path = installedExtensionPackage(source, root);
		if (path) return path;
	}
	return undefined;
}

export function resolveSkill(name: string, cwd: string, agentDir = getAgentDir()): string | undefined {
	if (!name || name.includes("..") || isAbsolute(name)) return undefined;
	const roots = [
		join(cwd, CONFIG_DIR_NAME, "skills"),
		join(cwd, ".agents", "skills"),
		join(agentDir, "skills"),
		join(homedir(), ".agents", "skills"),
	];
	for (const root of roots) {
		for (const candidate of [join(root, name), join(root, `${name}.md`)]) {
			if (existsSync(candidate)) return candidate;
		}
	}
	return undefined;
}

export const RESOURCE_ARGUMENTS = ["skills", "agents", "system", "append-system"] as const;
type ResourceArgument = (typeof RESOURCE_ARGUMENTS)[number];

export function buildCleanRoomArgs(
	extensions: string[],
	model?: { provider: string; id: string },
	thinkingLevel?: string,
	resources: ReadonlySet<ResourceArgument> = new Set(),
	agentDir = getAgentDir(),
	skills: string[] = [],
): string[] {
	const args = ["--no-extensions"];
	if (!resources.has("skills")) args.push("--no-skills");
	for (const skill of skills) args.push("--skill", skill);
	args.push("--no-prompt-templates", "--no-themes", "--no-context-files");

	const systemPath = join(agentDir, "SYSTEM.md");
	args.push("--system-prompt", resources.has("system") && existsSync(systemPath) ? readFileSync(systemPath, "utf8") : "");
	const appendPaths: string[] = [];
	for (const [resource, file] of [["agents", "AGENTS.md"], ["append-system", "APPEND_SYSTEM.md"]] as const) {
		const path = join(agentDir, file);
		if (resources.has(resource) && existsSync(path)) appendPaths.push(path);
	}
	for (const path of appendPaths.length > 0 ? appendPaths : [""]) args.push("--append-system-prompt", path);

	if (model) args.push("--model", `${model.provider}/${model.id}`);
	if (thinkingLevel) args.push("--thinking", thinkingLevel);
	for (const extension of extensions) args.push("--extension", extension);
	return args;
}

function parseNames(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

function launchCleanRoom(
	ctx: ExtensionCommandContext,
	extensionPaths: string[],
	resources: ReadonlySet<ResourceArgument>,
	skills: string[],
) {
	// Providers registered by parent extensions may not exist in the isolated child.
	const extensionProviders = new Set(ctx.modelRegistry.getRegisteredProviderIds());
	const model = ctx.model && !extensionProviders.has(ctx.model.provider) ? ctx.model : undefined;
	const scopedModels = ctx.scopedModels?.filter(({ model }) => !extensionProviders.has(model.provider));
	const args = buildCleanRoomArgs(extensionPaths, model, ctx.thinkingLevel, resources, getAgentDir(), skills);
	if (scopedModels?.length) args.push("--models", scopedModels.map(({ model }) => `${model.provider}/${model.id}`).join(","));
	const cliEntry = process.argv[1];
	const command = cliEntry && existsSync(cliEntry) ? process.execPath : "pi";
	const commandArgs = cliEntry && existsSync(cliEntry) ? [cliEntry, ...args] : args;

	return spawnSync(command, commandArgs, {
		cwd: ctx.cwd,
		env: process.env,
		stdio: "inherit",
	});
}

export default function cleanRoomExtension(pi: ExtensionAPI) {
	pi.registerCommand("clean-room", {
		description: "Launch a clean Pi session with only the named extensions",
		getArgumentCompletions(prefix) {
			const separator = prefix.lastIndexOf(" ");
			const head = separator === -1 ? "" : prefix.slice(0, separator + 1);
			const needle = prefix.slice(separator + 1).toLowerCase();
			const selected = new Set(parseNames(head));
			const items = [...RESOURCE_ARGUMENTS, ...discoverExtensionNames(process.cwd())]
				.filter((name) => !selected.has(name) && name.toLowerCase().startsWith(needle))
				.map((name) => ({ value: `${head}${name}`, label: name }));
			return items.length > 0 ? items : null;
		},
		async handler(rawArgs, ctx) {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("pi-clean-room requires interactive TUI mode", "error");
				return;
			}

			const names = parseNames(rawArgs);
			const resources = new Set(names.filter((name): name is ResourceArgument =>
				(RESOURCE_ARGUMENTS as readonly string[]).includes(name),
			));
			const skillNames = names.filter((name) => name.startsWith("skills/")).map((name) => name.slice("skills/".length));
			const extensionNames = names.filter((name) => !resources.has(name as ResourceArgument) && !name.startsWith("skills/"));
			const missingSkills: string[] = [];
			const skills = skillNames.map((name) => {
				const path = resolveSkill(name, ctx.cwd);
				if (!path) missingSkills.push(name);
				return path;
			}).filter((path): path is string => path !== undefined);
			const missingExtensions: string[] = [];
			const paths = extensionNames.map((name) => {
				const path = resolveExtension(name, ctx.cwd);
				if (!path) missingExtensions.push(name);
				return path;
			}).filter((path): path is string => path !== undefined);
			if (missingSkills.length > 0) {
				ctx.ui.notify(`Unknown skill${missingSkills.length > 1 ? "s" : ""}: ${missingSkills.join(", ")}`, "error");
				return;
			}
			if (missingExtensions.length > 0) {
				ctx.ui.notify(`Unknown extension${missingExtensions.length > 1 ? "s" : ""}: ${missingExtensions.join(", ")}`, "error");
				return;
			}

			let failure: string | undefined;
			await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
				tui.stop();
				try {
					process.stdout.write("\x1b[2J\x1b[H");
					const result = launchCleanRoom(ctx, paths, resources, skills);
					if (result.error) failure = `pi-clean-room failed to start: ${result.error.message}`;
					else if (result.signal) failure = `pi-clean-room terminated by ${result.signal}`;
					else if (result.status !== 0) failure = `pi-clean-room exited with code ${result.status ?? "unknown"}`;
				} catch (error) {
					failure = `pi-clean-room failed: ${error instanceof Error ? error.message : String(error)}`;
				} finally {
					tui.start();
					tui.requestRender(true);
					done();
				}
				return EMPTY_COMPONENT;
			});
			if (failure) ctx.ui.notify(failure, "error");
		},
	});
}

// @ts-nocheck
// Plan usage per account instead of one pooled number.
//   expanded (default): widget above the editor, one block per account with email, 5h and weekly limits
//   folded:             one compact line in the `status` status-line segment
// Toggle with Alt+U or /usage-fold; the choice persists in ~/.omp/agent/usage-per-account.json.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WIDGET_KEY = "usage-accounts";
const STATUS_KEY = "usage-accounts";
const STATE_FILE = path.join(os.homedir(), ".omp", "agent", "usage-per-account.json");
const REFRESH_MS = 5 * 60_000;
const MIN_FETCH_GAP_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const BAR_CELLS = 10;
const FOLDED_LABEL_LEN = 8;
const FOLDED_SHOW_RESET_AT = 0.8;

const PROVIDER_NAME = { anthropic: "Claude", "openai-codex": "Codex" };

function windowClass(limit) {
	const id = limit.scope?.windowId ?? limit.window?.id;
	if (id === "5h" || id === "7d") return id;
	const ms = limit.window?.durationMs;
	if (ms === 5 * 3_600_000) return "5h";
	if (ms === 7 * 86_400_000) return "7d";
	return undefined;
}

// Pooled per-account windows only: skip model/tier meters such as "7 Day (Fable)".
function mainWindows(report) {
	const out = {};
	for (const limit of report.limits ?? []) {
		if (limit.scope?.tier || limit.scope?.modelId) continue;
		const cls = windowClass(limit);
		const used = limit.amount?.usedFraction;
		if (!cls || typeof used !== "number" || out[cls]) continue;
		out[cls] = { used, resetsAt: limit.window?.resetsAt };
	}
	return out;
}

function koreanDuration(ms) {
	const minutes = Math.max(1, Math.round(ms / 60_000));
	if (minutes < 60) return `${minutes}분`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return minutes % 60 ? `${hours}시간 ${minutes % 60}분` : `${hours}시간`;
	return hours % 24 ? `${Math.floor(hours / 24)}일 ${hours % 24}시간` : `${Math.floor(hours / 24)}일`;
}

function shortDuration(ms) {
	const minutes = Math.max(0, Math.round(ms / 60_000));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d${hours % 24}h`;
}

function levelColor(used) {
	if (used >= 0.8) return "error";
	if (used >= 0.5) return "warning";
	return "success";
}

function paint(theme, color, text) {
	if (!color || typeof theme?.fg !== "function") return text;
	try {
		return theme.fg(color, text);
	} catch {
		return text;
	}
}

function accountEmail(report) {
	const m = report.metadata ?? {};
	return m.email ?? m.accountId ?? "account";
}

function activeIdentity(ctx, provider) {
	try {
		const sessionId = ctx.sessionManager?.getSessionId?.();
		return ctx.modelRegistry?.authStorage?.oauth?.identity?.(provider, sessionId);
	} catch {
		return undefined;
	}
}

function isActive(report, identity) {
	if (!identity) return false;
	const m = report.metadata ?? {};
	return [
		[m.accountId, identity.accountId],
		[m.email, identity.email],
	].some(([a, b]) => {
		const key = typeof a === "string" ? a.trim().toLowerCase() : "";
		return key !== "" && typeof b === "string" && key === b.trim().toLowerCase();
	});
}

// Providers to show: every multi-account provider, plus the current model's provider.
function collectGroups(ctx, reports) {
	const byProvider = new Map();
	for (const report of reports) {
		if (!report?.provider || !Array.isArray(report.limits)) continue;
		const list = byProvider.get(report.provider) ?? [];
		list.push(report);
		byProvider.set(report.provider, list);
	}
	const groups = [];
	for (const [provider, list] of byProvider) {
		const multi = list.length > 1;
		if (!multi && provider !== ctx.model?.provider) continue;
		const identity = multi ? activeIdentity(ctx, provider) : undefined;
		const accounts = list
			.map((report) => ({ report, wins: mainWindows(report), active: multi && isActive(report, identity) }))
			.filter((a) => a.wins["5h"] || a.wins["7d"]);
		if (accounts.length > 0) groups.push({ provider, multi, accounts });
	}
	return groups;
}

function windowRow(theme, name, win, now) {
	if (!win) return `    ${name}  ${paint(theme, "dim", "정보 없음")}`;
	const filled = Math.min(BAR_CELLS, Math.round(win.used * BAR_CELLS));
	const color = levelColor(win.used);
	const bar = paint(theme, color, "█".repeat(filled)) + paint(theme, "dim", "░".repeat(BAR_CELLS - filled));
	const pct = paint(theme, color, `${String(Math.round(win.used * 100)).padStart(3)}%`);
	const reset =
		typeof win.resetsAt === "number" && win.resetsAt > now
			? paint(theme, "muted", `  ${koreanDuration(win.resetsAt - now)} 후 초기화`)
			: "";
	return `    ${name}  ${bar} ${pct}${reset}`;
}

function renderExpanded(ctx, groups) {
	const theme = ctx.ui?.theme;
	const now = Date.now();
	const lines = [];
	groups.forEach((group, index) => {
		const name = PROVIDER_NAME[group.provider] ?? group.provider;
		const hint = index === 0 ? paint(theme, "dim", "  · Alt+U 접기") : "";
		if (group.multi) {
			lines.push(`${paint(theme, "accent", `${name} 사용량`)}${hint}`);
		}
		for (const { report, wins, active } of group.accounts) {
			const email = accountEmail(report);
			const head = group.multi
				? `${active ? paint(theme, "accent", "▸ ") : "  "}${active ? paint(theme, "accent", email) : email}${active ? paint(theme, "dim", "  (사용 중)") : ""}`
				: `${paint(theme, "accent", `${name} 사용량`)}  ${email}${hint}`;
			lines.push(head);
			lines.push(windowRow(theme, "5시간", wins["5h"], now));
			lines.push(windowRow(theme, "1주일", wins["7d"], now));
		}
	});
	return lines;
}

function renderFolded(ctx, groups) {
	const theme = ctx.ui?.theme;
	const now = Date.now();
	const cell = (name, win) => {
		if (!win) return undefined;
		let text = `${name} ${Math.round(win.used * 100)}%`;
		if (win.used >= FOLDED_SHOW_RESET_AT && typeof win.resetsAt === "number" && win.resetsAt > now) {
			text += ` ${shortDuration(win.resetsAt - now)}`;
		}
		return win.used >= 0.5 ? paint(theme, levelColor(win.used), text) : text;
	};
	const text = groups
		.map((group) =>
			group.accounts
				.map(({ report, wins, active }) => {
					const label = group.multi
						? String(accountEmail(report)).split("@")[0].slice(0, FOLDED_LABEL_LEN)
						: (PROVIDER_NAME[group.provider] ?? group.provider).toLowerCase();
					const cells = [cell("5h", wins["5h"]), cell("7d", wins["7d"])].filter(Boolean).join("·");
					return `${active ? "▸" : ""}${label} ${cells}`;
				})
				.join(" │ "),
		)
		.join(" ║ ");
	return text || undefined;
}

function loadFolded() {
	try {
		return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).folded === true;
	} catch {
		return false;
	}
}

function saveFolded(folded) {
	try {
		fs.writeFileSync(STATE_FILE, `${JSON.stringify({ folded })}\n`);
	} catch {
		// the toggle still applies to this session
	}
}

export default function (pi) {
	let reports = [];
	let lastFetch = 0;
	let inFlight = false;
	let timer;
	let folded = loadFolded();

	const isRoot = (ctx) => ctx?.hasUI && ctx.mode === "tui" && ctx.agent?.kind !== "sub";

	const paintUsage = (ctx) => {
		const groups = collectGroups(ctx, reports);
		if (folded || groups.length === 0) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			ctx.ui.setStatus(STATUS_KEY, renderFolded(ctx, groups));
		} else {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, renderExpanded(ctx, groups), { placement: "aboveEditor" });
		}
	};

	const refresh = async (ctx) => {
		if (inFlight || Date.now() - lastFetch < MIN_FETCH_GAP_MS) {
			paintUsage(ctx);
			return;
		}
		const usage = ctx.modelRegistry?.authStorage?.usage;
		if (typeof usage?.reports !== "function") return;
		inFlight = true;
		lastFetch = Date.now();
		try {
			const result = await usage.reports({
				baseUrlResolver: (provider) => ctx.modelRegistry.getProviderBaseUrl?.(provider),
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (Array.isArray(result)) reports = result;
		} catch {
			// keep the last good snapshot
		} finally {
			inFlight = false;
		}
		paintUsage(ctx);
	};

	const toggle = (ctx) => {
		if (!isRoot(ctx)) return;
		folded = !folded;
		saveFolded(folded);
		paintUsage(ctx);
	};

	pi.registerShortcut("alt+u", {
		description: "Fold/unfold per-account usage",
		handler: toggle,
	});

	pi.registerCommand("usage-fold", {
		description: "Fold/unfold per-account usage (same as Alt+U)",
		handler: async (_args, ctx) => toggle(ctx),
	});

	pi.on("session_start", (_event, ctx) => {
		if (!isRoot(ctx)) return;
		if (timer) ctx.clearTimer(timer);
		lastFetch = 0;
		void refresh(ctx);
		timer = ctx.setInterval(() => refresh(ctx), REFRESH_MS);
	});

	pi.on("agent_end", (_event, ctx) => {
		if (isRoot(ctx)) void refresh(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (timer) ctx.clearTimer?.(timer);
		timer = undefined;
	});
}

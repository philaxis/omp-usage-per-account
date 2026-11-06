// @ts-nocheck
// One compact line above the editor with plan usage for one account at a time, in fixed columns:
//    Claude me@example.com     │ 5h   4% 1h2m  │ 1w   2% 6d1h  │ 1/4
// Alt+U (or /usage-next) steps to the next account: every subscription account omp reports usage for
// (Claude, ChatGPT/Codex, ...) plus the DeepSeek balance when a DeepSeek key is configured.
// Each provider's account in use has an inverted accent label; the current model's provider is listed first.

const WIDGET_KEY = "usage-accounts";
const REFRESH_MS = 5 * 60_000;
const MIN_FETCH_GAP_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_LOW_BALANCE = 1;
const PCT_WIDTH = 4; // "100%"
const RESET_WIDTH = 5; // "6d23h", "4h59m"
// Both window cells plus the separator between them; the DeepSeek balance fills the same span.
const BODY_WIDTH = 2 * (2 + 1 + PCT_WIDTH + 1 + RESET_WIDTH) + 3;

const PROVIDER_NAME = { anthropic: "Claude", "openai-codex": "ChatGPT", deepseek: "DeepSeek" };
const CURRENCY_SYMBOL = { USD: "$", CNY: "¥" };

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

function shortDuration(ms) {
	const minutes = Math.max(1, Math.round(ms / 60_000));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return minutes % 60 ? `${hours}h${minutes % 60}m` : `${hours}h`;
	return hours % 24 ? `${Math.floor(hours / 24)}d${hours % 24}h` : `${Math.floor(hours / 24)}d`;
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

function activeIdentity(ctx, provider) {
	try {
		const sessionId = ctx.sessionManager?.getSessionId?.();
		return ctx.modelRegistry?.authStorage?.oauth?.identity?.(provider, sessionId);
	} catch {
		return undefined;
	}
}

function sameAccount(report, identity) {
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

// Rotation entries. Every provider marks the account omp uses for it (its only account, or the
// account this session is pinned to); the current model's provider comes first.
function collectEntries(ctx, reports, deepseek) {
	const currentProvider = ctx.model?.provider;
	const byProvider = new Map();
	for (const report of reports) {
		if (!report?.provider || !Array.isArray(report.limits)) continue;
		const list = byProvider.get(report.provider) ?? [];
		list.push(report);
		byProvider.set(report.provider, list);
	}
	const entries = [];
	for (const [provider, list] of byProvider) {
		const identity = list.length > 1 ? activeIdentity(ctx, provider) : undefined;
		// No session pin for this provider yet: omp starts from its first account.
		const pinned = list.some((report) => sameAccount(report, identity));
		list.forEach((report, i) => {
			const wins = mainWindows(report);
			if (!wins["5h"] && !wins["7d"]) return;
			const m = report.metadata ?? {};
			const account = m.email ?? m.accountId ?? "account";
			entries.push({
				key: `${provider}\u0000${account}`,
				kind: "plan",
				provider,
				account,
				wins,
				active: list.length === 1 || (pinned ? sameAccount(report, identity) : i === 0),
			});
		});
	}
	if (deepseek) {
		entries.push({
			key: "deepseek\u0000balance",
			kind: "balance",
			provider: "deepseek",
			balance: deepseek,
			active: deepseek.available,
		});
	}
	const rank = (e) => (e.provider === currentProvider ? 0 : 2) + (e.active ? 0 : 1);
	return entries.sort((a, b) => rank(a) - rank(b));
}

// Fixed-width cell ("5h  98% 2d12h") so the columns stay put while rotating.
function windowCell(theme, name, win, now) {
	if (!win) return `${name} ${paint(theme, "dim", "   -".padEnd(PCT_WIDTH + 1 + RESET_WIDTH))}`;
	const pct = paint(theme, levelColor(win.used), `${Math.round(win.used * 100)}%`.padStart(PCT_WIDTH));
	const resetText =
		typeof win.resetsAt === "number" && win.resetsAt > now ? shortDuration(win.resetsAt - now) : "";
	return `${name} ${pct} ${paint(theme, "dim", resetText.padEnd(RESET_WIDTH))}`;
}

function balanceCell(theme, balance) {
	if (!balance.available) return paint(theme, "error", "unavailable".padEnd(BODY_WIDTH));
	const parts = balance.infos.map((info) => {
		const amount = Number(info.total_balance);
		const symbol = CURRENCY_SYMBOL[info.currency] ?? `${info.currency} `;
		const text = `${symbol}${Number.isFinite(amount) ? amount.toFixed(2) : info.total_balance} left`;
		const color = !Number.isFinite(amount) || amount <= 0 ? "error" : amount < DEEPSEEK_LOW_BALANCE ? "warning" : "success";
		return { text, color };
	});
	if (parts.length === 0) return paint(theme, "dim", "-".padEnd(BODY_WIDTH));
	const pad = " ".repeat(Math.max(0, BODY_WIDTH - parts.map((p) => p.text).join("  ").length));
	return parts.map((p) => paint(theme, p.color, p.text)).join("  ") + pad;
}

function entryLabel(entry) {
	const name = PROVIDER_NAME[entry.provider] ?? entry.provider;
	return entry.kind === "plan" ? `${name} ${entry.account}` : name;
}

function renderLine(ctx, entry, index, total, labelWidth) {
	const theme = ctx.ui?.theme;
	const now = Date.now();
	const text = ` ${entryLabel(entry).padEnd(labelWidth)} `;
	const label = entry.active ? `\x1b[7m${paint(theme, "accent", text)}\x1b[27m` : paint(theme, "muted", text);
	const sep = paint(theme, "dim", " │ ");
	const body =
		entry.kind === "plan"
			? `${windowCell(theme, "5h", entry.wins["5h"], now)}${sep}${windowCell(theme, "1w", entry.wins["7d"], now)}`
			: balanceCell(theme, entry.balance);
	const nav = total > 1 ? `${sep}${paint(theme, "dim", `${index + 1}/${total}`)}` : "";
	return `${label}${sep}${body}${nav}`;
}

async function fetchDeepseekBalance(ctx, signal) {
	const registry = ctx.modelRegistry;
	const apiKey = await registry?.getApiKeyForProvider?.("deepseek", ctx.sessionManager?.getSessionId?.());
	if (!apiKey) return undefined;
	const baseUrl = String(registry.getProviderBaseUrl?.("deepseek") ?? DEEPSEEK_DEFAULT_BASE_URL)
		.replace(/\/+$/, "")
		.replace(/\/v1$/, "");
	const response = await fetch(`${baseUrl}/user/balance`, {
		headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
		signal,
	});
	if (!response.ok) return undefined;
	const body = await response.json();
	return {
		available: body?.is_available !== false,
		infos: Array.isArray(body?.balance_infos) ? body.balance_infos : [],
	};
}

export default function (pi) {
	let reports = [];
	let deepseek;
	let lastFetch = 0;
	let inFlight = false;
	let timer;
	let selectedKey;
	let lastActiveKey;

	const isRoot = (ctx) => ctx?.hasUI && ctx.mode === "tui" && ctx.agent?.kind !== "sub";

	const paintUsage = (ctx, step = 0) => {
		const entries = collectEntries(ctx, reports, deepseek);
		if (entries.length === 0) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		// Follow the account in use whenever it changes; otherwise keep the user's pick.
		const activeKey = entries.find((e) => e.active)?.key;
		if (activeKey !== lastActiveKey) {
			lastActiveKey = activeKey;
			selectedKey = activeKey;
		}
		let index = Math.max(
			0,
			entries.findIndex((e) => e.key === selectedKey),
		);
		index = (index + step) % entries.length;
		selectedKey = entries[index].key;
		// One label width for every entry, so 5h / 1w start at the same column on each account.
		const labelWidth = Math.max(...entries.map((e) => entryLabel(e).length));
		ctx.ui.setWidget(WIDGET_KEY, [renderLine(ctx, entries[index], index, entries.length, labelWidth)], {
			placement: "aboveEditor",
		});
	};

	const refresh = async (ctx) => {
		if (inFlight || Date.now() - lastFetch < MIN_FETCH_GAP_MS) {
			paintUsage(ctx);
			return;
		}
		inFlight = true;
		lastFetch = Date.now();
		const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
		const usage = ctx.modelRegistry?.authStorage?.usage;
		const [planResult, deepseekResult] = await Promise.allSettled([
			typeof usage?.reports === "function"
				? usage.reports({
						baseUrlResolver: (provider) => ctx.modelRegistry.getProviderBaseUrl?.(provider),
						signal,
					})
				: undefined,
			fetchDeepseekBalance(ctx, signal),
		]);
		// Keep the last good snapshot on failure.
		if (planResult.status === "fulfilled" && Array.isArray(planResult.value)) reports = planResult.value;
		if (deepseekResult.status === "fulfilled" && deepseekResult.value) deepseek = deepseekResult.value;
		inFlight = false;
		paintUsage(ctx);
	};

	const next = (ctx) => {
		if (isRoot(ctx)) paintUsage(ctx, 1);
	};

	pi.registerShortcut("alt+u", {
		description: "Show the next account's usage",
		handler: next,
	});

	pi.registerCommand("usage-next", {
		description: "Show the next account's usage (same as Alt+U)",
		handler: async (_args, ctx) => next(ctx),
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

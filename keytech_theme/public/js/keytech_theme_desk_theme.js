// Copyright (c) 2026, Keytech and contributors
// For license information, please see license.txt
//
// KeytechDeskTheme - Desk color theming engine
// Applies custom CSS variables in light mode.
// In dark mode: clears all custom vars → Frappe dark.scss takes over.

class KeytechDeskTheme {
	constructor() {
		this.cacheKey = "keytech_desk_theme_cache";
		this.cacheTTL = 30 * 24 * 60 * 60 * 1000; // 30 days
		this.themeData = null;

		this.cssVars = [
			"--bt-navbar-bg", "--bt-navbar-color",
			"--bt-body-bg", "--bt-card-bg", "--bt-text-color",
			"--bt-heading-color", "--bt-primary",
			"--bt-sidebar-bg", "--bt-sidebar-color",
			"--bt-sidebar-active-bg", "--bt-sidebar-active-color",
			"--bt-btn-primary-bg", "--bt-btn-primary-color",
			"--bt-btn-primary-hover-bg", "--bt-btn-primary-hover-color",
			"--bt-btn-secondary-bg", "--bt-btn-secondary-color",
			"--bt-btn-secondary-hover-bg", "--bt-btn-secondary-hover-color",
			"--bt-table-head-bg", "--bt-table-head-color",
			"--bt-table-body-bg", "--bt-table-body-color",
			"--bt-widget-bg", "--bt-widget-color",
			"--bt-number-card-bg", "--bt-number-card-border", "--bt-number-card-color",
			"--bt-input-bg", "--bt-input-border", "--bt-input-color", "--bt-input-label-color",
			"--bt-hide-help", "--bt-hide-app-switcher",
		];

		this._observe();
		this._boot();
	}

	// ── public ──────────────────────────────────────────────────────

	clearCache() {
		try {
			localStorage.removeItem(this.cacheKey);
		} catch (_) {}
		this.themeData = null;
	}

	refresh() {
		this.clearCache();
		this._fetch(true);
	}

	// ── private: boot (priority chain) ──────────────────────────────

	_boot() {
		console.log("[BT] _boot() called");
		// 1) Try frappe.boot (sync, available after frappe.ready)
		const bootData = window.frappe?.boot?.keytech_theme;
		console.log("[BT] boot data:", bootData ? Object.keys(bootData).length + " keys" : "EMPTY");
		if (bootData && Object.keys(bootData).length > 0) {
			this.themeData = bootData;
			this._writeCache(bootData);
			this._apply();
			return;
		}

		// 2) Try localStorage cache (instant)
		const cached = this._readCache();
		console.log("[BT] cache:", cached ? Object.keys(cached).length + " keys" : "EMPTY");
		if (cached) {
			this.themeData = cached;
			this._apply();
			// Still fetch fresh in background
			this._fetch(true);
			return;
		}

		// 3) Sync XHR fallback (incognito first visit)
		console.log("[BT] trying sync XHR...");
		const syncData = this._fetchSync();
		console.log("[BT] sync XHR result:", syncData ? Object.keys(syncData).length + " keys" : "NULL");
		if (syncData) {
			this.themeData = syncData;
			this._writeCache(syncData);
			this._apply();
			return;
		}

		// 4) Last resort: async fetch
		console.log("[BT] falling back to async fetch");
		this._fetch(false);
	}

	_fetchSync() {
		try {
			const xhr = new XMLHttpRequest();
			xhr.open("GET", "/api/method/keytech_theme.api.get_keytech_theme", false); // false = sync
			xhr.setRequestHeader("Accept", "application/json");
			xhr.send();
			if (xhr.status === 200) {
				const body = JSON.parse(xhr.responseText);
				return body?.message || null;
			}
		} catch (_) {}
		return null;
	}

	// ── private: cache ──────────────────────────────────────────────

	_readCache() {
		try {
			const raw = localStorage.getItem(this.cacheKey);
			if (!raw) return null;
			const obj = JSON.parse(raw);
			if (Date.now() - (obj.ts || 0) > this.cacheTTL) return null;
			return obj.data || null;
		} catch (_) {
			return null;
		}
	}

	_writeCache(data) {
		try {
			localStorage.setItem(this.cacheKey, JSON.stringify({ data, ts: Date.now() }));
		} catch (_) {}
	}

	// ── private: fetch ──────────────────────────────────────────────

	async _fetch(force) {
		if (!force) {
			const cached = this._readCache();
			if (cached) {
				this.themeData = cached;
				this._apply();
				return;
			}
		}
		try {
			const r = await frappe.xcall("keytech_theme.api.get_keytech_theme");
			if (r) {
				this.themeData = r;
				this._writeCache(r);
				this._apply();
			}
		} catch (_) {}
	}

	// ── private: observe theme mode changes ─────────────────────────

	_observe() {
		const mo = new MutationObserver(() => this._apply());
		mo.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme-mode"],
		});
	}

	// ── private: apply / clear ──────────────────────────────────────

	_apply() {
		const mode = document.documentElement.getAttribute("data-theme-mode");
		console.log("[BT] _apply() mode:", mode, "themeData:", this.themeData ? "present" : "NULL");
		if (mode === "dark") {
			console.log("[BT] dark mode → clearing vars");
			this._clear();
			return;
		}
		this._setVars();
	}

	_clear() {
		const root = document.documentElement;
		this.cssVars.forEach((v) => root.style.removeProperty(v));
	}

	_setVars() {
		const root = document.documentElement;
		const t = this.themeData;
		if (!t) return;

		const set = (prop, val) => {
			if (val) root.style.setProperty(prop, val);
		};

		console.log("[BT] _setVars() sidebar_bg_color:", t.sidebar_bg_color);
		console.log("[BT] _setVars() navbar_bg_color:", t.navbar_bg_color);

		set("--bt-navbar-bg", t.navbar_bg_color);
		set("--bt-navbar-color", t.navbar_text_color);
		set("--bt-body-bg", t.body_bg_color);
		set("--bt-card-bg", t.card_bg_color);
		set("--bt-text-color", t.text_color);
		set("--bt-heading-color", t.heading_color);
		set("--bt-primary", t.primary_color);
		set("--bt-sidebar-bg", t.sidebar_bg_color);
		set("--bt-sidebar-color", t.sidebar_text_color);
		set("--bt-sidebar-active-bg", t.sidebar_active_bg_color);
		set("--bt-sidebar-active-color", t.sidebar_active_text_color);
		set("--bt-btn-primary-bg", t.btn_primary_bg_color);
		set("--bt-btn-primary-color", t.btn_primary_text_color);
		set("--bt-btn-primary-hover-bg", t.btn_primary_hover_bg_color);
		set("--bt-btn-primary-hover-color", t.btn_primary_hover_text_color);
		set("--bt-btn-secondary-bg", t.btn_secondary_bg_color);
		set("--bt-btn-secondary-color", t.btn_secondary_text_color);
		set("--bt-btn-secondary-hover-bg", t.btn_secondary_hover_bg_color);
		set("--bt-btn-secondary-hover-color", t.btn_secondary_hover_text_color);
		set("--bt-table-head-bg", t.table_head_bg_color);
		set("--bt-table-head-color", t.table_head_text_color);
		set("--bt-table-body-bg", t.table_body_bg_color);
		set("--bt-table-body-color", t.table_body_text_color);
		set("--bt-widget-bg", t.widget_bg_color);
		set("--bt-widget-color", t.widget_text_color);
		set("--bt-number-card-bg", t.number_card_bg_color);
		set("--bt-number-card-border", t.number_card_border_color);
		set("--bt-number-card-color", t.number_card_text_color);
		set("--bt-input-bg", t.input_bg_color);
		set("--bt-input-border", t.input_border_color);
		set("--bt-input-color", t.input_text_color);
		set("--bt-input-label-color", t.input_label_color);
		root.style.setProperty("--bt-hide-help", t.hide_help_button ? "none" : "block");
		root.style.setProperty("--bt-hide-app-switcher", t.hide_app_switcher ? "none" : "flex");
	}
}

// ── bootstrap ─────────────────────────────────────────────────────
// Use frappe.ready() so frappe.boot is populated before we read it.
// Also listen for boot_info_ready for late-loading scenarios.
(function () {
	function init() {
		if (window.KeytechDeskTheme) return;
		window.KeytechDeskTheme = new KeytechDeskTheme();
	}

	if (window.frappe && frappe.ready) {
		frappe.ready(init);
	} else {
		document.addEventListener("DOMContentLoaded", init);
	}

	// Fallback: if boot arrives late, re-apply
	document.addEventListener("boot_info_ready", () => {
		if (window.KeytechDeskTheme) {
			window.KeytechDeskTheme._boot();
		}
	});
})();

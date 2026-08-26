// Copyright (c) 2026, Keytech and contributors
// For license information, please see license.txt

frappe.provide("keytech_theme");

keytech_theme = {
	_initialized: false,
	_fetched: false,

	init() {
		if (this._initialized) return;
		this._initialized = true;

		this.init_toggle();

		if (frappe.router) {
			frappe.router.on("change", () => {
				this.set_active();
				this.init_form_sidebar();
			});
		}

		if (frappe.realtime) {
			frappe.realtime.on("keytech_theme:sidebar_updated", () => this.reload_sidebar());
		}

		// app_ready fires synchronously inside Application.startup(); depending on
		// $(document).ready handler order it may fire before this listener is bound.
		if (frappe.app) {
			this.fetch_and_render();
		} else {
			$(document).on("app_ready", () => this.fetch_and_render());
		}
	},

	async fetch_and_render() {
		if (this._fetched) return;
		this._fetched = true;

		try {
			const items = await frappe.xcall("keytech_theme.api.get_sidebar_menu");
			this.render_sidebar(items || []);
		} catch (e) {
			console.error("keytech_theme: failed to load sidebar menu", e);
		}
	},

	async reload_sidebar() {
		if (this._reloading) return;
		this._reloading = true;

		try {
			this._fetched = false;
			await this.fetch_and_render();
		} finally {
			this._reloading = false;
		}
	},

	build_sidebar_container() {
		const $existing = $("#kt-sidebar");
		if ($existing.length) return $existing;

		const $sidebar = $(`
			<aside id="kt-sidebar">
				<button type="button" class="kt-sidebar-toggle" aria-label="Toggle sidebar">
					<i class="octicon octicon-chevron-left"></i>
				</button>
				<div class="kt-sidebar-body">
					<ul class="kt-sidebar-menu"></ul>
				</div>
				<div class="kt-sidebar-footer">
					<div class="kt-sidebar-user"></div>
				</div>
			</aside>
		`);

		$sidebar.find(".kt-sidebar-user").append(frappe.avatar(frappe.session.user, "avatar-medium"));
		$sidebar.find(".kt-sidebar-user").append(
			$("<span>").addClass("kt-sidebar-user-name").text(frappe.user_info().fullname)
		);

		$("body").prepend($sidebar);
		return $sidebar;
	},

	build_tree(items) {
		const children = {};
		items.forEach((item) => {
			const parent = item.parent_sidebar_menu || "";
			(children[parent] = children[parent] || []).push(item);
		});
		return (children[""] || []).map((item) => this.attach_children(item, children));
	},

	attach_children(item, children) {
		item.children = (children[item.name] || []).map((child) =>
			this.attach_children(child, children)
		);
		return item;
	},

	render_sidebar(items) {
		const $sidebar = this.build_sidebar_container();
		const $menu = $sidebar.find(".kt-sidebar-menu").empty();

		const tree = this.build_tree(items);
		tree.forEach((node) => $menu.append(this.render_node(node)));

		this.apply_toggle_state();
		this.set_active();
	},

	render_node(node) {
		const $li = $("<li>")
			.addClass("kt-sidebar-item")
			.attr("data-name", node.name);

		if (node.is_group) {
			$li.addClass("kt-sidebar-group");

			const $link = $("<a>").addClass("kt-sidebar-link").attr("href", "#").attr("data-name", node.name).attr("data-action", "group").attr("data-route", node.route_or_link || "");
			$link.append($("<span>").addClass("kt-sidebar-icon").html(this.icon_html(node.icon)));
			$link.append($("<span>").addClass("kt-sidebar-label").text(node.menu_label || node.name));
			$link.append($("<span>").addClass("kt-sidebar-chevron").html(frappe.utils.icon("right", "xs")));

			const $children = $("<ul>").addClass("kt-sidebar-children");
			(node.children || []).forEach((child) => $children.append(this.render_node(child)));

			$li.append($link, $children);
			return $li;
		}

		const $link = $("<a>")
			.addClass("kt-sidebar-link")
			.attr("href", this.href_for(node))
			.attr("data-name", node.name)
			.attr("data-action", node.action || "Route")
			.attr("data-route", node.route_or_link || "");
		$link.append($("<span>").addClass("kt-sidebar-icon").html(this.icon_html(node.icon)));
		$link.append($("<span>").addClass("kt-sidebar-label").text(node.menu_label || node.name));

		if (node.badge) {
			$link.append($("<span>").addClass("kt-sidebar-badge").text(node.badge));
		}

		$li.append($link);
		return $li;
	},

	icon_html(icon) {
		if (!icon) return frappe.utils.icon("folder-normal", "sm");
		if (icon.startsWith("octicon") || icon.startsWith("fa") || icon.startsWith("es-")) {
			return `<i class="${icon}"></i>`;
		}
		return frappe.utils.icon(icon, "sm");
	},

	href_for(node) {
		const route = node.route_or_link || "";
		if (node.action === "Link") return "/app/List/" + encodeURIComponent(route);
		if (route.startsWith("http")) return route;
		if (route.startsWith("/app")) return route;
		return "/app/" + route.replace(/^\//, "");
	},

	navigate(action, route) {
		if (!route || route === "#") return;

		if (action === "Link") {
			frappe.set_route("List", route);
			return;
		}
		if (route.startsWith("http")) {
			window.open(route, "_blank");
			return;
		}
		frappe.set_route(route);
	},

	set_active() {
		const $sidebar = $("#kt-sidebar");
		if (!$sidebar.length) return;

		const sub_path = (frappe.router.current_sub_path || "").toLowerCase();
		const route = frappe.router.current_route || [];

		$sidebar.find(".kt-sidebar-item").removeClass("active");

		$sidebar.find(".kt-sidebar-link").each((_, el) => {
			const $link = $(el);
			const action = $link.data("action");
			const item_route = ($link.data("route") || "").toLowerCase();

			if (action === "group") return;
			if (this.matches_route(action, item_route, sub_path, route)) {
				$link.closest(".kt-sidebar-item").addClass("active");
				$link.closest(".kt-sidebar-group").addClass("expanded");
			}
		});
	},

	init_form_sidebar() {
		const expanded = localStorage.getItem("kt_form_sidebar_expanded") === "1";

		// Wait for sidebar toggle button to be rendered (form loads async)
		const tryToggle = (retries) => {
			const $toggleBtn = $(".sidebar-toggle-btn");
			if (!$toggleBtn.length) {
				if (retries > 0) setTimeout(() => tryToggle(retries - 1), 200);
				return;
			}

			const $layoutSide = $(".layout-side-section");
			const isCurrentlyExpanded = $layoutSide.length && $layoutSide.is(":visible") && !$layoutSide.hasClass("hide-sidebar");

			if (!expanded && isCurrentlyExpanded) {
				$toggleBtn[0].click();
			} else if (expanded && !isCurrentlyExpanded) {
				$toggleBtn[0].click();
			}
		};

		setTimeout(() => tryToggle(10), 300);

		// Add "Show Sidebar" to form ⋯ menu (once per form)
		if (frappe.cur_frm) {
			const formId = frappe.cur_frm.doctype + ":" + frappe.cur_frm.docname;
			if (this._last_form_id !== formId) {
				this._last_form_id = formId;
				frappe.cur_frm.page.add_menu_item(
					__("Show Sidebar"),
					() => {
						const $btn = $(".sidebar-toggle-btn");
						if ($btn.length) $btn[0].click();
						const isVis = $(".layout-side-section").length && $(".layout-side-section").is(":visible") && !$(".layout-side-section").hasClass("hide-sidebar");
						localStorage.setItem("kt_form_sidebar_expanded", isVis ? "1" : "0");
					},
					true
				);
			}
		}
	},

	matches_route(action, item_route, sub_path, route) {
		if (action === "Link") {
			const slug = item_route.replace(/ /g, "-");
			return sub_path === slug || sub_path.startsWith(slug + "/");
		}
		if (action === "Workspace") {
			const slug = item_route.replace(/^\/app\//, "").toLowerCase();
			return sub_path === slug || sub_path.startsWith(slug + "/");
		}
		// Route
		const r = item_route.replace(/^\/app\//, "").replace(/^\/+/, "").toLowerCase();
		if (!r) return sub_path === "app" || sub_path === "workspace";
		return sub_path === r || sub_path.startsWith(r + "/");
	},

	init_toggle() {
		$(document).on("click", "#kt-sidebar .kt-sidebar-toggle", (e) => {
			e.stopPropagation();
			$("body").toggleClass("kt-sidebar-collapsed");
			$("body").toggleClass("kt-sidebar-expanded");
			const collapsed = $("body").hasClass("kt-sidebar-collapsed");
			localStorage.setItem("kt_sidebar_collapsed", collapsed ? "1" : "0");
			this.update_toggle_icon(collapsed);
		});

		$(document).on("click", "#kt-sidebar .kt-sidebar-link", (e) => {
			const $link = $(e.currentTarget);
			const action = $link.data("action");
			const name = $link.data("name");

			if (action === "group") {
				e.preventDefault();
				$(`#kt-sidebar .kt-sidebar-group[data-name="${name}"]`).toggleClass("expanded");
				const route = $link.data("route");
				if (route && route !== "#") {
					if (route.startsWith("http")) {
						window.open(route, "_blank");
					} else {
						this.navigate("Route", route);
					}
				}
				return;
			}

			const route = $link.data("route");
			if (!route || route === "#") {
				e.preventDefault();
				return;
			}

			if (route.startsWith("http")) return;
			e.preventDefault();
			this.navigate(action, route);
		});
	},

	update_toggle_icon() {
		// Icon rotation is handled by CSS (body.kt-sidebar-collapsed)
	},

	apply_toggle_state() {
		const collapsed = localStorage.getItem("kt_sidebar_collapsed") === "1";
		$("body").toggleClass("kt-sidebar-collapsed", collapsed);
		$("body").toggleClass("kt-sidebar-expanded", !collapsed);
		this.update_toggle_icon(collapsed);
	},
};

// ============================================================
// KeytechDeskTheme - Desk color theming engine
// Pattern: mirrors frappe_desk_theme.js (no jQuery dependency)
// ============================================================

class KeytechDeskTheme {
	constructor() {
		this.themeData = null;
		this.cacheKey = "keytech_desk_theme_cache";
		this.cacheTTL = 30 * 24 * 60 * 60 * 1000;
		this.carouselTimer = null;
		this.carouselIndex = 0;
		this.cssVars = [
			"--bt-navbar-bg", "--bt-navbar-color",
			"--bt-body-bg", "--bt-card-bg", "--bt-card-border-color", "--bt-text-color",
			"--bt-heading-color", "--bt-primary",
			"--bt-sidebar-bg", "--bt-sidebar-color",
			"--bt-sidebar-active-bg", "--bt-sidebar-active-color",
			"--bt-btn-primary-bg", "--bt-btn-primary-color",
			"--bt-btn-primary-hover-bg", "--bt-btn-primary-hover-color",
			"--bt-btn-primary-border",
			"--bt-btn-secondary-bg", "--bt-btn-secondary-color",
			"--bt-btn-secondary-hover-bg", "--bt-btn-secondary-hover-color",
			"--bt-btn-secondary-border",
			"--bt-table-head-bg", "--bt-table-head-color",
			"--bt-table-body-bg", "--bt-table-body-color", "--bt-table-border",
			"--bt-widget-bg", "--bt-widget-color",
			"--bt-number-card-bg", "--bt-number-card-border", "--bt-number-card-color",
			"--bt-input-bg", "--bt-input-border", "--bt-input-color", "--bt-input-label-color",
			"--bt-hide-help", "--bt-hide-app-switcher",
			"--bt-hide-like-comment",
			"--bt-login-btn-bg", "--bt-login-btn-color",
			"--bt-login-btn-hover-bg", "--bt-login-btn-hover-color",
			"--bt-login-bg-color", "--bt-login-bg-image",
			"--bt-login-box-bg", "--bt-login-box-position", "--bt-login-box-top",
			"--bt-login-box-border-radius", "--bt-login-box-padding",
			"--bt-login-box-left", "--bt-login-box-right", "--bt-login-box-bg-override",
			"--bt-login-box-width",
			"--bt-login-title-display", "--bt-login-title-content", "--bt-login-title-color",
			"--bt-carousel-fade-opacity", "--bt-carousel-bg-image",
			"--bt-footer-bg", "--bt-footer-color", "--bt-footer-border",
			"--bt-footer-display", "--bt-footer-powered-color",
			"--bt-footer-link-color", "--bt-footer-link-hover-color",
		];
		this.init();
	}

	async init() {
		try {
			this.applyCachedTheme();
			await this.loadThemeIfNeeded();
			if (this.themeData) {
				this.applyTheme();
			}
			this.setupEventListeners();
		} catch (e) {
			this.applyTheme();
		}
	}

	applyCachedTheme() {
		var cached = this.getCachedTheme();
		if (cached && cached.data) {
			this.themeData = cached.data;
			this.applyTheme();
		} else {
			this.showLoginBox();
		}
	}

	getCachedTheme() {
		try {
			var cached = localStorage.getItem(this.cacheKey);
			return cached ? JSON.parse(cached) : null;
		} catch (e) { return null; }
	}

	setCachedTheme(data) {
		try {
			localStorage.setItem(this.cacheKey, JSON.stringify({ data: data, ts: Date.now() }));
		} catch (e) {}
	}

	isCacheValid() {
		var cached = this.getCachedTheme();
		if (!cached) return false;
		return (Date.now() - (cached.ts || 0)) < this.cacheTTL;
	}

	async loadThemeIfNeeded() {
		if (this.isCacheValid()) return;
		await this.loadTheme();
	}

	async loadTheme() {
		try {
			var r = await frappe.xcall("keytech_theme.api.get_keytech_theme");
			if (r) {
				this.themeData = r;
				this.setCachedTheme(r);
			}
		} catch (e) {
			var cached = this.getCachedTheme();
			if (cached && cached.data) {
				this.themeData = cached.data;
			}
		}
	}

	async refreshTheme() {
		try {
			this.clearCache();
			await this.loadTheme();
			this.applyTheme();
		} catch (e) {}
	}

	clearCache() {
		try { localStorage.removeItem(this.cacheKey); } catch (e) {}
		this.themeData = null;
	}

	setupEventListeners() {
		var self = this;
		var mo = new MutationObserver(function () { self.applyTheme(); });
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-mode"] });
	}

	applyTheme() {
		var mode = document.documentElement.getAttribute("data-theme-mode");
		if (mode === "dark") {
			this.clearCSSVariables();
			return;
		}
		this.clearCSSVariables();
		this.setCSSVariables();
		this.applyLoginPage();
		this.applyFooter();
	}

	clearCSSVariables() {
		var root = document.documentElement;
		this.cssVars.forEach(function (v) { root.style.removeProperty(v); });
		// Clear inline styles on login card
		var pageCard = document.querySelector(".login-content.page-card");
		if (pageCard) {
			pageCard.style.removeProperty("width");
			pageCard.style.removeProperty("padding");
			pageCard.style.removeProperty("margin");
			pageCard.style.removeProperty("box-sizing");
		}
		this.removeLoginCarousel();
		this.removeFooter();
	}

	setCSSVariables() {
		var root = document.documentElement;
		var t = this.themeData;
		if (!t) return;

		var set = function (prop, val) { if (val) root.style.setProperty(prop, val); };

		// Navbar
		set("--bt-navbar-bg", t.navbar_bg_color);
		set("--bt-navbar-color", t.navbar_text_color);

		// Body
		set("--bt-body-bg", t.body_bg_color);
		set("--bt-card-bg", t.card_bg_color);
		set("--bt-card-border-color", t.card_bg_border);
		set("--bt-text-color", t.text_color);
		set("--bt-heading-color", t.heading_color);
		set("--bt-primary", t.primary_color);

		// Sidebar
		set("--bt-sidebar-bg", t.sidebar_bg_color);
		set("--bt-sidebar-color", t.sidebar_text_color);
		set("--bt-sidebar-active-bg", t.sidebar_active_bg_color);
		set("--bt-sidebar-active-color", t.sidebar_active_text_color);

		// Buttons - Primary
		set("--bt-btn-primary-bg", t.btn_primary_bg_color);
		set("--bt-btn-primary-color", t.btn_primary_text_color);
		set("--bt-btn-primary-border", t.btn_primary_border_color);
		set("--bt-btn-primary-hover-bg", t.btn_primary_hover_bg_color);
		set("--bt-btn-primary-hover-color", t.btn_primary_hover_text_color);

		// Buttons - Secondary
		set("--bt-btn-secondary-bg", t.btn_secondary_bg_color);
		set("--bt-btn-secondary-color", t.btn_secondary_text_color);
		set("--bt-btn-secondary-border", t.btn_secondary_border_color);
		set("--bt-btn-secondary-hover-bg", t.btn_secondary_hover_bg_color);
		set("--bt-btn-secondary-hover-color", t.btn_secondary_hover_text_color);

		// Tables
		set("--bt-table-head-bg", t.table_head_bg_color);
		set("--bt-table-head-color", t.table_head_text_color);
		set("--bt-table-body-bg", t.table_body_bg_color);
		set("--bt-table-body-color", t.table_body_text_color);
		set("--bt-table-border", t.table_border);

		// Widgets
		set("--bt-widget-bg", t.widget_bg_color);
		set("--bt-widget-color", t.widget_text_color);
		set("--bt-number-card-bg", t.number_card_bg_color);
		set("--bt-number-card-border", t.number_card_border_color);
		set("--bt-number-card-color", t.number_card_text_color);

		// Inputs
		set("--bt-input-bg", t.input_bg_color);
		set("--bt-input-border", t.input_border_color);
		set("--bt-input-color", t.input_text_color);
		set("--bt-input-label-color", t.input_label_color);

		// Toggles
		root.style.setProperty("--bt-hide-help", t.hide_help_button ? "none" : "block");
		root.style.setProperty("--bt-hide-app-switcher", t.hide_app_switcher ? "none" : "flex");
		root.style.setProperty("--bt-hide-like-comment", t.table_hide_like_comment_section ? "none" : "block");
	}

	// ── Login Page ─────────────────────────────────────────────

	applyLoginPage() {
		var t = this.themeData;
		var isLoginPage = document.querySelector("#page-login");
		if (!t || !isLoginPage) return;

		var root = document.documentElement;
		var set = function (prop, val) { if (val) root.style.setProperty(prop, val); };

		// Button colors
		set("--bt-login-btn-bg", t.login_button_background_color);
		set("--bt-login-btn-color", t.login_button_text_color);
		set("--bt-login-btn-hover-bg", t.login_page_button_hover_background_color);
		set("--bt-login-btn-hover-color", t.login_page_button_hover_text_color);

		// Background
		if (t.page_background_type === "Color" && t.login_page_background_color) {
			root.style.setProperty("--bt-login-bg-color", t.login_page_background_color);
		} else if (t.page_background_type === "Image" && t.login_page_background_image) {
			root.style.setProperty("--bt-login-bg-image", 'url("' + t.login_page_background_image + '")');
		} else if (t.page_background_type === "Carousel") {
			this.renderLoginCarousel();
		}

		// Box background
		set("--bt-login-box-bg", t.login_box_background_color);

		// Heading color
		if (t.page_heading_text_color) {
			root.style.setProperty("--bt-heading-color", t.page_heading_text_color);
		}

		// Login box position
		if (t.login_box_position && t.login_box_position !== "Default") {
			root.style.setProperty("--bt-login-box-position", "absolute");
			root.style.setProperty("--bt-login-box-top", "26%");
			root.style.setProperty("--bt-login-box-padding",
				t.is_app_details_inside_the_box ? "18px 40px 40px 40px" : "45px 10px");
			if (t.login_box_position === "Left") {
				root.style.setProperty("--bt-login-box-left", "10%");
				root.style.setProperty("--bt-login-box-right", "auto");
			} else {
				root.style.setProperty("--bt-login-box-right", "10%");
				root.style.setProperty("--bt-login-box-left", "auto");
			}
			// Directly set card width/padding/margin to override Frappe login bundle
			var pageCard = document.querySelector(".login-content.page-card");
			if (pageCard) {
				pageCard.style.setProperty("width", "400px", "important");
				pageCard.style.setProperty("padding", "45px 10px", "important");
				pageCard.style.setProperty("margin", "0", "important");
				pageCard.style.setProperty("box-sizing", "border-box", "important");
			}
		}

		// App details inside the box — bg override + border-radius on .for-login
		if (t.is_app_details_inside_the_box) {
			root.style.setProperty("--bt-login-box-top", "26%");
			root.style.setProperty("--bt-login-box-border-radius", "10px");
			root.style.setProperty("--bt-login-box-padding", "18px 40px 40px 40px");
			if (t.login_box_background_color) {
				root.style.setProperty("--bt-login-box-bg-override", t.login_box_background_color);
			}
		}

		// Custom login page title
		if (t.login_page_title) {
			root.style.setProperty("--bt-login-title-display", "none");
			root.style.setProperty("--bt-login-title-after-display", "flex");
			root.style.setProperty("--bt-login-title-after-justify", "center");
			root.style.setProperty("--bt-login-title-after-margin", "10px");
			root.style.setProperty("--bt-login-title-after-content", "'" + t.login_page_title + "'");
			set("--bt-login-title-after-color", t.page_heading_text_color);
		}

		this.showLoginBox();
	}

	showLoginBox() {
		var loginBox = document.querySelector(".for-login");
		if (loginBox) {
			setTimeout(function () { loginBox.classList.add("theme-ready"); }, 50);
		}
	}

	renderLoginCarousel() {
		var loginPage = document.querySelector("#page-login");
		if (!loginPage) return;
		var t = this.themeData;
		var images = t.carousel_images;
		if (!images || images.length === 0) return;

		var root = document.documentElement;
		var self = this;

		if (this.carouselIndex >= images.length) this.carouselIndex = 0;
		root.style.setProperty("--bt-carousel-bg-image", 'url("' + images[this.carouselIndex].image + '")');

		if (this.carouselTimer) clearTimeout(this.carouselTimer);
		if (t.allow_manual_navigation) {
			this.ensureCarouselButtons(loginPage, images);
		}
		this.carouselTimer = setTimeout(function () {
			self.carouselTimer = null;
			self.carouselIndex = (self.carouselIndex + 1) % images.length;
			self.renderLoginCarousel();
		}, 5000);
	}

	ensureCarouselButtons(container, images) {
		var self = this;
		if (document.getElementById("bt-carousel-left")) return;

		var left = document.createElement("button");
		left.id = "bt-carousel-left";
		left.className = "carousel-nav carousel-nav-left";
		left.innerHTML = "&#8592;";
		left.addEventListener("click", function (e) {
			e.preventDefault();
			self.carouselIndex = (self.carouselIndex - 1 + images.length) % images.length;
			if (self.carouselTimer) { clearTimeout(self.carouselTimer); self.carouselTimer = null; }
			self.renderLoginCarousel();
		});

		var right = document.createElement("button");
		right.id = "bt-carousel-right";
		right.className = "carousel-nav carousel-nav-right";
		right.innerHTML = "&#8594;";
		right.addEventListener("click", function (e) {
			e.preventDefault();
			self.carouselIndex = (self.carouselIndex + 1) % images.length;
			if (self.carouselTimer) { clearTimeout(self.carouselTimer); self.carouselTimer = null; }
			self.renderLoginCarousel();
		});

		container.appendChild(left);
		container.appendChild(right);
	}

	removeLoginCarousel() {
		var left = document.getElementById("bt-carousel-left");
		var right = document.getElementById("bt-carousel-right");
		if (left) left.remove();
		if (right) right.remove();
		if (this.carouselTimer) { clearTimeout(this.carouselTimer); this.carouselTimer = null; }
		document.documentElement.style.removeProperty("--bt-carousel-bg-image");
		document.documentElement.style.removeProperty("--bt-carousel-fade-opacity");
		this.carouselIndex = 0;
	}

	// ── Footer ─────────────────────────────────────────────────

	applyFooter() {
		var t = this.themeData;
		if (!t || document.querySelector("#page-login")) return;
		if (!t.copyright_text && !t.footer_powered_by) return;

		var footer = document.querySelector("#desk-footer");
		if (!footer) {
			var tempDiv = document.createElement("div");
			tempDiv.innerHTML = '<div id="desk-footer"><div class="desk-footer-left"></div><div class="desk-footer-right"></div></div>';
			footer = tempDiv.querySelector("#desk-footer");
			var mainSection = document.querySelector(".main-section");
			if (mainSection) {
				mainSection.appendChild(footer);
			} else {
				document.body.appendChild(footer);
			}
		}

		var left = footer.querySelector(".desk-footer-left");
		var right = footer.querySelector(".desk-footer-right");
		if (left && t.copyright_text) left.innerHTML = t.copyright_text;
		if (right && t.footer_powered_by) right.innerHTML = t.footer_powered_by;

		var root = document.documentElement;
		var set = function (prop, val) { if (val) root.style.setProperty(prop, val); };
		set("--bt-footer-bg", t.footer_background_color);
		set("--bt-footer-color", t.footer_text_color);
		set("--bt-footer-border", t.footer_border_color);

		if (t.sticky_footer) {
			footer.classList.add("sticky");
		}
	}

	removeFooter() {
		var footer = document.querySelector("#desk-footer");
		if (footer) footer.remove();
	}
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", function () {
		window.KeytechDeskTheme = new KeytechDeskTheme();
	});
} else {
	window.KeytechDeskTheme = new KeytechDeskTheme();
}

// ============================================================
// Sidebar init (uses jQuery — must come AFTER KeytechDeskTheme)
// Safe on login page: jQuery may not be loaded
// ============================================================
if (typeof $ !== "undefined") {
	$(document).ready(function () {
		keytech_theme.init();
	});
} else {
	document.addEventListener("DOMContentLoaded", function () {
		if (typeof $ !== "undefined") keytech_theme.init();
	});
}

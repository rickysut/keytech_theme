# Copyright (c) 2026, Keytech and contributors
# For license information, please see license.txt

import frappe


@frappe.whitelist()
def get_sidebar_menu():
	"""Return Sidebar Menu items for the custom desk sidebar.

	Link-type items are filtered by DocType read permission.
	Route-type items are always shown.
	"""
	entries = frappe.get_all(
		"Sidebar Menu",
		filters={"is_visible": 1},
		fields=[
			"name",
			"menu_label",
			"icon",
			"action",
			"route_or_link",
			"link_doctype",
			"parent_sidebar_menu",
			"is_group",
			"sort_order",
			"badge",
			"badge_color",
		],
		order_by="lft asc",
	)

	# --- filter Link items by DocType read permission ---
	perm_cache = {}

	def can_read(dt):
		if not dt:
			return False
		if dt not in perm_cache:
			try:
				perm_cache[dt] = frappe.has_permission(dt, "read")
			except Exception:
				perm_cache[dt] = False
		return perm_cache[dt]

	visible = []
	for item in entries:
		if item.get("action") == "Link" and not can_read(item.get("link_doctype")):
			continue
		visible.append(item)

	items = sort_menu_items(visible)

	# --- badge counts ---
	for item in items:
		if item.get("action") == "Link" and item.get("route_or_link"):
			doctype = item["route_or_link"].strip().lstrip("/")
			try:
				if frappe.db.exists("DocType", doctype):
					item["badge"] = frappe.db.count(doctype)
				else:
					item["badge"] = None
			except Exception:
				item["badge"] = None

	# --- hide groups whose children are all hidden ---
	hidden_names = {item["name"] for item in entries if item not in visible}
	if hidden_names:
		by_name = {item["name"]: item for item in items}
		for item in list(items):
			if item.get("is_group") and item["name"] in by_name:
				children = [
					c
					for c in items
					if c.get("parent_sidebar_menu") == item["name"] and c["name"] != item["name"]
				]
				if children and all(c["name"] in hidden_names for c in children):
					items = [i for i in items if i["name"] != item["name"]]

	return items


def sort_menu_items(entries):
	"""Flatten the menu tree so siblings are ordered by sort_order.

	Siblings sort by sort_order ascending (fallback to name for stability);
	children keep their own 1, 2, 3... relative to their parent only.
	"""
	grouped = {}
	for entry in entries:
		parent = entry.get("parent_sidebar_menu") or ""
		grouped.setdefault(parent, []).append(entry)

	def order_siblings(children):
		return sorted(children, key=lambda c: (c.get("sort_order") or 0, c.get("name") or ""))

	def walk(parent):
		result = []
		for child in order_siblings(grouped.get(parent, [])):
			result.append(child)
			if child.get("is_group"):
				result.extend(walk(child.get("name")))
		return result

	return walk("")


def trigger_sidebar_menu_refresh(doc=None, method=None):
	"""Notify the current user's desk sessions to re-render the custom sidebar."""
	frappe.publish_realtime(
		"keytech_theme:sidebar_updated",
		user=frappe.session.user,
		after_commit=True,
	)


@frappe.whitelist(allow_guest=True)
def get_keytech_theme():
	"""Return Keytech Theme singleton as dict for frontend CSS variable injection."""
	doc = frappe.get_single("Keytech Theme")
	data = doc.as_dict()
	# Include carousel images explicitly (as_dict() skips child tables)
	data.carousel_images = [
		{"image": row.image} for row in doc.get("carousel_images", [])
	]
	return data


def extend_bootinfo(bootinfo):
	"""Inject Keytech Theme data into boot so CSS vars apply instantly (no async flash)."""
	try:
		doc = frappe.get_single("Keytech Theme")
		data = doc.as_dict()
		data.carousel_images = [
			{"image": row.image} for row in doc.get("carousel_images", [])
		]
		bootinfo.keytech_theme = data
	except Exception:
		bootinfo.keytech_theme = {}


def setup_test_data():
	"""Create test sidebar menu items for development."""
	items = [
		{"menu_label": "Home", "action": "Route", "route_or_link": "/app", "is_group": 1, "is_visible": 1, "sort_order": 0, "icon": "octicon octicon-home"},
		{"menu_label": "Workspace", "action": "Route", "route_or_link": "/app/workspace", "is_group": 0, "is_visible": 1, "sort_order": 1, "icon": "octicon octicon-graph", "parent_sidebar_menu": "Home"},
		{"menu_label": "Setup", "action": "Route", "route_or_link": "#", "is_group": 1, "is_visible": 1, "sort_order": 10, "icon": "octicon octicon-gear", "parent_sidebar_menu": "Home"},
		{"menu_label": "Users", "action": "Route", "route_or_link": "/app/user", "is_group": 0, "is_visible": 1, "sort_order": 1, "parent_sidebar_menu": "Setup", "icon": "octicon octicon-person"},
		{"menu_label": "Settings", "action": "Route", "route_or_link": "/app/settings", "is_group": 0, "is_visible": 1, "sort_order": 2, "parent_sidebar_menu": "Setup", "icon": "octicon octicon-tools"},
	]

	for item_data in items:
		if frappe.db.exists("Sidebar Menu", item_data["menu_label"]):
			print(f"Skipped (exists): {item_data['menu_label']}")
			continue
		doc = frappe.new_doc("Sidebar Menu")
		doc.update(item_data)
		doc.insert(ignore_permissions=True)
		print(f"Created: {doc.name}")

	frappe.db.commit()
	print("Done!")

# Copyright (c) 2026, Keytech and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.nestedset import NestedSet


class SidebarMenu(NestedSet):
	def validate(self):
		if self.is_group and self.action == "Link":
			frappe.throw("Group items cannot use Link action. Use Route instead.")

		if self.action == "Link" and not self.link_doctype:
			frappe.throw("Please select a DocType when action is Link.")

		if self.action != "Link":
			self.link_doctype = ""

		if not self.is_group and self.route_or_link and self.action == "Route":
			route = self.route_or_link
			if not route.startswith("/app") and not route.startswith("http"):
				frappe.msgprint(
					"Route should start with /app (e.g., /app/workspace-name) or http for external links.",
					indicator="orange",
				)

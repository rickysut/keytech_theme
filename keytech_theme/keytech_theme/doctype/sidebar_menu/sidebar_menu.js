// Copyright (c) 2026, Keytech and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sidebar Menu", {
	refresh(frm) {
		toggle_route_fields(frm);
	},

	action(frm) {
		if (frm.doc.action !== "Link") {
			frm.set_value("link_doctype", "");
		}
		toggle_route_fields(frm);
	},

	link_doctype(frm) {
		if (frm.doc.action === "Link" && frm.doc.link_doctype) {
			frm.set_value("route_or_link", frm.doc.link_doctype);
		}
	}
});

function toggle_route_fields(frm) {
	if (frm.doc.action === "Link") {
		frm.toggle_display("link_doctype", true);
		frm.toggle_reqd("link_doctype", true);
		frm.fields_dict.route_or_link.$wrapper.hide();
	} else {
		frm.toggle_display("link_doctype", false);
		frm.toggle_reqd("link_doctype", false);
		frm.fields_dict.route_or_link.$wrapper.show();
		frm.toggle_reqd("route_or_link", true);
	}
}
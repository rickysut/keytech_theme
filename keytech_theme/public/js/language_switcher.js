frappe.provide("keytech_theme.language");

keytech_theme.language.languages = [
    {
        code: "en",
        label: "English",
        flag: "🇺🇸"
    },
    {
        code: "id",
        label: "Indonesia",
        flag: "🇮🇩"
    }
];

keytech_theme.language.initialized = false;

$(document).ready(() => {
    wait_for_toolbar_user();
});

function wait_for_toolbar_user() {
    const interval = setInterval(() => {
        const $toolbar = $("#toolbar-user");
        if ($toolbar.length && !keytech_theme.language.initialized) {
            clearInterval(interval);
            keytech_theme.language.initialized = true;
            render_language_submenu($toolbar);
        }
    }, 300);
}

function render_language_submenu($toolbar) {
    const current = get_current_language();

    const $languageItem = $(`
        <li class="dropdown-submenu-wrapper">
            <a class="dropdown-item" href="#" id="custom-language-menu">
                ${__('Language')} (${current.toUpperCase()})
                <span class="pull-right" style="margin-left: 10px;">›</span>
            </a>
        </li>
    `);

    const $submenu = $(`
        <ul class="dropdown-menu language-submenu" style="
            display: none;
            position: fixed !important;
            left: auto !important;
            right: 220px !important;
            top: auto !important;
            margin: 0;
            min-width: 200px;
            z-index: 9999 !important;
            background: white;
            border: 1px solid rgba(0,0,0,.15);
            border-radius: 0.25rem;
            box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
        ">
            ${keytech_theme.language.languages.map(lang => {
                const active = lang.code === current;
                return `
                    <li>
                        <a class="dropdown-item language-option ${active ? 'active' : ''}"
                           data-lang="${lang.code}"
                           href="#"
                           style="display: flex; justify-content: space-between; align-items: center;">
                            <span>${lang.flag} ${lang.label}</span>
                            ${active ? '<span style="color: var(--primary-color);">✓</span>' : ''}
                        </a>
                    </li>
                `;
            }).join('')}
        </ul>
    `);

    const $divider = $toolbar.find('.dropdown-divider').last();
    if ($divider.length) {
        $languageItem.insertBefore($divider);
        $('body').append($submenu);
    } else {
        $toolbar.append($languageItem);
        $('body').append($submenu);
    }

    $languageItem.on('mouseenter', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const $this = $(this);
        const offset = $this.offset();
        const top = offset.top + $this.outerHeight();
        const left = offset.left - 10;

        $submenu.css({
            display: 'block',
            top: top + 'px',
            left: left + 'px',
            right: 'auto'
        });
    });

    $languageItem.on('mouseleave', function (e) {
        setTimeout(() => {
            if (!$submenu.is(':hover')) {
                $submenu.hide();
            }
        }, 200);
    });

    $submenu.on('mouseleave', function () {
        $(this).hide();
    });

    $submenu.on('click', '.language-option', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const lang = $(this).data('lang');
        const current = get_current_language();

        if (lang === current) {
            return;
        }

        $submenu.hide();
        switch_language(lang);
    });
}

function get_current_language() {
    return frappe.boot.lang || "en";
}

async function switch_language(lang) {
    try {
        frappe.dom.freeze(__("Switching language..."));

        await frappe.call({
            method: "frappe.client.set_value",
            args: {
                doctype: "User",
                name: frappe.session.user,
                fieldname: "language",
                value: lang
            }
        });

        frappe.show_alert({
            message: __("Language updated"),
            indicator: "green"
        });

        setTimeout(() => {
            window.location.reload();
        }, 500);

    } catch (e) {
        console.error(e);
        frappe.msgprint({
            title: __("Error"),
            indicator: "red",
            message: __("Failed to switch language")
        });
    } finally {
        frappe.dom.unfreeze();
    }
}

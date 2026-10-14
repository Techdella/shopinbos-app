/* Shopinbos website behaviour. Every widget works without JS (links, <details>, first tab shown);
   this file only adds the interactive parts from the prototype. No dependencies. */
(function () {
	'use strict';

	var $ = function (sel, root) { return (root || document).querySelector(sel); };
	var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
	var naira = function (n) { return '₦' + Math.round(n).toLocaleString('en-NG'); };
	// Paystack local fee: 1.5% + ₦100, the ₦100 waived under ₦2,500, capped at ₦2,000.
	var paystackFee = function (total) { return Math.min(Math.round(total * 0.015 + (total < 2500 ? 0 : 100)), 2000); };
	window.SIB = window.SIB || {};
	window.SIB.naira = naira;
	window.SIB.paystackFee = paystackFee;

	function track(event, props) {
		try { if (window.posthog && window.posthog.capture) window.posthog.capture(event, props || {}); } catch (e) {}
	}
	window.SIB.track = track;

	/* First-touch campaign data, read by /go/ redirects so UTM tags reach the app. */
	(function captureUtm() {
		try {
			var q = new URLSearchParams(location.search), keep = {}, any = false;
			['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ttclid'].forEach(function (k) {
				var v = q.get(k); if (v) { keep[k] = v.slice(0, 120); any = true; }
			});
			if (any && document.cookie.indexOf('sib_utm=') === -1) {
				document.cookie = 'sib_utm=' + encodeURIComponent(JSON.stringify(keep)) + ';path=/;max-age=' + (60 * 60 * 24 * 30) + ';SameSite=Lax' + (location.protocol === 'https:' ? ';Secure' : '');
			}
		} catch (e) {}
	})();

	/* Mobile menu */
	$$('[data-menu-toggle]').forEach(function (btn) {
		var menu = document.getElementById(btn.getAttribute('aria-controls'));
		if (!menu) return;
		btn.addEventListener('click', function () {
			var open = btn.getAttribute('aria-expanded') === 'true';
			btn.setAttribute('aria-expanded', String(!open));
			menu.hidden = open;
		});
	});

	/* Tabs: [data-tabs] > [role=tab][aria-controls] */
	$$('[data-tabs]').forEach(function (group) {
		var tabs = $$('[role="tab"]', group);
		function select(tab) {
			tabs.forEach(function (t) {
				var on = t === tab;
				t.setAttribute('aria-selected', String(on));
				t.tabIndex = on ? 0 : -1;
				var panel = document.getElementById(t.getAttribute('aria-controls'));
				if (panel) panel.hidden = !on;
			});
		}
		tabs.forEach(function (tab, i) {
			tab.addEventListener('click', function () { select(tab); });
			tab.addEventListener('keydown', function (e) {
				var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
				if (!d) return;
				e.preventDefault();
				var next = tabs[(i + d + tabs.length) % tabs.length];
				next.focus(); select(next);
			});
		});
	});

	/* Chip filters: [data-filter] holds chips with data-value; items in [data-filter-items] carry data-tags */
	$$('[data-filter]').forEach(function (group) {
		var target = document.getElementById(group.getAttribute('data-filter'));
		if (!target) return;
		var chips = $$('[data-value]', group);
		var count = document.querySelector('[data-filter-count="' + target.id + '"]');
		chips.forEach(function (chip) {
			chip.addEventListener('click', function () {
				var v = chip.getAttribute('data-value'), shown = 0;
				chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
				$$('[data-tags]', target).forEach(function (item) {
					var ok = v === 'all' || (' ' + item.getAttribute('data-tags') + ' ').indexOf(' ' + v + ' ') !== -1;
					item.hidden = !ok; if (ok) shown++;
				});
				if (count) count.textContent = count.getAttribute('data-template').replace('%d', shown);
			});
		});
	});

	/* Segmented toggles that show/hide blocks: [data-toggle="name"] buttons with data-value, targets [data-toggle-show="name:value"] */
	$$('[data-toggle]').forEach(function (group) {
		var name = group.getAttribute('data-toggle');
		var btns = $$('[data-value]', group);
		btns.forEach(function (btn) {
			btn.addEventListener('click', function () {
				var v = btn.getAttribute('data-value');
				btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
				$$('[data-toggle-show^="' + name + ':"]').forEach(function (el) {
					el.hidden = el.getAttribute('data-toggle-show') !== name + ':' + v;
				});
				$$('[data-toggle-text="' + name + '"]').forEach(function (el) {
					var t = el.getAttribute('data-' + v); if (t !== null) el.textContent = t;
				});
				$$('a[data-toggle-param="' + name + '"]').forEach(function (a) {
					try { var u = new URL(a.href, location.href); u.searchParams.set(a.getAttribute('data-param') || name, v); a.href = u.pathname + u.search; } catch (e) {}
				});
			});
		});
	});

	/* Ads demo on the home page */
	$$('[data-ad-demo]').forEach(function (root) {
		var budget = 5000, days = 5;
		var out = $('[data-ad-total]', root), daysEl = $('[data-ad-days]', root);
		function render() {
			if (out) out.textContent = naira(budget * days);
			if (daysEl) daysEl.textContent = days + ' days';
		}
		$$('[data-ad-budget]', root).forEach(function (chip) {
			chip.addEventListener('click', function () {
				budget = Number(chip.getAttribute('data-ad-budget'));
				$$('[data-ad-budget]', root).forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
				render();
			});
		});
		var minus = $('[data-ad-minus]', root), plus = $('[data-ad-plus]', root);
		if (minus) minus.addEventListener('click', function () { days = Math.max(2, days - 1); render(); });
		if (plus) plus.addEventListener('click', function () { days = Math.min(14, days + 1); render(); });
		$$('[data-ad-plat-btn]', root).forEach(function (btn) {
			btn.addEventListener('click', function () {
				var p = btn.getAttribute('data-ad-plat-btn');
				$$('[data-ad-plat-btn]', root).forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
				$$('[data-ad-plat]', root).forEach(function (el) { el.hidden = el.getAttribute('data-ad-plat') !== p; });
			});
		});
		render();
	});

	/* Product page: dropship price stepper and wholesale quantity stepper */
	$$('[data-calc]').forEach(function (root) {
		var cfg = JSON.parse(root.getAttribute('data-calc'));
		var price = cfg.sell, qty = cfg.tiers.length ? cfg.tiers[0].min : (cfg.moq || 1);
		var set = function (k, v) { $$('[data-out="' + k + '"]', root).forEach(function (el) { el.textContent = v; }); };
		function unitFor(q) {
			var u = cfg.cost;
			cfg.tiers.forEach(function (t) { if (q >= t.min) u = t.price; });
			return u;
		}
		function render() {
			var total = price + cfg.delivery, fee = paystackFee(total), keep = price - cfg.cost - fee;
			set('price', naira(price)); set('total', naira(total)); set('fee', naira(fee));
			set('keep', naira(keep) + ' · ' + Math.round(keep / price * 100) + '%');
			$$('[data-out="keep"]', root).forEach(function (el) { el.style.color = keep > 0 ? 'var(--ok)' : 'var(--accent-text)'; });
			var unit = unitFor(qty);
			set('qty', qty + ' pieces'); set('unit', naira(unit)); set('wstotal', naira(unit * qty));
			set('profit', naira((cfg.sell - unit) * qty));
			$$('[data-tier-min]', root).forEach(function (el) {
				var min = Number(el.getAttribute('data-tier-min'));
				el.classList.toggle('is-active', unitFor(qty) === Number(el.getAttribute('data-tier-price')) && qty >= min);
			});
		}
		var on = function (sel, fn) { var el = $(sel, root); if (el) el.addEventListener('click', function () { fn(); render(); }); };
		on('[data-act="minus"]', function () { price = Math.max(cfg.cost + 500, price - 500); });
		on('[data-act="plus"]', function () { price = price + 500; });
		on('[data-act="qminus"]', function () { qty = Math.max(cfg.tiers.length ? cfg.tiers[0].min : (cfg.moq || 1), qty - 10); });
		on('[data-act="qplus"]', function () { qty = qty + 10; });
		render();
	});

	/* Product gallery thumbnails */
	$$('[data-gallery]').forEach(function (root) {
		var main = $('[data-gallery-main]', root);
		$$('[data-gallery-thumb]', root).forEach(function (btn) {
			btn.addEventListener('click', function () {
				main.src = btn.getAttribute('data-gallery-thumb');
				$$('[data-gallery-thumb]', root).forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
			});
		});
	});

	/* Hero "start your shop" form: send people to sign-up; the number rides in the URL fragment so it never hits server logs */
	$$('[data-signup-form]').forEach(function (form) {
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var input = $('input[type="tel"]', form);
			var digits = input ? input.value.replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '') : '';
			var url = form.getAttribute('action');
			track('signup_click', { intent: 'signup', place: 'hero_form', path: location.pathname });
			location.href = url + (digits.length >= 10 ? '#phone=%2B234' + digits : '');
		});
	});

	/* Analytics for sign-up links and tool use */
	document.addEventListener('click', function (e) {
		var a = e.target.closest && e.target.closest('a[href*="/go/"]');
		if (!a) return;
		try {
			var u = new URL(a.href, location.href);
			track('signup_click', { intent: u.searchParams.get('intent') || u.pathname.split('/')[2], path: location.pathname, label: (a.textContent || '').trim().slice(0, 60) });
		} catch (err) {}
	});

	/* Help article "Was this helpful?" */
	$$('[data-vote]').forEach(function (root) {
		$$('button[data-helpful]', root).forEach(function (btn) {
			btn.addEventListener('click', function () {
				var body = new FormData();
				body.append('post', root.getAttribute('data-vote'));
				body.append('helpful', btn.getAttribute('data-helpful'));
				fetch(root.getAttribute('data-endpoint'), { method: 'POST', body: body, credentials: 'same-origin' }).catch(function () {});
				var chat = btn.getAttribute('data-helpful') === '0' ? root.querySelector('.helpful-chat') : null;
				root.innerHTML = '<span class="notice notice-ok">' + (root.getAttribute('data-thanks') || 'Thanks for telling us.') + '</span>';
				if (chat) { chat.hidden = false; root.appendChild(chat); }
				track('help_vote', { helpful: btn.getAttribute('data-helpful'), path: location.pathname });
			});
		});
	});

	/* Article checklists: ticks are saved on this phone, per page. */
	var store = {
		get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
		set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
	};
	window.SIB.store = store;
	$$('[data-checklist]').forEach(function (list) {
		var key = 'sib-check:' + location.pathname + ':' + list.getAttribute('data-checklist');
		var ticked = store.get(key) || [];
		var rows = $$('.chkrow', list);
		function paint() { rows.forEach(function (r, i) { r.setAttribute('aria-pressed', String(ticked.indexOf(i) !== -1)); }); }
		rows.forEach(function (row, i) {
			row.addEventListener('click', function () {
				var at = ticked.indexOf(i);
				if (at === -1) ticked.push(i); else ticked.splice(at, 1);
				store.set(key, ticked); paint();
			});
		});
		paint();
	});

	/* Copy link button. */
	$$('[data-copy-link]').forEach(function (btn) {
		btn.addEventListener('click', function () {
			var done = function () { btn.classList.add('is-copied'); setTimeout(function () { btn.classList.remove('is-copied'); }, 1500); };
			if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done).catch(function () {}); else prompt('Copy this link', location.href);
		});
	});

	/* Reading progress in the table of contents. */
	$$('[data-read-progress]').forEach(function (bar) {
		var article = document.querySelector('[data-article]'), left = document.querySelector('[data-read-left]');
		if (!article) return;
		var mins = Number(bar.getAttribute('data-read-progress')) || 1;
		var tick = function () {
			var r = article.getBoundingClientRect(), h = r.height - innerHeight;
			var pct = Math.max(0, Math.min(1, h > 0 ? -r.top / h : 1));
			bar.style.width = Math.round(pct * 100) + '%';
			if (left) left.textContent = pct >= 0.98 ? 'Done' : Math.max(1, Math.ceil(mins * (1 - pct))) + ' min left';
		};
		addEventListener('scroll', tick, { passive: true }); tick();
	});
})();

/* Free tools maths. Uses the same Paystack rule as the app: 1.5% + ₦100 (the ₦100 waived under ₦2,500), capped at ₦2,000. */
(function () {
	'use strict';
	var naira = function (n) { return isFinite(n) ? (n < 0 ? '−' : '') + '₦' + Math.round(Math.abs(n)).toLocaleString('en-NG') : '–'; };
	var fee = function (total) { return total <= 0 ? 0 : Math.min(Math.round(total * 0.015 + (total < 2500 ? 0 : 100)), 2000); };
	var pct = function (n) { return isFinite(n) ? Math.round(n * 10) / 10 + '%' : '–'; };

	var tools = {
		'profit-margin': function (v) {
			var f = v.pay === 'cod' ? 0 : fee(v.price);
			var costs = v.cost + v.delivery + v.other + f;
			var keep = v.price - costs;
			return { fee: naira(f), costs: naira(costs), keep: naira(keep), margin: v.price ? pct(keep / v.price * 100) : '–', _summary: 'Selling at ' + naira(v.price) + ' you keep ' + naira(keep) };
		},
		'selling-price': function (v) {
			var m = Math.min(Math.max(v.margin, 0), 95) / 100, p = (v.cost + v.other) / (1 - m);
			for (var i = 0; i < 12; i++) { p = (v.cost + v.other + (v.pay === 'cod' ? 0 : fee(p))) / (1 - m); }
			p = Math.ceil(p / 100) * 100; // round up to the next ₦100
			var f = v.pay === 'cod' ? 0 : fee(p), keep = p - v.cost - v.other - f;
			return { price: naira(p), fee: naira(f), keep: naira(keep), markup: v.cost ? pct((p - v.cost) / v.cost * 100) : '–', _summary: 'Charge ' + naira(p) + ' to keep ' + naira(keep) };
		},
		'paystack-fee': function (v) {
			var a = v.amount, f, charge, get;
			if (v.mode === 'customer') {
				charge = a; for (var i = 0; i < 12; i++) { charge = a + fee(charge); }
				charge = Math.ceil(charge); f = fee(charge); get = charge - f;
			} else { f = fee(a); charge = a; get = a - f; }
			var note = f >= 2000 ? 'Capped at ₦2,000' : (charge < 2500 ? '1.5%, ₦100 waived under ₦2,500' : '1.5% + ₦100');
			return { fee: naira(f), charge: naira(charge), get: naira(get), note: note, _summary: 'Fee ' + naira(f) + ' on ' + naira(charge) };
		},
		'landed-cost': function (v) {
			var goods = v.yuan * v.qty * v.rate, ship = v.weight * v.qty * v.freight, total = goods + ship + v.local;
			var ok = v.rate > 0;
			return { goods: ok ? naira(goods) : 'Add the rate', ship: v.freight > 0 ? naira(ship) : 'Add the shipping price', total: ok ? naira(total) : '–', each: ok && v.qty ? naira(total / v.qty) : '–', _summary: ok ? naira(total / v.qty) + ' per piece landed' : '' };
		},
		'break-even': function (v) {
			var per = v.price - v.cost - (v.pay === 'cod' ? 0 : fee(v.price));
			if (per <= 0) return { per: naira(per), units: 'Your price is below your cost', sales: '–', day: '–' };
			var units = Math.ceil(v.fixed / per);
			return { per: naira(per), units: units + (units === 1 ? ' sale' : ' sales'), sales: naira(units * v.price), day: (Math.round(units / 30 * 10) / 10) + ' sales a day', _summary: 'Break even at ' + units + ' sales a month' };
		},
		'discount': function (v) {
			var sale = Math.round(v.price * (1 - Math.min(v.off, 90) / 100));
			var before = v.price - v.cost - fee(v.price), keep = sale - v.cost - fee(sale);
			var more = keep > 0 ? Math.max(0, Math.ceil(before / keep * 100 - 100)) + '% more sales' : 'You lose money at this price';
			return { sale: naira(sale), keep: naira(keep), before: naira(before), more: more, _summary: v.off + '% off: sell at ' + naira(sale) + ', keep ' + naira(keep) };
		},
		'ad-budget': function (v) {
			var spend = v.daily * v.days, orders = v.cpo > 0 ? Math.floor(spend / v.cpo) : 0, net = orders * v.profit - spend;
			return { spend: naira(spend), orders: v.cpo > 0 ? String(orders) : 'Add a cost per order', net: naira(net), max: naira(v.profit), _summary: naira(spend) + ' on ads, about ' + orders + ' orders, ' + naira(net) + ' after ads' };
		},
		'business-name': function (v) {
			var cap = function (t) { return String(t || '').trim().replace(/\s+/g, ' ').replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); }); };
			var w = cap(v.word) || 'Ade', t = cap(v.what) || 'Shop', single = t.split(' ')[0];
			var sets = {
				warm: [w + '’s ' + t, t + ' by ' + w, 'Little ' + single + ' Co', w + ' & Co', 'The ' + single + ' Corner', 'Hello ' + single, 'Simply ' + w, w + ' Home of ' + t],
				premium: ['Maison ' + w, w + ' Atelier', 'House of ' + w, w + ' Studio', 'The ' + w + ' Edit', single + ' & Gold', w + ' Luxe', 'Atelier ' + single],
				fun: [single + ' Plug', 'Oya ' + single, single + 'tastic', 'Go ' + single, single + ' Gang', 'Big ' + single + ' Energy', single + ' Pop', w + ' Vibes'],
				local: ['Ọja ' + w, 'Ilé ' + single, w + ' Naija ' + single, 'Eko ' + single, w + ' Market', single + ' from Aba', 'Ankara & ' + single, w + ' Oluwa ' + single]
			};
			var names = (sets[v.style] || sets.warm).filter(function (n, i, a) { return a.indexOf(n) === i; });
			return { names: names.join('\n'), tip: 'Say it out loud on a voice note. Check the name is free on Instagram, TikTok and as a domain, and search it on the CAC portal before you register.', _summary: names.slice(0, 4).join(', ') };
		},
		'product-description': function (v) {
			var p = v.price ? naira(v.price) : '';
			var store = v.name + '. ' + cap1(v.made) + '. ' + cap1(v.size) + '. Made for ' + v.for + '.\n\nPrice: ' + p + '\nDelivery: ' + v.delivery + '. Pay online or pay on delivery.';
			var wa = '✨ ' + v.name + ' ✨\n' + cap1(v.made) + ', ' + v.size + '.\nPerfect for ' + v.for + '.\n💰 ' + p + '\n🚚 ' + cap1(v.delivery) + '\nReply “I want it” to order.';
			var tag = String(v.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
			var ig = 'Meet your new favourite: the ' + String(v.name || '').toLowerCase() + '. ' + cap1(v.made) + ', ' + v.size + ', made for ' + v.for + '. ' + p + ', ' + v.delivery + '. Tap the link in bio to order.\n\n#' + tag + ' #shopnigeria #lagosvendor #naijabusiness';
			return { store: store, whatsapp: wa, instagram: ig, _summary: store.slice(0, 280) };
			function cap1(t) { t = String(t || '').trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
		},
		'whatsapp-link': function (v, root) {
			var digits = String(v.phone || '').replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '');
			if (digits.length < 10) return { link: 'Add your number', _link: '' };
			var link = 'https://wa.me/234' + digits + (v.message ? '?text=' + encodeURIComponent(v.message) : '');
			var box = root.querySelector('[data-r-qr]');
			if (box && window.qrcode) {
				var qr = window.qrcode(0, 'M'); qr.addData(link); qr.make();
				box.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
				var svg = box.querySelector('svg'); if (svg) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code for your WhatsApp order link'); svg.style.width = '200px'; svg.style.height = '200px'; }
			}
			return { link: link, _link: link, _summary: link };
		}
	};

	document.querySelectorAll('[data-sib-tool]').forEach(function (root) {
		var name = root.getAttribute('data-sib-tool'), fn = tools[name];
		if (!fn) return;
		var form = root.querySelector('form'), lastLink = '', used = false;
		function values() {
			var v = {};
			Array.prototype.forEach.call(form.elements, function (el) {
				if (!el.name) return;
				v[el.name] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
			});
			return v;
		}
		function run() {
			var r = fn(values(), root);
			Object.keys(r).forEach(function (k) {
				var out = root.querySelector('[data-r="' + k + '"]');
				if (out) { out.textContent = r[k]; if (k === 'link') out.style.wordBreak = 'break-all'; }
			});
			lastLink = r._link || '';
			var hidden = root.querySelector('input[name="result"]');
			if (hidden) hidden.value = r._summary || '';
		}
		form.addEventListener('input', function () {
			run();
			if (!used) { used = true; if (window.SIB && window.SIB.track) window.SIB.track('tool_used', { tool: name, path: location.pathname }); }
		});
		root.querySelectorAll('[data-copy-r]').forEach(function (b) {
			b.addEventListener('click', function () {
				var out = root.querySelector('[data-r="' + b.getAttribute('data-copy-r') + '"]');
				if (!out || !navigator.clipboard) return;
				navigator.clipboard.writeText(out.textContent).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); });
			});
		});
		var copy = root.querySelector('[data-copy]');
		if (copy) copy.addEventListener('click', function () {
			if (!lastLink) return;
			(navigator.clipboard ? navigator.clipboard.writeText(lastLink) : Promise.reject()).then(function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 1500); }).catch(function () { prompt('Copy your link', lastLink); });
		});
		var dl = root.querySelector('[data-download-qr]');
		if (dl) dl.addEventListener('click', function () {
			var svg = root.querySelector('[data-r-qr] svg');
			if (!svg) return;
			var a = document.createElement('a');
			a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML);
			a.download = 'whatsapp-order-qr.svg'; document.body.appendChild(a); a.click(); a.remove();
		});
		run();
	});
})();

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
,

		/* ---- Newer tools ---- */
		'invoice': function (v, root) { return makeDoc('invoice', v, root); },
		'receipt': function (v, root) { return makeDoc('receipt', v, root); },
		'vat': function (v) {
			var r = Math.max(v.rate, 0) / 100, a = v.amount, before, vat, after;
			if (v.mode === 'remove') { after = a; before = a / (1 + r); vat = after - before; } else { before = a; vat = a * r; after = a + vat; }
			return { before: kobo(before), vat: kobo(vat), after: kobo(after), note: v.mode === 'remove' ? kobo(a) + ' ÷ ' + (1 + r).toFixed(3).replace(/0+$/, '') : kobo(a) + ' × ' + pct(v.rate), _summary: 'VAT ' + kobo(vat) + ': ' + kobo(before) + ' before, ' + kobo(after) + ' with VAT' };
		},
		'pos-charges': function (v) {
			var a = v.amount, charge = v.rule === 'pct' ? Math.round(a * v.pct / 100) : Math.ceil(a / Math.max(v.per, 1)) * v.charge;
			if (!a) charge = 0;
			var top = v.pays !== 'inside';
			return { charge: naira(charge), pays: naira(top ? a + charge : a), gets: naira(top ? a : a - charge), profit: v.cost > 0 ? naira(charge - v.cost) : naira(charge) + ' (no provider cut added)', _summary: 'Charge ' + naira(charge) + ' on ' + naira(a) };
		},
		'delivery-fee': function (v) {
			var zones = String(v.zones || '').split('\n').map(function (l) {
				var m = l.trim().match(/^(.*?)[\s=:–-]*₦?\s*([\d][\d,]*(?:\.\d+)?)\s*$/);
				return m && m[1].trim() ? { name: m[1].replace(/[\s=:–-]+$/, '').trim(), price: parseFloat(m[2].replace(/,/g, '')) } : null;
			}).filter(Boolean);
			var lines = ['Delivery prices'];
			zones.forEach(function (z) { lines.push('• ' + z.name + ': ' + naira(z.price)); });
			if (v.extra > 0) lines.push('Prices cover parcels up to ' + v.kg + ' kg. Each extra kg: ' + naira(v.extra) + '.');
			if (v.perkm > 0) lines.push('By distance: ' + [5, 10, 20, 30].map(function (k) { return k + ' km ' + naira(v.base + v.perkm * k); }).join(', ') + '.');
			if (v.free > 0) lines.push('Free delivery on orders above ' + naira(v.free) + '.');
			if (!zones.length) return { low: 'Add an area and price', high: '–', parcel: '–', list: lines.join('\n') };
			var prices = zones.map(function (z) { return z.price; }), far = zones.reduce(function (a, b) { return b.price > a.price ? b : a; });
			var parcel = far.price + Math.max(0, Math.ceil(v.weight - v.kg)) * v.extra;
			return { low: naira(Math.min.apply(null, prices)), high: naira(far.price), parcel: naira(parcel) + ' (' + far.name + ')', list: lines.join('\n'), _summary: lines.join(' | ').slice(0, 290) };
		},
		'markup': function (v) {
			var c = v.cost, price = v.mode === 'price' ? v.price : c * (1 + v.markup / 100), profit = price - c;
			var mk = c ? profit / c * 100 : NaN, mg = price ? profit / price * 100 : NaN;
			var explain = 'A ' + pct(mk) + ' markup is a ' + pct(mg) + ' margin. Markup is profit ÷ cost (' + naira(profit) + ' ÷ ' + naira(c) + '). Margin is profit ÷ price (' + naira(profit) + ' ÷ ' + naira(price) + '). The same profit always looks smaller as a margin.';
			return { markup: pct(mk), margin: pct(mg), price: naira(price), profit: naira(profit), explain: explain, _summary: 'Cost ' + naira(c) + ', price ' + naira(price) + ': ' + pct(mk) + ' markup, ' + pct(mg) + ' margin' };
		},
		'wholesale-price': function (v) {
			var tiers = [[v.q1, v.d1], [v.q2, v.d2], [v.q3, v.d3]].filter(function (t) { return t[0] > 1; }).sort(function (a, b) { return a[0] - b[0]; });
			var round10 = function (n) { return Math.round(n / 10) * 10; };
			var lines = ['Price list'], low = v.retail, warn = [];
			var first = tiers.length ? tiers[0][0] - 1 : 0;
			lines.push((first > 1 ? '1 to ' + first + ' pieces' : first === 1 ? '1 piece' : 'Any quantity') + ': ' + naira(v.retail) + ' each');
			tiers.forEach(function (t, i) {
				var p = round10(v.retail * (1 - Math.min(t[1], 90) / 100)), next = tiers[i + 1];
				lines.push((next ? t[0] + ' to ' + (next[0] - 1) + ' pieces' : t[0] + '+ pieces') + ': ' + naira(p) + ' each (' + pct(t[1]) + ' off)');
				low = Math.min(low, p);
				if (p < v.cost) warn.push('Break ' + (i + 1) + ' is below your cost.');
			});
			var safe = v.retail ? (v.retail - v.cost) / v.retail * 100 : NaN;
			return { low: naira(low), profit: naira(low - v.cost), safe: v.retail > v.cost ? pct(safe) : 'Your price is below your cost', table: lines.concat(warn).join('\n'), _summary: lines.join(' | ').slice(0, 290) };
		},
		'caption': function (v) {
			var p = String(v.product || 'this').trim(), lp = p.toLowerCase(), d = String(v.detail || '').trim(), place = String(v.place || '').trim(), price = v.price > 0 ? naira(v.price) : '';
			var code = String(v.code || '').trim().toUpperCase() || 'YES', pid = v.tone === 'pidgin';
			var cta = {
				dm: pid ? 'Send DM make you order.' : 'Send us a DM to order.',
				wa: pid ? 'Click the WhatsApp link for bio to order.' : 'Order on WhatsApp: the link is in our bio.',
				link: pid ? 'Tap the link for bio to order.' : 'Tap the link in bio to order.',
				comment: pid ? 'Comment ' + code + ' make you order.' : 'Comment ' + code + ' to order.'
			}[v.cta] || '';
			var c = cap1(d), deliver = place ? (pid ? 'We dey deliver for ' + place + '.' : 'We deliver in ' + place + '.') : '';
			var t = {
				clear: [p + ' 🌟\n' + c + '.\n' + (price ? 'Price: ' + price + '\n' : '') + deliver + '\n' + cta,
					'Looking for a ' + lp + '? Ours is ' + d + '.' + (price ? ' ' + price + '.' : '') + ' ' + cta,
					p + ' ✨ ' + c + '. ' + cta],
				pidgin: [p + ' don land! 🔥\n' + c + '.\n' + (price ? 'Na ' + price + ' only.\n' : '') + deliver + '\n' + cta,
					'No dull yourself o! This ' + lp + ' na correct quality: ' + d + '.' + (price ? ' ' + price + '.' : '') + ' ' + cta,
					p + ' wey go make dem look you twice 👀 ' + cta],
				hype: ['🚨 NEW DROP 🚨\n' + p + '\n✔️ ' + c + '\n' + (price ? '💰 ' + price + '\n' : '') + (place ? '📍 ' + deliver + '\n' : '') + cta,
					'POV: you just found the ' + lp + ' everyone will ask you about 😍 ' + c + '.' + (price ? ' ' + price + '.' : '') + ' ' + cta,
					'This ' + lp + ' is giving everything ✨ ' + cta],
				soft: ['Introducing the ' + lp + '.\n' + c + '.\nMade to be loved, made to last.\n' + (price ? price + '\n' : '') + deliver + '\n' + cta,
					'Some pieces just feel right. The ' + lp + ': ' + d + '.' + (price ? ' ' + price + '.' : '') + ' ' + cta,
					'Quietly beautiful: the ' + lp + '. ' + cta]
			}[v.tone] || [];
			var slug = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); };
			var pl = slug(place), words = lp.split(/\s+/).map(slug).filter(function (w) { return w.length > 2; });
			var tags = [slug(p), words[0], pl && pl + 'vendor', pl && pl + 'business', pl && slug(p).length <= 12 && slug(p) + 'in' + pl, 'naijabusiness', 'shopnigeria', 'nigerianvendor', 'smallbusinessnigeria', 'supportsmallbusiness', 'tiktoknaija']
				.filter(function (x, i, a) { return x && a.indexOf(x) === i; }).map(function (x) { return '#' + x; });
			return { one: (t[0] || '').replace(/\n+/g, '\n').trim(), two: t[1] || '', tiktok: t[2] || '', tags: tags.join(' '), _summary: (t[0] || '').slice(0, 280) };
		},
		'qr-label': function (v, root) {
			var box = root.querySelector('[data-r-label]'), code = String(v.code || '').trim(), link = String(v.link || '').trim();
			var badCode = code && !/^[\x20-\x7e]+$/.test(code);
			var html = labelHtml(v, code, link);
			if (box) box.innerHTML = html;
			root._doc = function () { var n = Math.max(1, parseInt(v.copies, 10) || 1), out = ''; for (var i = 0; i < n; i++) out += html; return '<div class="sib-sheet">' + out + '</div>'; };
			return { opens: v.show === 'bar' ? 'No QR code on this label' : (link || 'Add a link or text'), reads: v.show === 'qr' ? 'No barcode on this label' : (badCode ? 'Use letters, numbers and simple signs only' : (code || 'Add a product code')), _summary: (v.name || '') + ' label: ' + (link || code) };
		},
		'ajo': function (v) {
			var a = v.amount, start = parseDate(v.start) || new Date(), lines = [];
			if (v.type === 'thrift') {
				var days = Math.max(1, Math.round(v.days)), keep = Math.min(Math.max(0, Math.round(v.keep)), days), pot = a * (days - keep) - v.fee;
				lines.push('Save ' + naira(a) + ' a day for ' + days + ' days: ' + naira(a * days) + ' in total.');
				if (keep) lines.push('The collector keeps ' + keep + (keep === 1 ? ' day' : ' days') + ' (' + naira(a * keep) + ') as the fee.');
				if (v.fee) lines.push('Extra fee: ' + naira(v.fee) + '.');
				lines.push('You collect ' + naira(pot) + ' on ' + fmtDate(start) + '.');
				return { each: naira(a * days), cycle: days + ' days', pot: naira(pot), schedule: lines.join('\n'), _summary: lines.join(' ') };
			}
			var n = Math.min(Math.max(1, Math.round(v.members)), 200), pot2 = n * a - v.fee;
			var names = String(v.names || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
			var unit = { week: 'week', month: 'month', day: 'day' }[v.every] || 'week';
			lines.push(n + ' members pay ' + naira(a) + ' every ' + unit + '. Each payout is ' + naira(pot2) + (v.fee ? ' after the ' + naira(v.fee) + ' organiser fee' : '') + '.');
			for (var i = 0; i < n; i++) lines.push((i + 1) + '. ' + fmtDate(addPeriod(start, unit, i)) + ': ' + (names[i] || 'Member ' + (i + 1)) + ' collects ' + naira(pot2));
			return { each: naira(n * a), cycle: n + ' ' + unit + (n === 1 ? '' : 's'), pot: naira(pot2), schedule: lines.join('\n'), _summary: lines.slice(0, 4).join(' ') };
		},
		'naira-dollar': function (v) {
			var rate = v.rate, b = 1 + Math.max(v.buffer, 0) / 100;
			if (!(rate > 0)) return { rate: 'Add your rate', converted: '–', safe: '–', note: '–' };
			var usd = v.dir === 'usd', conv = usd ? v.amount * rate : v.amount / rate;
			var show = function (n) { return usd ? kobo(n) : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
			return { rate: '$1 = ' + kobo(rate), converted: show(conv), safe: show(conv * b), note: '$1 = ' + kobo(rate * b), _summary: (usd ? '$' + v.amount : kobo(v.amount)) + ' = ' + show(conv) + ' at ' + kobo(rate) + ' per $1' };
		},
		'slogan': function (v) {
			var n = String(v.name || 'Your shop').trim(), w = String(v.what || 'products').trim().toLowerCase(), p = String(v.promise || 'quality').trim().toLowerCase();
			var W = cap1(w), P = cap1(p);
			var sets = {
				warm: [P + ' you can feel, from ' + n + '.', W + ' made with love.', 'Your ' + w + ', our pleasure.', n + ': where ' + p + ' feels like home.', 'Good ' + w + ', good people.', 'Made for you, with ' + p + '.', 'Everyday ' + w + ', extra care.', n + '. Always ' + p + '.'],
				premium: [n + '. Defined by ' + p + '.', W + ', elevated.', 'The art of ' + p + '.', 'Crafted for people who notice.', 'Where ' + p + ' meets style.', n + ': quietly exceptional.', 'Fine ' + w + ', nothing less.', 'Less noise. More ' + p + '.'],
				fun: ['Big ' + w + ' energy.', 'Oya, come and get your ' + w + '!', W + ' so good, you’ll order twice.', n + ': the plug for ' + w + '.', P + '? We get am.', 'Your ' + w + ' glow-up starts here.', 'Sharp ' + w + ', sharp ' + p + '.', 'Tap in. Show off.'],
				local: ['Naija ' + w + ', world-class ' + p + '.', 'Proudly Nigerian ' + w + '.', 'From our hands to your doorstep.', n + ': made in Naija, made with ' + p + '.', 'The best of Naija ' + w + '.', 'Correct ' + w + ', correct ' + p + '.', 'Na ' + n + ' you fit trust.', 'Nigerian ' + w + ', done right.']
			};
			var list = sets[v.style] || sets.warm;
			return { slogans: list.join('\n'), tip: 'Pick one you can say in one breath. Put it on your store banner, flyers, packaging and WhatsApp status.', _summary: list.slice(0, 4).join(' | ') };
		}
	};

	/* ---- Helpers for the newer tools ---- */
	function cap1(t) { t = String(t || '').trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
	function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function kobo(n) { return isFinite(n) ? (n < 0 ? '−' : '') + '₦' + Math.abs(n).toLocaleString('en-NG', { minimumFractionDigits: Math.abs(n) % 1 > 0.004 ? 2 : 0, maximumFractionDigits: 2 }) : '–'; }
	function money(n) { return kobo(Math.round(n * 100) / 100); }
	function parseDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; }
	function isoDate(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
	function fmtDate(d) { return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
	function addPeriod(d, unit, k) {
		var x = new Date(d.getTime());
		if (unit === 'month') { var day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + k); x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); } else { x.setDate(x.getDate() + k * (unit === 'day' ? 1 : 7)); }
		return x;
	}
	function waPhone(t) { var d = String(t || '').replace(/\D/g, '').replace(/^234/, '').replace(/^0/, ''); return /^[789]\d{9}$/.test(d) ? '234' + d : ''; }

	/* Invoice and receipt: totals, the printable document and a WhatsApp version. */
	function makeDoc(kind, v, root) {
		var inv = kind === 'invoice', items = [];
		root.querySelectorAll('[data-item]').forEach(function (row) {
			var d = row.querySelector('[name=i_desc]').value.trim(), q = parseFloat(row.querySelector('[name=i_qty]').value) || 0, p = parseFloat(row.querySelector('[name=i_price]').value) || 0;
			if (d || q * p) items.push({ d: d || 'Item', q: q, p: p, a: q * p });
		});
		var sub = items.reduce(function (s, i) { return s + i.a; }, 0), del = Math.max(v.delivery, 0), disc = Math.min(Math.max(v.discount, 0), sub + del);
		var base = sub + del - disc, vat = v.vat === 'add' ? Math.round(base * 0.075 * 100) / 100 : 0, total = base + vat;
		var date = parseDate(v.date), due = parseDate(v.due), title = inv ? 'INVOICE' : 'RECEIPT';
		var logo = String(v.logo || '').trim().slice(0, 3).toUpperCase();
		var rows = [['Subtotal', money(sub)]];
		if (del) rows.push(['Delivery', money(del)]);
		if (disc) rows.push(['Discount', '−' + money(disc)]);
		if (vat) rows.push(['VAT (7.5%)', money(vat)]);
		var h = '<div class="sd-top"><div class="sd-brand">' + (logo ? '<span class="sd-logo">' + esc(logo) + '</span>' : '') + '<div><b>' + esc(v.biz || 'Your business') + '</b><span class="sd-muted">' + esc(v.biz_contact) + '</span></div></div>'
			+ '<div class="sd-title"><b>' + title + '</b><span class="sd-muted">No. ' + esc(v.number) + '</span><span class="sd-muted">' + (inv ? 'Date: ' : 'Paid: ') + esc(fmtDate(date)) + '</span>'
			+ (inv && due ? '<span class="sd-muted">Pay by: ' + esc(fmtDate(due)) + '</span>' : '') + (!inv ? '<span class="sd-muted">By: ' + esc(v.method) + '</span>' : '') + '</div></div>'
			+ '<div class="sd-to"><span class="sd-k">' + (inv ? 'Bill to' : 'Received from') + '</span><b>' + esc(v.customer || 'Customer') + '</b>' + (v.customer_contact ? '<span class="sd-muted">' + esc(v.customer_contact) + '</span>' : '') + '</div>'
			+ '<table class="sd-items"><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>'
			+ (items.length ? items.map(function (i) { return '<tr><td>' + esc(i.d) + '</td><td class="n">' + i.q + '</td><td class="n">' + money(i.p) + '</td><td class="n">' + money(i.a) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="sd-muted">Add an item</td></tr>')
			+ '</tbody></table><div class="sd-totals">' + rows.map(function (r) { return '<div><span>' + r[0] + '</span><span>' + r[1] + '</span></div>'; }).join('')
			+ '<div class="sd-total"><span>' + (inv ? 'Total to pay' : 'Amount paid') + '</span><span>' + money(total) + '</span></div>' + (!inv ? '<div class="sd-stampw"><span class="sd-stamp">PAID</span></div>' : '') + '</div>'
			+ (inv && String(v.bank || '').trim() ? '<div class="sd-pay"><span class="sd-k">How to pay</span>' + esc(String(v.bank).trim()) + '</div>' : '')
			+ (v.note ? '<p class="sd-note">' + esc(v.note) + '</p>' : '')
			+ '<p class="sd-foot">Made with the free ' + kind + ' generator at shopinbos.com</p>';
		var out = root.querySelector('[data-r-doc]');
		if (out) out.innerHTML = h;
		root._doc = function () { return '<div class="sib-doc">' + h + '</div>'; };
		var t = ['*' + title + ' ' + (v.number || '') + '*' + (v.biz ? ' from ' + v.biz : ''), (inv ? 'Date: ' : 'Paid: ') + fmtDate(date) + (inv && due ? ' · Pay by: ' + fmtDate(due) : '') + (!inv ? ' · By: ' + v.method : ''), (inv ? 'Bill to: ' : 'Received from: ') + (v.customer || ''), ''];
		items.forEach(function (i) { t.push('• ' + i.d + ' × ' + i.q + ' @ ' + money(i.p) + ' = ' + money(i.a)); });
		t.push('');
		rows.forEach(function (r) { t.push(r[0] + ': ' + r[1]); });
		t.push('*' + (inv ? 'Total to pay' : 'Amount paid') + ': ' + money(total) + '*');
		if (inv && String(v.bank || '').trim()) t.push('', 'How to pay:', String(v.bank).trim());
		if (!inv) t.push('Status: PAID');
		if (v.note) t.push('', v.note);
		root._docText = t.join('\n');
		root._waTo = waPhone(v.customer_contact);
		var extras = [];
		if (del) extras.push('+' + money(del) + ' delivery');
		if (disc) extras.push('−' + money(disc) + ' discount');
		if (vat) extras.push('+' + money(vat) + ' VAT');
		return { subtotal: money(sub) + ' (' + items.length + (items.length === 1 ? ' item)' : ' items)'), extras: extras.join(', ') || 'None', total: money(total), _summary: title.charAt(0) + title.slice(1).toLowerCase() + ' ' + (v.number || '') + ' for ' + (v.customer || '') + ': ' + money(total) };
	}

	/* Code 128 (set B) barcode as SVG. Widths checked against the standard table. */
	var C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232'.split(' ');
	function code128(text) {
		if (!text || !/^[\x20-\x7e]+$/.test(text)) return '';
		var vals = [104], sum = 104;
		for (var i = 0; i < text.length; i++) { var c = text.charCodeAt(i) - 32; vals.push(c); sum += c * (i + 1); }
		vals.push(sum % 103);
		var widths = vals.map(function (x) { return C128[x]; }).join('') + '2331112', x = 10, rects = '';
		for (var k = 0; k < widths.length; k++) { var w = +widths[k]; if (k % 2 === 0) rects += '<rect x="' + x + '" y="0" width="' + w + '" height="50"/>'; x += w; }
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (x + 10) + ' 50" preserveAspectRatio="none" role="img" aria-label="Barcode ' + esc(text) + '" data-modules="' + widths + '"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">' + rects + '</g></svg>';
	}
	function qrSvg(text) {
		if (!text || !window.qrcode) return '';
		try {
			if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
			var qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
			return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
		} catch (e) { return ''; }
	}
	function labelHtml(v, code, link) {
		var qr = v.show !== 'bar' ? qrSvg(link) : '', bar = v.show !== 'qr' ? code128(code) : '';
		return '<div class="sib-lab">' + (qr ? '<div class="sl-qr" data-svg="qr">' + qr + '</div>' : '')
			+ '<div class="sl-txt"><b>' + esc(v.name || '') + '</b>' + (v.price > 0 ? '<span class="sl-price">' + naira(v.price) + '</span>' : '')
			+ (bar ? '<div class="sl-bar" data-svg="bar">' + bar + '</div><span class="sl-code">' + esc(code) + '</span>' : (code ? '<span class="sl-code">' + esc(code) + '</span>' : '')) + '</div></div>';
	}

	/* Document styles and printing: the page prints only the document (or label sheet). */
	var DOC_CSS = '.sib-doc{background:#fff;color:#16141F;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:40px;border-radius:18px;box-shadow:inset 0 0 0 1px #EAE7EF,0 24px 60px -36px rgba(22,20,31,.4);max-width:820px;margin:0 auto;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
		+ '.sib-doc b{font-weight:700}.sd-top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;flex-wrap:wrap}.sd-brand{display:flex;gap:14px;align-items:center;min-width:0}'
		+ '.sd-logo{width:56px;height:56px;border-radius:50%;background:#16141F;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex:none}'
		+ '.sd-brand b{display:block;font-size:20px;line-height:1.2}.sd-muted{display:block;color:#6B6779;font-size:13px}.sd-title{text-align:right}.sd-title b{display:block;font-size:26px;letter-spacing:.08em}'
		+ '.sd-to{margin:28px 0 18px}.sd-to b{font-size:16px}.sd-k{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6B6779;font-weight:700;margin-bottom:4px}'
		+ '.sd-items{width:100%;border-collapse:collapse}.sd-items th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6B6779;border-bottom:2px solid #16141F;padding:8px 6px}'
		+ '.sd-items td{padding:10px 6px;border-bottom:1px solid #EAE7EF;vertical-align:top;overflow-wrap:anywhere}.sd-items .n{text-align:right;white-space:nowrap}'
		+ '.sd-totals{margin-left:auto;width:min(100%,320px);margin-top:16px}.sd-totals>div{display:flex;justify-content:space-between;gap:16px;padding:5px 0}'
		+ '.sd-totals .sd-total{border-top:2px solid #16141F;margin-top:6px;padding-top:10px;font-size:18px;font-weight:700}.sd-stampw{justify-content:flex-end!important}'
		+ '.sd-stamp{display:inline-block;border:3px solid #1E8E5A;color:#1E8E5A;padding:2px 14px;border-radius:8px;font-weight:800;letter-spacing:.2em;transform:rotate(-6deg)}'
		+ '.sd-pay{margin-top:28px;padding:16px;background:#F6F3EE;border-radius:12px;white-space:pre-line}.sd-note{margin:22px 0 0}.sd-foot{margin:28px 0 0;font-size:11px;color:#9A96A6;text-align:center}'
		+ '@media (max-width:600px){.sib-doc{padding:20px;font-size:13px}.sd-title{text-align:left}.sd-items th,.sd-items td{padding:8px 3px}}'
		+ '.sib-lab{display:flex;gap:12px;align-items:center;background:#fff;color:#16141F;padding:12px;border-radius:12px;font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
		+ '.sl-qr{flex:none;width:96px}.sl-qr svg{display:block;width:96px;height:96px}.sl-txt{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}.sl-txt b{font-size:14px;overflow-wrap:anywhere}.sl-price{font-weight:700;font-size:16px}'
		+ '.sl-bar svg{display:block;width:100%;max-width:220px;height:44px}.sl-code{font:12px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em}'
		+ '.sib-sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.sib-sheet .sib-lab{border:1px dashed #C9C5D2;border-radius:0;height:34mm;overflow:hidden;padding:3mm}'
		+ '.sib-sheet .sl-qr,.sib-sheet .sl-qr svg{width:26mm;height:26mm}'
		+ '@media screen{#sib-print{display:none}}'
		+ '@media print{body.sib-printing>*:not(#sib-print){display:none!important}body.sib-printing{background:#fff!important;margin:0!important;padding:0!important}body.sib-printing #sib-print{display:block!important}#sib-print .sib-doc{box-shadow:none;border-radius:0;padding:0;max-width:none}@page{size:A4;margin:12mm}}';
	var printRoot = null;
	function prepPrint(root) {
		if (!root || !root._doc) return false;
		var box = document.getElementById('sib-print');
		if (!box) { box = document.createElement('div'); box.id = 'sib-print'; document.body.appendChild(box); }
		box.innerHTML = root._doc();
		document.body.classList.add('sib-printing');
		return true;
	}
	window.addEventListener('beforeprint', function () { if (!document.body.classList.contains('sib-printing')) prepPrint(printRoot); });
	window.addEventListener('afterprint', function () { document.body.classList.remove('sib-printing'); });
	function share(text, to) { window.open('https://wa.me/' + (to || '') + '?text=' + encodeURIComponent(text), '_blank', 'noopener'); }
	function copyText(btn, text, label) {
		(navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = label; }, 1500); }).catch(function () { prompt('Copy this', text); });
	}
	function download(svg, name) {
		if (!svg) return;
		var a = document.createElement('a');
		a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML);
		a.download = name; document.body.appendChild(a); a.click(); a.remove();
	}
	if (document.querySelector('[data-sib-tool]')) {
		var st = document.createElement('style'); st.id = 'sib-tools-css'; st.textContent = DOC_CSS; document.head.appendChild(st);
	}

	document.querySelectorAll('[data-sib-tool]').forEach(function (root) {
		var name = root.getAttribute('data-sib-tool'), fn = tools[name];
		if (!fn) return;
		var form = root.querySelector('form'), lastLink = '', used = false;
		// Dates start at today (due dates and payouts a week on).
		form.querySelectorAll('input[type=date]').forEach(function (el) {
			if (el.value) return;
			var d = new Date(); if (el.name === 'due' || el.name === 'start') d.setDate(d.getDate() + 7);
			el.value = isoDate(d);
		});
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
		function changed() {
			run();
			if (!used) { used = true; if (window.SIB && window.SIB.track) window.SIB.track('tool_used', { tool: name, path: location.pathname }); }
		}
		form.addEventListener('input', changed);
		form.addEventListener('change', changed);
		// Invoice and receipt item rows.
		var items = root.querySelector('[data-items]');
		if (items) {
			root.querySelector('[data-add-item]').addEventListener('click', function () {
				var row = items.querySelector('[data-item]').cloneNode(true);
				row.querySelectorAll('input').forEach(function (el) { el.value = el.name === 'i_qty' ? '1' : ''; });
				items.appendChild(row); row.querySelector('input').focus(); changed();
			});
			items.addEventListener('click', function (e) {
				var b = e.target.closest('[data-del-item]');
				if (!b) return;
				var rows = items.querySelectorAll('[data-item]');
				if (rows.length > 1) b.closest('[data-item]').remove(); else rows[0].querySelectorAll('input').forEach(function (el) { el.value = el.name === 'i_qty' ? '1' : ''; });
				changed();
			});
		}
		root.querySelectorAll('[data-copy-r]').forEach(function (b) {
			b.addEventListener('click', function () {
				var out = root.querySelector('[data-r="' + b.getAttribute('data-copy-r') + '"]');
				if (out) copyText(b, out.textContent, 'Copy');
			});
		});
		root.querySelectorAll('[data-share-r]').forEach(function (b) {
			b.addEventListener('click', function () { var out = root.querySelector('[data-r="' + b.getAttribute('data-share-r') + '"]'); if (out) share(out.textContent); });
		});
		root.querySelectorAll('[data-print]').forEach(function (b) {
			b.addEventListener('click', function () { run(); printRoot = root; if (prepPrint(root)) window.print(); });
		});
		if (root._doc !== undefined || root.querySelector('[data-r-doc],[data-r-label]')) printRoot = root;
		var sd = root.querySelector('[data-share-doc]');
		if (sd) sd.addEventListener('click', function () { run(); share(root._docText || '', root._waTo); });
		var cd = root.querySelector('[data-copy-doc]');
		if (cd) cd.addEventListener('click', function () { run(); copyText(cd, root._docText || '', 'Copy as text'); });
		root.querySelectorAll('[data-download]').forEach(function (b) {
			b.addEventListener('click', function () { var k = b.getAttribute('data-download'); download(root.querySelector('[data-r-label] [data-svg="' + k + '"] svg'), k === 'qr' ? 'product-qr-code.svg' : 'product-barcode.svg'); });
		});
		var copy = root.querySelector('[data-copy]');
		if (copy) copy.addEventListener('click', function () {
			if (!lastLink) return;
			(navigator.clipboard ? navigator.clipboard.writeText(lastLink) : Promise.reject()).then(function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 1500); }).catch(function () { prompt('Copy your link', lastLink); });
		});
		var dl = root.querySelector('[data-download-qr]');
		if (dl) dl.addEventListener('click', function () { download(root.querySelector('[data-r-qr] svg'), 'whatsapp-order-qr.svg'); });
		run();
		// The QR library loads with defer too; draw again once it is there.
		if (/qr-label|whatsapp-link/.test(name) && !window.qrcode) window.addEventListener('load', run);
	});

	/*
	 * Free tools gate (V9 tool pages): the working tool stays locked until the visitor leaves an email and a
	 * WhatsApp number once. Remembered in this browser (localStorage, and the sib_tools cookie the server sets).
	 */
	var GATE_KEY = 'sib_tools_unlocked';
	function capture(ev, props) { try { if (window.posthog && window.posthog.capture) window.posthog.capture(ev, props); } catch (e) {} }
	function isUnlocked() {
		try { if (localStorage.getItem(GATE_KEY)) return true; } catch (e) {}
		return /(?:^|;\s*)sib_tools=1(?:;|$)/.test(document.cookie);
	}
	function savedEmail() { try { return localStorage.getItem(GATE_KEY + '_email') || ''; } catch (e) { return ''; } }
	function openGates(email) {
		document.querySelectorAll('[data-tools-gate]').forEach(function (wrap) {
			wrap.classList.add('is-open');
			var tool = wrap.querySelector('[data-gated]');
			if (tool) { tool.removeAttribute('inert'); tool.removeAttribute('aria-hidden'); }
			var card = wrap.querySelector('[data-gate-card]');
			if (card) card.remove();
			if (email) wrap.querySelectorAll('.sib-lead input[name=email]').forEach(function (el) { if (!el.value) el.value = email; });
		});
	}
	var gates = document.querySelectorAll('[data-tools-gate]');
	if (gates.length) {
		if (isUnlocked()) {
			openGates(savedEmail());
		} else {
			gates.forEach(function (wrap) {
				var f = wrap.querySelector('form[data-gate-form]');
				if (!f) return;
				var tool = f.querySelector('[name=tool]').value;
				capture('tool_gate_view', { tool: tool, path: location.pathname });
				var msg = f.querySelector('[data-gate-msg]'), btn = f.querySelector('button[type=submit]');
				function say(t, ok) { msg.textContent = t; msg.className = 'v9-gate-msg ' + (ok ? 'ok' : 'err'); }
				f.addEventListener('submit', function (e) {
					e.preventDefault();
					var email = f.email.value.trim(), digits = f.phone.value.replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '');
					f.email.removeAttribute('aria-invalid'); f.phone.removeAttribute('aria-invalid');
					if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { f.email.setAttribute('aria-invalid', 'true'); f.email.focus(); return say('Add your email, like ada@gmail.com.'); }
					if (!/^[789]\d{9}$/.test(digits)) { f.phone.setAttribute('aria-invalid', 'true'); f.phone.focus(); return say('Type your WhatsApp number, like 0803 412 7790.'); }
					if (!window.fetch) { f.submit(); return; }
					var fd = new FormData(f), qs = new URLSearchParams(location.search);
					fd.set('back', location.href.split('#')[0]);
					['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid'].forEach(function (k) { if (qs.get(k)) fd.append(k, qs.get(k)); });
					btn.disabled = true; say('Unlocking…', true);
					fetch(f.getAttribute('action'), { method: 'POST', body: fd, credentials: 'same-origin', headers: { Accept: 'application/json' } })
						.then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
						.then(function (j) {
							if (!j || !j.ok) { btn.disabled = false; return say((j && j.message) || 'Something went wrong. Try again.'); }
							try { localStorage.setItem(GATE_KEY, String(Date.now())); localStorage.setItem(GATE_KEY + '_email', email); } catch (x) {}
							capture('tool_unlock', { tool: tool, path: location.pathname, consent: !!(f.consent && f.consent.checked) });
							if (window.SIB && window.SIB.track) window.SIB.track('lead', { kind: 'tool_gate', path: location.pathname });
							openGates(email);
						})
						.catch(function () { btn.disabled = false; say('No connection. Check your data and try again.'); });
				});
			});
		}
	}
})();

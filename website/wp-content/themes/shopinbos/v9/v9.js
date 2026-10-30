/* Website V9: sends the drawn forms to the lead pipeline (admin-post.php?action=sib_lead) and adds keyboard
 * support to the menus. The design's success states are CSS (checkbox #sent); we tick it once the lead is saved. */
(function () {
	'use strict';
	var C = window.SIB_V9 || {};
	var page = (document.body.className.match(/\bv9-([a-z-]+)/) || [])[1] || '';

	function track(ev, props) {
		try { if (window.posthog && window.posthog.capture) window.posthog.capture(ev, props || {}); } catch (e) {}
	}

	function post(data) {
		var fd = new FormData();
		fd.append('action', 'sib_lead');
		fd.append('back', location.href.split('#')[0]);
		Object.keys(data).forEach(function (k) { if (data[k] !== '' && data[k] != null) fd.append(k, data[k]); });
		// Where the visitor came from (ads land on /app/ and /plug/ with utm_* and fbclid).
		var qs = new URLSearchParams(location.search);
		['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid'].forEach(function (k) { if (qs.get(k)) fd.append(k, qs.get(k)); });
		return fetch(C.post || '/wp-admin/admin-post.php', { method: 'POST', body: fd, credentials: 'same-origin', headers: { Accept: 'application/json' } })
			.then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
			.catch(function () { return { ok: false, message: 'No connection. Check your data and try again.' }; });
	}

	/* Read a drawn form: inputs by placeholder, radio groups by the checked option's label, ticks in order. */
	function read(box) {
		var out = { by: {}, radio: {}, ticks: [] };
		box.querySelectorAll('input, textarea').forEach(function (el) {
			if (el.id === 'sent') return;
			if (el.type === 'radio') {
				if (el.checked) out.radio[el.name] = (el.parentNode.textContent || '').trim();
			} else if (el.type === 'checkbox') {
				out.ticks.push(el);
			} else {
				out.by[el.name || el.getAttribute('placeholder') || ''] = el;
			}
		});
		return out;
	}
	function val(f, ph) { return f.by[ph] ? f.by[ph].value.trim() : ''; }

	function say(box, msg) {
		var n = box.querySelector('.v9-err');
		if (!n) {
			n = document.createElement('p');
			n.className = 'v9-err';
			n.setAttribute('role', 'alert');
			n.style.cssText = 'margin:0;color:#C2410C;font-weight:600;font-size:14px';
			var btn = box.querySelector('label[for="sent"]');
			btn.parentNode.insertBefore(n, btn);
		}
		n.textContent = msg || '';
		n.hidden = !msg;
	}

	/* Put the visitor's first name (and the reference) into the success message the design drew for "Ada"/"Tolu". */
	function personalise(done, name, ref) {
		var first = (name || '').split(/\s+/)[0];
		var walk = document.createTreeWalker(done, NodeFilter.SHOW_TEXT);
		var t;
		while ((t = walk.nextNode())) {
			var s = t.nodeValue;
			if (first) s = s.replace(/\b(Ada|Tolu)\b(?=[.,])/g, first);
			else s = s.replace(/^(Thanks|in), (Ada|Tolu)\b/, '$1');
			if (ref) s = s.replace(/SB-T-(\[n\]|000000)/, ref);
			t.nodeValue = s;
		}
	}

	var FORMS = {
		contact: function (f) {
			var d = {
				kind: 'contact', topic: f.radio.topic || '', name: val(f, 'Ada Okafor'), phone: val(f, '803 555 0141'),
				email: val(f, 'you@example.com'), shop: val(f, 'yourshop.mybos.store'), message: f.by.message ? f.by.message.value.trim() : '',
				via: f.radio.via || ''
			};
			if (!d.name || !d.message) return 'Add your name and your message.';
			if (!d.phone && !d.email) return 'Add your WhatsApp number or email so we can reply.';
			d.ref = 'SB-T-' + String(Date.now()).slice(-6);
			return d;
		},
		app: function (f) {
			var d = {
				kind: 'app_notify', intent: 'pilot', name: val(f, 'Ada Okafor'), phone: val(f, '803 555 0141'), email: val(f, 'you@example.com'),
				platform: f.radio.os || '', role: f.radio.role || '', business: val(f, 'Glow by Ada'), state: val(f, 'Enugu'),
				consent: f.ticks[1] && f.ticks[1].checked ? '1' : ''
			};
			if (!d.name || !d.phone) return 'Add your name and WhatsApp number.';
			if (f.ticks[0] && !f.ticks[0].checked) return 'Tick the first box to say you understand the pilot.';
			return d;
		},
		plug: function (f) {
			var d = {
				kind: 'waitlist', intent: 'plug', list: /pilot/i.test(f.radio.list || '') ? 'pilot' : 'waitlist', as: f.radio.mode || '',
				name: val(f, 'Tolu Bello'), phone: val(f, '803 555 0141'), email: val(f, 'you@example.com'), area: val(f, 'Bodija, Ibadan'),
				os: f.radio.os || '', fave: val(f, '@kemiscloset'), consent: f.ticks[2] && f.ticks[2].checked ? '1' : ''
			};
			if (!d.name || !d.phone) return 'Add your name and WhatsApp number.';
			if (d.list === 'pilot' && f.ticks[0] && !f.ticks[0].checked) return 'Tick the first box to join the pilot.';
			if (/earn|both/i.test(d.as) && f.ticks[1] && !f.ticks[1].checked) return 'Earn mode needs the ID check box ticked.';
			return d;
		}
	};

	var sent = document.getElementById('sent');
	if (sent && FORMS[page]) {
		var wrap = sent.parentNode;
		var form = wrap.querySelector('.formw');
		var done = wrap.querySelector('.done');
		var busy = false;
		form.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"]').forEach(function (el) {
			el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
		});
		var submitBtn = form.querySelector('label[for="sent"]');
		function submit() {
			if (busy) return;
			var f = read(form);
			var d = FORMS[page](f);
			if (typeof d === 'string') { say(form, d); return; }
			busy = true;
			say(form, '');
			submitBtn.style.opacity = '.6';
			post(d).then(function (r) {
				busy = false;
				submitBtn.style.opacity = '';
				if (!r || !r.ok) { say(form, (r && r.message) || 'That didn’t go through. Check the details and try again.'); return; }
				if (done) personalise(done, d.name, d.ref);
				sent.checked = true;
				track('lead', { kind: d.kind, form: page, path: location.pathname });
				wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		}
		// The design's submit is a <label for="sent">: hold the tick until the lead is saved.
		submitBtn.addEventListener('click', function (e) { e.preventDefault(); submit(); });
		// "Send another" / "Edit my details" go back to the form.
		if (done) done.querySelectorAll('label[for="sent"]').forEach(function (b) {
			b.addEventListener('click', function (e) { e.preventDefault(); sent.checked = false; });
		});
		wrap.querySelectorAll('label[for="sent"]').forEach(function (b) {
			b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
		});
	}

	/* Footer newsletter: email + Subscribe. */
	document.querySelectorAll('input[type="email"][aria-label="Email address"]').forEach(function (inp) {
		var box = inp.parentNode;
		var btn = box.querySelector('button');
		if (!btn) return;
		function go(e) {
			if (e) e.preventDefault();
			var email = inp.value.trim();
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { inp.focus(); inp.setCustomValidity('Type your email address.'); inp.reportValidity(); return; }
			inp.setCustomValidity('');
			btn.disabled = true;
			post({ kind: 'newsletter', email: email, consent: '1' }).then(function (r) {
				btn.disabled = false;
				var note = box.parentNode.querySelector('.v9-note') || document.createElement('p');
				note.className = 'v9-note';
				note.setAttribute('role', 'status');
				note.style.cssText = 'margin:10px 0 0;font-size:14px;font-weight:600';
				note.textContent = r && r.ok ? (r.message || 'Check your email and tap the link to confirm.') : ((r && r.message) || 'That didn’t go through. Try again.');
				box.parentNode.insertBefore(note, box.nextSibling);
				if (r && r.ok) { inp.value = ''; track('lead', { kind: 'newsletter', path: location.pathname }); }
			});
		}
		btn.addEventListener('click', go);
		inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(e); });
	});

	/* "Your WhatsApp number" + Start your shop: open sign-up with the number filled in. */
	document.querySelectorAll('input[type="tel"][aria-label="WhatsApp number"]').forEach(function (inp) {
		var btn = inp.parentNode.querySelector('button');
		if (!btn) return;
		function go(e) {
			if (e) e.preventDefault();
			var digits = inp.value.replace(/\D/g, '').replace(/^(234|0)/, '');
			var url = (C.signup || 'https://app.shopinbos.com/signup') + '?source=website';
			if (digits.length >= 10) url += '&phone=' + encodeURIComponent('+234' + digits.slice(-10));
			track('cta_click', { cta: 'start_shop_phone', path: location.pathname });
			location.href = url;
		}
		btn.addEventListener('click', go);
		inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(e); });
	});

	/* Blog "Copy link". */
	document.querySelectorAll('a[data-copy]').forEach(function (a) {
		a.addEventListener('click', function (e) {
			if (!navigator.clipboard) return;
			e.preventDefault();
			navigator.clipboard.writeText(a.href).then(function () { var t = a.textContent; a.textContent = 'Copied'; setTimeout(function () { a.textContent = t; }, 1600); });
		});
	});

	/* Checklists inside posts: tap to tick. */
	document.querySelectorAll('.v9-prose .chkrow').forEach(function (b) {
		b.addEventListener('click', function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); });
	});

	/* Academy lessons: English/Pidgin, quick check, video, progress saved on this phone. */
	document.querySelectorAll('[data-lang-pick]').forEach(function (b) {
		b.addEventListener('click', function () {
			var lang = b.getAttribute('data-lang-pick');
			document.querySelectorAll('[data-lang-pick]').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
			document.querySelectorAll('[data-lang]').forEach(function (el) { el.hidden = el.getAttribute('data-lang') !== lang; });
		});
	});
	document.querySelectorAll('.v9-quiz').forEach(function (q) {
		var right = +q.getAttribute('data-correct');
		q.querySelectorAll('[data-opt]').forEach(function (o) {
			o.addEventListener('click', function () {
				var ok = +o.getAttribute('data-opt') === right;
				q.querySelectorAll('[data-opt]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
				o.setAttribute('aria-pressed', 'true');
				var v = q.querySelector('.v9-verdict');
				v.hidden = false;
				v.querySelector('b').textContent = ok ? 'That’s right.' : 'Not quite.';
				v.querySelector('b').style.color = ok ? '#16794A' : '#C2410C';
			});
		});
	});
	document.querySelectorAll('button[data-video]').forEach(function (b) {
		b.addEventListener('click', function () {
			var f = document.createElement('iframe');
			f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(b.getAttribute('data-video')) + '?autoplay=1&rel=0';
			f.allow = 'autoplay; encrypted-media; picture-in-picture';
			f.allowFullscreen = true;
			f.title = 'Lesson video';
			f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
			b.replaceWith(f);
		});
	});
	var done = [];
	try { done = JSON.parse(localStorage.getItem('sib_lessons_done') || '[]'); } catch (e) {}
	document.querySelectorAll('[data-lesson-done]').forEach(function (a) {
		a.addEventListener('click', function () {
			var id = a.getAttribute('data-lesson-done');
			if (done.indexOf(id) < 0) done.push(id);
			try { localStorage.setItem('sib_lessons_done', JSON.stringify(done)); } catch (e) {}
		});
	});
	document.querySelectorAll('[data-lesson-row]').forEach(function (r) {
		if (done.indexOf(r.getAttribute('data-lesson-row')) < 0) return;
		var n = r.querySelector('.v9-num');
		if (n) { n.textContent = '✓'; n.style.background = '#16794A'; n.style.color = '#fff'; }
	});
	document.querySelectorAll('[data-course-progress]').forEach(function (p) {
		var ids = p.getAttribute('data-course-progress').split(',');
		var n = ids.filter(function (id) { return done.indexOf(id) >= 0; }).length;
		if (n) p.textContent = n + ' of ' + ids.length + ' done';
	});

	/* CTA clicks to the app. */
	document.addEventListener('click', function (e) {
		var a = e.target.closest && e.target.closest('a[href*="app.shopinbos.com"], a[href*="/signup"]');
		if (a) track('cta_click', { cta: (a.textContent || '').trim().slice(0, 40), href: a.getAttribute('href'), path: location.pathname });
	});

	/* Menus: open on keyboard focus, close on Escape. */
	document.querySelectorAll('.nv').forEach(function (nv) {
		var mega = nv.querySelector('.mega');
		if (!mega) return;
		nv.addEventListener('focusin', function () { mega.classList.add('open'); });
		nv.addEventListener('focusout', function (e) { if (!nv.contains(e.relatedTarget)) mega.classList.remove('open'); });
	});
	document.addEventListener('keydown', function (e) {
		if (e.key !== 'Escape') return;
		document.querySelectorAll('.mega.open').forEach(function (m) { m.classList.remove('open'); });
		document.querySelectorAll('details.mnav[open]').forEach(function (d) { d.removeAttribute('open'); });
		if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.nv')) document.activeElement.blur();
	});
})();

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

	/* Gist stories, template filters and the investor form (inc/v9-more.php). */
	(function () {
		var SEEN = 'sib-gist-seen', seen = {};
		try { seen = JSON.parse(localStorage.getItem(SEEN) || '{}') || {}; } catch (e) {}
		document.querySelectorAll('[data-gist-slug]').forEach(function (a) { a.classList.toggle('is-seen', !!seen[a.getAttribute('data-gist-slug')]); });
		// Old share links (/gist/#slug) open that story's page.
		if (page === 'gist' && location.hash.length > 1) {
			var want = decodeURIComponent(location.hash.slice(1));
			[].some.call(document.querySelectorAll('[data-gist-slug]'), function (a) {
				if (a.getAttribute('data-gist-slug') !== want) return false;
				location.replace(a.href);
				return true;
			});
		}

		/* Story player: swipe or tap right/left, hold to pause, arrow keys; slides move on by themselves. */
		document.querySelectorAll('[data-gp]').forEach(function (gp) {
			var track = gp.querySelector('.v9-gp-track');
			var slides = [].slice.call(track.children);
			var bars = gp.querySelectorAll('.gv-bar');
			var ctl = gp.nextElementSibling && gp.nextElementSibling.classList.contains('v9-gp-ctl') ? gp.nextElementSibling : null;
			var count = ctl && ctl.querySelector('.gp-count');
			var pauseBtn = ctl && ctl.querySelector('.gp-pause');
			var reads = document.querySelectorAll('[data-go]');
			var nextStory = document.querySelector('[data-gist-next]');
			var DUR = 5200, i = -1, t0 = 0, elapsed = 0, held = false, stopped = false, away = false, muted = true, done = false, settle = 0;
			var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (!slides.length) return;
			gp.classList.add('js');
			if (ctl) ctl.hidden = false;
			seen[gp.getAttribute('data-slug')] = 1;
			try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch (e) {}

			slides.forEach(function (s) {
				var v = s.querySelector('video');
				if (!v) return;
				v.removeAttribute('controls');
				v.muted = true;
				var mb = s.querySelector('.gs-mute');
				if (mb) {
					mb.hidden = false;
					mb.addEventListener('click', function (e) {
						e.stopPropagation();
						muted = !muted; v.muted = muted;
						mb.classList.toggle('is-on', !muted);
						mb.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
						if (v.paused) v.play().catch(function () {});
					});
				}
				v.addEventListener('ended', function () { if (slides[i] === s) step(1, true); });
				v.addEventListener('error', function () { v.classList.add('is-failed'); t0 = performance.now(); elapsed = 0; });
			});
			function vid() { var v = slides[i] && slides[i].querySelector('video'); return v && !v.classList.contains('is-failed') ? v : null; }
			function activate(n) {
				if (n === i) return;
				var old = vid(); if (old) old.pause();
				i = n; elapsed = 0; t0 = performance.now(); done = false;
				slides.forEach(function (s, k) { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
				[].forEach.call(bars, function (b, k) { b.classList.toggle('done', k < i); b.firstChild.style.width = k < i ? '100%' : '0'; });
				[].forEach.call(reads, function (r) { r.classList.toggle('on', +r.getAttribute('data-go') === i); });
				if (count) count.textContent = (i + 1) + ' / ' + slides.length;
				var v = vid();
				if (v) {
					v.muted = muted; delete v.dataset.started;
					try { v.currentTime = 0; } catch (e) {}
					if (!stopped && !away) v.play().catch(function () { muted = true; v.muted = true; v.play().catch(function () {}); });
				}
			}
			function go(n) {
				n = Math.max(0, Math.min(slides.length - 1, n));
				track.scrollTo({ left: n * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
				activate(n);
			}
			// Past the last slide: a tap goes on to the next story; the timer just stops there.
			function step(d, auto) {
				if (d > 0 && i >= slides.length - 1) {
					done = true;
					if (!auto && nextStory) location.href = nextStory.href;
					return;
				}
				go(i + d);
			}
			// Swipes: the slide that ends up in view becomes the current one.
			track.addEventListener('scroll', function () {
				clearTimeout(settle);
				settle = setTimeout(function () { activate(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))); }, 120);
			}, { passive: true });
			track.addEventListener('click', function (e) {
				if (e.target.closest('a, button')) return;
				var r = track.getBoundingClientRect();
				step(e.clientX < r.left + r.width / 3 ? -1 : 1);
			});
			track.addEventListener('pointerdown', function () { held = true; });
			['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { track.addEventListener(ev, function () { held = false; }); });
			track.addEventListener('keydown', function (e) {
				if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
				else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
				else if (e.key === ' ' && e.target === track) { e.preventDefault(); toggle(); }
			});
			function toggle() {
				stopped = !stopped;
				if (pauseBtn) { pauseBtn.classList.toggle('is-paused', stopped); pauseBtn.setAttribute('aria-label', stopped ? 'Play' : 'Pause'); }
				var v = vid(); if (v && !stopped && v.paused && !v.ended) v.play().catch(function () {});
			}
			if (ctl) {
				ctl.querySelector('.gp-prev').addEventListener('click', function () { step(-1); });
				ctl.querySelector('.gp-next').addEventListener('click', function () { step(1); });
				if (pauseBtn) pauseBtn.addEventListener('click', toggle);
			}
			[].forEach.call(reads, function (r) {
				r.addEventListener('click', function () {
					go(+r.getAttribute('data-go'));
					var b = gp.getBoundingClientRect();
					if (b.top < 0 || b.bottom > innerHeight) gp.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
				});
			});
			if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { away = !es[0].isIntersecting; }, { threshold: 0.35 }).observe(gp);
			window.addEventListener('resize', function () { track.scrollLeft = i * track.clientWidth; });
			function tick(now) {
				var bar = bars[i], v = vid(), paused = held || stopped || away || document.hidden;
				if (v) {
					if (paused && !v.paused) v.pause();
					else if (!paused && v.paused && !v.ended && v.dataset.started) v.play().catch(function () {});
					if (!v.paused) v.dataset.started = '1';
					if (bar && v.duration) bar.firstChild.style.width = Math.min(100, v.currentTime / v.duration * 100) + '%';
				} else if (!done) {
					if (paused) t0 = now - elapsed; else elapsed = now - t0;
					if (bar) bar.firstChild.style.width = Math.min(100, elapsed / DUR * 100) + '%';
					if (elapsed >= DUR) step(1, true);
				}
				requestAnimationFrame(tick);
			}
			activate(0);
			requestAnimationFrame(tick);
		});

		/* Template filters. */
		document.querySelectorAll('[data-tpl-filter]').forEach(function (g) {
			var grid = document.getElementById(g.getAttribute('data-tpl-filter'));
			if (!grid) return;
			g.querySelectorAll('button[data-kind]').forEach(function (b) {
				b.addEventListener('click', function () {
					var k = b.getAttribute('data-kind');
					g.querySelectorAll('button[data-kind]').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
					grid.querySelectorAll('[data-kind]').forEach(function (c) { c.hidden = !!k && c.getAttribute('data-kind') !== k; });
				});
			});
		});

		/* Real <form data-v9-lead> forms (investor enquiries): sent without leaving the page. */
		document.querySelectorAll('form[data-v9-lead]').forEach(function (f) {
			f.addEventListener('submit', function (e) {
				e.preventDefault();
				if (f.dataset.busy) return;
				var btn = f.querySelector('[type="submit"]');
				var data = {};
				new FormData(f).forEach(function (v, k) { if (k !== 'action' && k !== 'back') data[k] = v; });
				var msg = f.querySelector('.v9-lead-msg');
				if (!msg) { msg = document.createElement('p'); f.insertBefore(msg, btn); }
				f.dataset.busy = '1';
				btn.style.opacity = '.6';
				post(data).then(function (r) {
					delete f.dataset.busy;
					btn.style.opacity = '';
					var ok = r && r.ok;
					msg.className = 'v9-lead-msg' + (ok ? ' is-ok' : '');
					msg.setAttribute('role', ok ? 'status' : 'alert');
					msg.textContent = ok ? (r.message || 'Thank you. We’ll be in touch.') : ((r && r.message) || 'That didn’t go through. Check the details and try again.');
					msg.hidden = false;
					if (ok) {
						// Hide the fields and button (inline display styles beat the hidden attribute).
						[].forEach.call(f.children, function (c) { if (c !== msg && c.tagName !== 'DIV' && c.type !== 'hidden') c.style.display = 'none'; });
						f.querySelectorAll('.g2, label').forEach(function (c) { c.style.display = 'none'; });
						track('lead', { kind: data.kind, form: page, path: location.pathname });
					}
				});
			});
		});
	})();

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

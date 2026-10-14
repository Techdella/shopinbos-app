/* Gist: full-screen animated story viewer for the Gist circles (plugin gist.php). Tap right/left to move,
   hold to pause, swipe down or Esc to close. Slides auto-advance; groups play one after another. */
(function () {
	'use strict';
	var dataEl = document.getElementById('sib-gist-data');
	if (!dataEl) return;
	var groups = [];
	try { groups = JSON.parse(dataEl.textContent); } catch (e) { return; }
	var DUR = 5200, seenKey = 'sib-gist-seen';
	var seen = {};
	try { seen = JSON.parse(localStorage.getItem(seenKey) || '{}'); } catch (e) {}
	function markSeen() { document.querySelectorAll('.gist-item').forEach(function (b) { b.classList.toggle('is-seen', !!seen[b.getAttribute('data-gist')]); }); }
	markSeen();

	var view, gi = 0, si = 0, t0 = 0, raf = 0, paused = false, elapsed = 0;
	function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
	function track(ev, p) { try { if (window.SIB && SIB.track) SIB.track(ev, p); } catch (e) {} }

	function build() {
		view = el('div', 'gv');
		view.setAttribute('role', 'dialog'); view.setAttribute('aria-modal', 'true'); view.setAttribute('aria-label', 'Gist');
		view.innerHTML = '<div class="gv-stage"><div class="gv-card"><div class="gv-bars"></div><div class="gv-top"><span class="gv-av"><img alt=""></span><b class="gv-name"></b><span class="gv-brand">Gist</span>' +
			'<button class="gv-share" aria-label="Share on WhatsApp"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/></svg></button>' +
			'<button class="gv-x" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
			'<div class="gv-slide"></div><button class="gv-prev" aria-label="Previous"></button><button class="gv-next" aria-label="Next"></button></div></div>';
		document.body.appendChild(view);
		view.querySelector('.gv-x').addEventListener('click', close);
		view.querySelector('.gv-share').addEventListener('click', function (e) {
			e.stopPropagation();
			var g = groups[gi];
			window.open('https://wa.me/?text=' + encodeURIComponent(g.title + ' (60-second tips from Shopinbos): ' + g.share), '_blank', 'noopener');
			track('gist_share', { group: g.slug });
		});
		view.querySelector('.gv-next').addEventListener('click', next);
		view.querySelector('.gv-prev').addEventListener('click', prev);
		var card = view.querySelector('.gv-card'), y0 = null;
		card.addEventListener('pointerdown', function (e) { paused = true; y0 = e.clientY; });
		card.addEventListener('pointerup', function (e) { paused = false; t0 = performance.now() - elapsed; if (y0 !== null && e.clientY - y0 > 90) close(); y0 = null; });
		card.addEventListener('pointerleave', function () { paused = false; t0 = performance.now() - elapsed; });
		view.addEventListener('click', function (e) { if (e.target === view || e.target.classList.contains('gv-stage')) close(); });
		document.addEventListener('keydown', function (e) {
			if (!view || view.hidden) return;
			if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev();
		});
	}

	function slideNode(s, g) {
		var n = el('div', 'gs gs-' + s.type);
		var add = function (tag, cls, text, i) { if (!text) return null; var x = el(tag, cls + ' ga', text); x.style.animationDelay = (0.12 + (i || 0) * 0.12) + 's'; n.appendChild(x); return x; };
		n.appendChild(el('span', 'gs-blob gs-b1')); n.appendChild(el('span', 'gs-blob gs-b2'));
		if (s.type === 'cover') {
			var pic = el('span', 'gs-pic'); var im = el('img'); im.src = g.img; im.alt = ''; pic.appendChild(im); n.appendChild(pic);
			add('span', 'gs-eye', s.eyebrow || 'Gist', 0); add('b', 'gs-h gs-h-xl', s.headline, 1);
			add('span', 'gs-hint', 'Tap to start', 3);
		} else if (s.type === 'number') {
			add('b', 'gs-num', s.number, 0); add('b', 'gs-h', s.headline, 1); add('p', 'gs-t', s.text, 2);
		} else if (s.type === 'list') {
			add('b', 'gs-h', s.headline, 0);
			var ul = el('ul', 'gs-list'); n.appendChild(ul);
			(s.items || []).forEach(function (it, i) { var li = el('li', 'ga', it); li.style.animationDelay = (0.3 + i * 0.15) + 's'; ul.appendChild(li); });
		} else if (s.type === 'myth') {
			var m = (s.headline || '').replace(/^Myth:\s*/i, ''), tr = (s.text || '').replace(/^Truth:\s*/i, '');
			add('span', 'gs-tag gs-tag-no', 'Myth', 0); add('b', 'gs-h gs-strike', m, 1);
			add('span', 'gs-tag gs-tag-yes', 'Truth', 3); add('p', 'gs-t', tr, 4);
		} else if (s.type === 'do-dont') {
			var d = add('div', 'gs-do', '', 0) || el('div'); var x2;
			var dd = el('div', 'gs-do ga'); dd.style.animationDelay = '.15s'; dd.innerHTML = '<span class="gs-tag gs-tag-yes">Do</span><b></b>'; dd.querySelector('b').textContent = s.do; n.appendChild(dd);
			x2 = el('div', 'gs-dont ga'); x2.style.animationDelay = '.45s'; x2.innerHTML = '<span class="gs-tag gs-tag-no">Don’t</span><b></b>'; x2.querySelector('b').textContent = s.dont; n.appendChild(x2);
		} else if (s.type === 'cta') {
			add('b', 'gs-h', s.headline, 0); add('p', 'gs-t', s.text, 1);
			var a = el('a', 'gs-cta ga', g.cta); a.href = g.link; a.style.animationDelay = '.4s'; n.appendChild(a);
			a.addEventListener('click', function (e) { e.stopPropagation(); track('gist_cta', { group: g.slug }); });
			var s2 = el('a', 'gs-cta2 ga', 'Start your shop free'); s2.href = '/go/signup?intent=gist'; s2.style.animationDelay = '.55s'; n.appendChild(s2);
			s2.addEventListener('click', function (e) { e.stopPropagation(); });
		} else {
			add('span', 'gs-eye', s.eyebrow, 0); add('b', 'gs-h', s.headline, 1); add('p', 'gs-t', s.text, 2);
		}
		return n;
	}

	function show() {
		var g = groups[gi], s = g.slides[si];
		var card = view.querySelector('.gv-card');
		card.style.setProperty('--g-bg', g.bg); card.style.setProperty('--g-fg', g.fg); card.style.setProperty('--g-ac', g.accent || '#FF6A2B');
		view.querySelector('.gv-av img').src = g.img;
		view.querySelector('.gv-name').textContent = g.title;
		var bars = view.querySelector('.gv-bars'); bars.innerHTML = '';
		g.slides.forEach(function (_, i) { var b = el('span', 'gv-bar'); b.appendChild(el('i')); if (i < si) b.classList.add('done'); bars.appendChild(b); });
		var holder = view.querySelector('.gv-slide');
		holder.innerHTML = ''; holder.appendChild(slideNode(s, g));
		elapsed = 0; t0 = performance.now();
		seen[g.slug] = 1; try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch (e) {}
		if (history.replaceState && location.pathname.indexOf('/gist') === 0) history.replaceState(null, '', '#' + g.slug);
	}
	function tick(now) {
		if (!view || view.hidden) return;
		if (!paused) elapsed = now - t0;
		var bar = view.querySelectorAll('.gv-bar')[si];
		if (bar) bar.firstChild.style.width = Math.min(100, elapsed / DUR * 100) + '%';
		if (elapsed >= DUR) next();
		raf = requestAnimationFrame(tick);
	}
	function next() { var g = groups[gi]; if (si < g.slides.length - 1) si++; else if (gi < groups.length - 1) { gi++; si = 0; } else { close(); return; } show(); }
	function prev() { if (si > 0) si--; else if (gi > 0) { gi--; si = groups[gi].slides.length - 1; } show(); }
	function open(slug) {
		gi = Math.max(0, groups.findIndex(function (g) { return g.slug === slug; })); si = 0;
		if (!view) build();
		view.hidden = false; document.documentElement.classList.add('gv-open');
		show(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
		track('gist_open', { group: groups[gi].slug });
	}
	function close() {
		if (!view) return;
		view.hidden = true; document.documentElement.classList.remove('gv-open'); cancelAnimationFrame(raf); markSeen();
		if (history.replaceState && location.hash) history.replaceState(null, '', location.pathname);
	}
	document.addEventListener('click', function (e) { var b = e.target.closest('[data-gist]'); if (b) { e.preventDefault(); open(b.getAttribute('data-gist')); } });
	if (location.pathname.indexOf('/gist') === 0 && location.hash.length > 1) {
		var h = location.hash.slice(1);
		if (groups.some(function (g) { return g.slug === h; })) open(h);
	}
})();

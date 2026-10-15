/* Shopinbos Academy: progress, language, checklist, quick check and video, saved on this phone.
 * localStorage key sib-academy-v1 → { lessons: { <id>: { done, checks: [], quiz, at } }, lang }
 * Every read and write is wrapped so the page still works when storage is blocked. */
(function () {
	var KEY = 'sib-academy-v1';
	var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY)); return s && s.lessons ? s : { lessons: {} }; } catch (e) { return { lessons: {} }; } }
	function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
	function lesson(s, id) { return s.lessons[id] || (s.lessons[id] = {}); }
	function track(name, props) { try { if (window.SIB && SIB.track) SIB.track(name, props); } catch (e) {} }
	var state = load();

	/* Done marks and track progress. */
	function paint() {
		$$('[data-lid]').forEach(function (el) {
			var l = state.lessons[el.getAttribute('data-lid')];
			el.classList.toggle('is-done', !!(l && l.done));
		});
		$$('[data-track-progress]').forEach(function (box) {
			var ids = box.getAttribute('data-track-progress').split(',').filter(Boolean);
			var done = ids.filter(function (id) { return state.lessons[id] && state.lessons[id].done; }).length;
			var pct = ids.length ? Math.round(done / ids.length * 100) : 0;
			var bar = box.querySelector('[data-progress-bar]'), txt = box.querySelector('[data-progress-text]'), p = box.querySelector('[data-progress-pct]');
			if (bar) bar.style.width = pct + '%';
			if (p) p.textContent = pct + '%';
			if (txt) txt.textContent = done === 0 ? 'Not started' : done === ids.length ? 'Track complete' : done + ' of ' + ids.length + ' done';
		});
		/* "Start this track" becomes "Continue" at the first lesson not done. */
		$$('[data-continue]').forEach(function (a) {
			var ids = a.getAttribute('data-continue').split(','), urls = a.getAttribute('data-continue-urls').split(' ');
			var anyDone = ids.some(function (id) { return state.lessons[id] && state.lessons[id].done; });
			var i = ids.findIndex(function (id) { return !(state.lessons[id] && state.lessons[id].done); });
			if (anyDone && i !== -1) { a.href = urls[i]; a.firstChild.textContent = 'Continue'; }
		});
	}
	paint();

	/* Track preview tabs on the Academy home. */
	$$('[data-preview]').forEach(function (sec) {
		var tabs = $$('[data-preview-tab]', sec);
		tabs.forEach(function (tab) {
			tab.addEventListener('click', function () {
				tabs.forEach(function (t) {
					var on = t === tab;
					t.setAttribute('aria-selected', String(on));
					var panel = document.getElementById(t.getAttribute('aria-controls'));
					if (panel) panel.hidden = !on;
				});
			});
		});
	});

	var root = document.querySelector('[data-lesson]');
	if (!root) return;
	var id = root.getAttribute('data-lesson');

	/* English / Pidgin. */
	function setLang(lang) {
		$$('[data-lang]').forEach(function (el) { el.hidden = el.getAttribute('data-lang') !== lang; });
		$$('[data-lang-pick]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-pick') === lang)); });
	}
	if ($$('[data-lang="pcm"]').length) {
		if (state.lang === 'pcm' || /[?&]lang=pcm/.test(location.search)) setLang('pcm');
		$$('[data-lang-pick]').forEach(function (b) {
			b.addEventListener('click', function () {
				var lang = b.getAttribute('data-lang-pick');
				setLang(lang); state.lang = lang; save(state); track('academy_lang', { lang: lang });
			});
		});
	}

	/* Checklist. */
	var checks = root.querySelector('[data-lesson-checks]');
	if (checks) {
		var rows = $$('.chkrow', checks);
		var ticked = (lesson(state, id).checks || []).slice();
		var paintChecks = function () { rows.forEach(function (r, i) { r.setAttribute('aria-pressed', String(ticked.indexOf(i) !== -1)); }); };
		rows.forEach(function (r, i) {
			r.addEventListener('click', function () {
				var at = ticked.indexOf(i);
				if (at === -1) ticked.push(i); else ticked.splice(at, 1);
				lesson(state, id).checks = ticked; save(state); paintChecks();
			});
		});
		paintChecks();
	}

	/* Quick check. */
	var quiz = root.querySelector('[data-quiz]');
	if (quiz) {
		var correct = Number(quiz.getAttribute('data-correct'));
		var verdict = quiz.querySelector('.quiz-verdict');
		var opts = $$('.quiz-opt', quiz);
		var answer = function (i) {
			opts.forEach(function (o, j) {
				o.classList.toggle('is-right', j === correct && i !== null);
				o.classList.toggle('is-wrong', j === i && i !== correct);
			});
			if (i === null) return;
			verdict.hidden = false;
			verdict.style.background = i === correct ? '#E2F5EA' : '#FDECEC';
			verdict.querySelector('b').textContent = verdict.getAttribute(i === correct ? 'data-right' : 'data-wrong');
			verdict.querySelector('b').style.color = i === correct ? '#16794A' : '#B42318';
		};
		opts.forEach(function (o, i) {
			o.addEventListener('click', function () { answer(i); lesson(state, id).quiz = i; save(state); track('academy_quiz', { lesson: id, right: i === correct }); });
		});
		if (typeof lesson(state, id).quiz === 'number') answer(lesson(state, id).quiz);
	}

	/* Mark as done, then go to the next lesson. */
	var doneBtn = root.querySelector('[data-lesson-done]');
	if (doneBtn) {
		if (lesson(state, id).done) doneBtn.lastChild.textContent = doneBtn.getAttribute('data-saved');
		doneBtn.addEventListener('click', function () {
			var l = lesson(state, id); l.done = true; l.at = Math.floor(Date.now() / 1000); save(state); paint();
			doneBtn.lastChild.textContent = doneBtn.getAttribute('data-saved');
			track('academy_lesson_done', { lesson: id });
			var next = root.getAttribute('data-next');
			if (next) setTimeout(function () { location.href = next; }, 600);
		});
	}

	/* Lite video: load YouTube only when tapped. */
	$$('[data-video]', root).forEach(function (b) {
		b.addEventListener('click', function () {
			var f = document.createElement('iframe');
			f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(b.getAttribute('data-video')) + '?autoplay=1&cc_load_policy=1&rel=0';
			f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.title = 'Lesson video';
			b.parentNode.appendChild(f); track('academy_video', { lesson: id });
		});
	});
})();

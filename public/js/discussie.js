window.Discussie = (function () {
  var API = '/api/discussie';

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function relatieveDatum(dateStr) {
    if (!dateStr) return '';
    var then = new Date(dateStr);
    var now = new Date();
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'zojuist';
    if (diff < 3600) return Math.floor(diff / 60) + ' min geleden';
    if (diff < 86400) return Math.floor(diff / 3600) + ' uur geleden';
    if (diff < 2592000) return Math.floor(diff / 86400) + ' dagen geleden';
    return then.toLocaleDateString('nl-NL');
  }

  function getVoteKey(type, slug, reactieId) {
    return 'discussie-stem-' + type + '-' + slug + '-' + reactieId;
  }

  function hasVoted(type, slug, reactieId) {
    try { return localStorage.getItem(getVoteKey(type, slug, reactieId)); } catch (e) { return null; }
  }

  function saveVote(type, slug, reactieId, dir) {
    try { localStorage.setItem(getVoteKey(type, slug, reactieId), dir); } catch (e) {}
  }

  function renderReactieForm(type, slug, parentId) {
    var idSuffix = parentId ? '-reply-' + parentId : '';
    return '<form class="discussie-form" data-type="' + escapeAttr(type) + '" data-slug="' + escapeAttr(slug) + '"' +
      (parentId ? ' data-parent="' + escapeAttr(parentId) + '"' : '') + '>' +
      '<div class="discussie-form-row">' +
        '<div class="discussie-form-field">' +
          '<label for="disc-naam' + idSuffix + '" class="sr-only">Naam</label>' +
          '<input type="text" id="disc-naam' + idSuffix + '" placeholder="Naam" required class="discussie-input">' +
        '</div>' +
        '<div class="discussie-form-field">' +
          '<label for="disc-email' + idSuffix + '" class="sr-only">E-mail (wordt niet getoond)</label>' +
          '<input type="email" id="disc-email' + idSuffix + '" placeholder="E-mail (wordt niet getoond)" required class="discussie-input">' +
        '</div>' +
      '</div>' +
      '<div class="discussie-form-field">' +
        '<label for="disc-tekst' + idSuffix + '" class="sr-only">Reactie</label>' +
        '<textarea id="disc-tekst' + idSuffix + '" placeholder="Schrijf een reactie..." required maxlength="2000" rows="3" class="discussie-textarea"></textarea>' +
        '<span class="discussie-charcount">0 / 2000</span>' +
      '</div>' +
      '<div class="discussie-form-actions">' +
        '<button type="submit" class="btn-primary discussie-submit">Plaats reactie</button>' +
      '</div>' +
      '<div class="discussie-form-feedback" hidden></div>' +
    '</form>';
  }

  function renderReactie(r, type, slug, isReply) {
    var voted = hasVoted(type, slug, r.id);
    var score = r.score || 0;
    var verborgen = r.verborgen || r.hidden;

    if (verborgen) {
      return '<div class="discussie-reactie discussie-reactie--verborgen' + (isReply ? ' discussie-reactie--reply' : '') + '">' +
        '<p class="discussie-verborgen-tekst">Deze reactie is verborgen' + (r.verborgen_reden ? ': ' + escapeHtml(r.verborgen_reden) : '') + '</p>' +
      '</div>';
    }

    var replies = '';
    if (!isReply && r.replies && r.replies.length) {
      replies = r.replies.map(function (reply) {
        return renderReactie(reply, type, slug, true);
      }).join('');
    }

    var replyBtn = !isReply
      ? '<button class="discussie-reply-btn" data-reactie-id="' + escapeAttr(String(r.id)) + '"><i class="lucide lucide-corner-down-right" aria-hidden="true"></i> Reageer</button>'
      : '';

    return '<div class="discussie-reactie' + (isReply ? ' discussie-reactie--reply' : '') + '" data-reactie-id="' + escapeAttr(String(r.id)) + '">' +
      '<div class="discussie-reactie-header">' +
        '<span class="discussie-naam">' + escapeHtml(r.naam) + '</span>' +
        '<span class="discussie-datum">' + relatieveDatum(r.datum || r.created_at) + '</span>' +
      '</div>' +
      '<p class="discussie-inhoud">' + escapeHtml(r.inhoud) + '</p>' +
      '<div class="discussie-reactie-acties">' +
        '<div class="discussie-stemmen" data-reactie-id="' + escapeAttr(String(r.id)) + '" data-type="' + escapeAttr(type) + '" data-slug="' + escapeAttr(slug) + '">' +
          '<button class="discussie-stem-btn' + (voted === 'up' ? ' discussie-stem--active' : '') + '" data-dir="up"' + (voted ? ' disabled' : '') + '><i class="lucide lucide-chevron-up" aria-hidden="true"></i></button>' +
          '<span class="discussie-score">' + score + '</span>' +
          '<button class="discussie-stem-btn' + (voted === 'down' ? ' discussie-stem--active' : '') + '" data-dir="down"' + (voted ? ' disabled' : '') + '><i class="lucide lucide-chevron-down" aria-hidden="true"></i></button>' +
        '</div>' +
        replyBtn +
      '</div>' +
      '<div class="discussie-reply-form" data-for="' + escapeAttr(String(r.id)) + '" hidden></div>' +
      replies +
    '</div>';
  }

  function render(container, type, slug, reacties, sort) {
    var sortVal = sort || 'stemmen';
    var sorted = reacties.slice().sort(function (a, b) {
      if (sortVal === 'stemmen') return (b.score || 0) - (a.score || 0);
      return new Date(b.datum || b.created_at || 0) - new Date(a.datum || a.created_at || 0);
    });

    container.innerHTML =
      '<div class="discussie">' +
        '<div class="discussie-header">' +
          '<h4><i class="lucide lucide-message-circle" aria-hidden="true"></i> Discussie (' + reacties.length + ')</h4>' +
          '<div class="discussie-sort">' +
            '<button class="discussie-sort-btn' + (sortVal === 'stemmen' ? ' active' : '') + '" data-sort="stemmen">Meeste stemmen</button>' +
            '<button class="discussie-sort-btn' + (sortVal === 'nieuwste' ? ' active' : '') + '" data-sort="nieuwste">Nieuwste</button>' +
          '</div>' +
        '</div>' +
        renderReactieForm(type, slug, null) +
        '<div class="discussie-lijst">' +
          (sorted.length ? sorted.map(function (r) { return renderReactie(r, type, slug, false); }).join('') : '<p class="discussie-leeg">Nog geen reacties. Wees de eerste.</p>') +
        '</div>' +
      '</div>';
  }

  function load(container, type, slug) {
    container.innerHTML = '<p class="discussie-laden">Discussie laden...</p>';
    container.hidden = false;
    container._discussieType = type;
    container._discussieSlug = slug;
    container._discussieSort = 'stemmen';

    fetch(API + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(slug))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var reacties = Array.isArray(data) ? data : (data.reacties || []);
        container._discussieData = reacties;
        render(container, type, slug, reacties, 'stemmen');
      })
      .catch(function () {
        container.innerHTML = '<p class="discussie-leeg">Kan discussie niet laden.</p>';
      });
  }

  function submitReactie(form, container) {
    var type = form.getAttribute('data-type');
    var slug = form.getAttribute('data-slug');
    var parentId = form.getAttribute('data-parent') || null;
    var naam = form.querySelector('input[type="text"]').value.trim();
    var email = form.querySelector('input[type="email"]').value.trim();
    var inhoud = form.querySelector('textarea').value.trim();
    var feedback = form.querySelector('.discussie-form-feedback');
    var submitBtn = form.querySelector('.discussie-submit');

    if (!naam || !email || !inhoud) {
      feedback.textContent = 'Vul alle velden in.';
      feedback.className = 'discussie-form-feedback discussie-form-feedback--error';
      feedback.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Bezig...';

    var body = { naam: naam, email: email, inhoud: inhoud };
    if (parentId) body.parent_id = parentId;

    fetch(API + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(slug), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function () {
        feedback.textContent = 'Reactie geplaatst.';
        feedback.className = 'discussie-form-feedback discussie-form-feedback--success';
        feedback.hidden = false;
        form.querySelector('input[type="text"]').value = '';
        form.querySelector('input[type="email"]').value = '';
        form.querySelector('textarea').value = '';
        var charcount = form.querySelector('.discussie-charcount');
        if (charcount) charcount.textContent = '0 / 2000';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Plaats reactie';
        load(container, type, slug);
      })
      .catch(function () {
        feedback.textContent = 'Kon reactie niet plaatsen. Probeer het later opnieuw.';
        feedback.className = 'discussie-form-feedback discussie-form-feedback--error';
        feedback.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Plaats reactie';
      });
  }

  function stemOpReactie(stemWrap, dir, container) {
    var reactieId = stemWrap.getAttribute('data-reactie-id');
    var type = stemWrap.getAttribute('data-type');
    var slug = stemWrap.getAttribute('data-slug');
    var btns = stemWrap.querySelectorAll('.discussie-stem-btn');
    btns.forEach(function (b) { b.disabled = true; });

    fetch(API + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(slug) + '/' + encodeURIComponent(reactieId) + '/stem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ richting: dir })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        saveVote(type, slug, reactieId, dir);
        var scoreEl = stemWrap.querySelector('.discussie-score');
        if (data.score !== undefined) scoreEl.textContent = data.score;
        var activeBtn = stemWrap.querySelector('[data-dir="' + dir + '"]');
        if (activeBtn) activeBtn.classList.add('discussie-stem--active');
      })
      .catch(function () {
        btns.forEach(function (b) { b.disabled = false; });
      });
  }

  function bindEvents(container) {
    container.addEventListener('click', function (e) {
      var sortBtn = e.target.closest('.discussie-sort-btn');
      if (sortBtn && container._discussieData) {
        container.querySelectorAll('.discussie-sort-btn').forEach(function (b) { b.classList.remove('active'); });
        sortBtn.classList.add('active');
        container._discussieSort = sortBtn.getAttribute('data-sort');
        render(container, container._discussieType, container._discussieSlug, container._discussieData, container._discussieSort);
        return;
      }

      var stemBtn = e.target.closest('.discussie-stem-btn');
      if (stemBtn && !stemBtn.disabled) {
        var stemWrap = stemBtn.closest('.discussie-stemmen');
        stemOpReactie(stemWrap, stemBtn.getAttribute('data-dir'), container);
        return;
      }

      var replyBtn = e.target.closest('.discussie-reply-btn');
      if (replyBtn) {
        var reactieId = replyBtn.getAttribute('data-reactie-id');
        var replyFormWrap = replyBtn.closest('.discussie-reactie').querySelector('.discussie-reply-form[data-for="' + reactieId + '"]');
        if (replyFormWrap.hidden) {
          replyFormWrap.innerHTML = renderReactieForm(container._discussieType, container._discussieSlug, reactieId);
          replyFormWrap.hidden = false;
          var textarea = replyFormWrap.querySelector('textarea');
          if (textarea) {
            textarea.addEventListener('input', function () {
              var cc = this.closest('form').querySelector('.discussie-charcount');
              if (cc) cc.textContent = this.value.length + ' / 2000';
            });
          }
        } else {
          replyFormWrap.hidden = true;
        }
        return;
      }
    });

    container.addEventListener('submit', function (e) {
      if (e.target.classList.contains('discussie-form')) {
        e.preventDefault();
        submitReactie(e.target, container);
      }
    });

    container.addEventListener('input', function (e) {
      if (e.target.matches('.discussie-textarea')) {
        var cc = e.target.closest('.discussie-form-field').querySelector('.discussie-charcount');
        if (cc) cc.textContent = e.target.value.length + ' / 2000';
      }
    });
  }

  return {
    load: load,
    bindEvents: bindEvents
  };
})();

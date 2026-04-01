(function () {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  const links = navLinks.querySelectorAll('a');

  function openMenu() {
    navLinks.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Menu sluiten');
    document.body.classList.add('menu-open');
  }

  function closeMenu() {
    navLinks.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menu openen');
    document.body.classList.remove('menu-open');
  }

  function isOpen() {
    return navLinks.classList.contains('open');
  }

  toggle.addEventListener('click', function () {
    isOpen() ? closeMenu() : openMenu();
  });

  links.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) closeMenu();
  });

  document.addEventListener('click', function (e) {
    if (isOpen() && !navLinks.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  // Signup form
  var form = document.getElementById('signup-form');
  if (form) {
    var submitting = false;
    var input = document.getElementById('email-input');
    var btn = form.querySelector('button[type="submit"]');
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function showFeedback(text, isError) {
      var existing = form.parentNode.querySelector('.form-feedback');
      if (existing) existing.remove();

      var msg = document.createElement('p');
      msg.className = 'form-feedback' + (isError ? ' form-feedback--error' : '');
      msg.textContent = text;
      form.parentNode.insertBefore(msg, form.nextSibling);

      setTimeout(function () {
        msg.classList.add('fade-out');
        msg.addEventListener('transitionend', function () { msg.remove(); });
      }, 4000);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitting) return;
      var email = input.value.trim();
      if (!email || !emailPattern.test(email)) {
        showFeedback('Vul een geldig e-mailadres in.', true);
        return;
      }

      submitting = true;
      btn.disabled = true;
      btn.textContent = 'Bezig...';

      fetch('/api/aanmelden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      })
        .then(function (res) {
          if (!res.ok) throw new Error(res.status);
          input.value = '';
          showFeedback('Bedankt! Je bent aangemeld.', false);
          loadSupportersCount();
        })
        .catch(function () {
          showFeedback('Er ging iets mis. Probeer het later opnieuw.', true);
        })
        .finally(function () {
          submitting = false;
          btn.disabled = false;
          btn.textContent = 'Aanmelden';
        });
    });
  }

  // Supporters count
  var countEl = document.getElementById('supporters-count');
  function loadSupportersCount() {
    if (!countEl) return;
    fetch('/api/supporters/count')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.count > 0) {
          countEl.textContent = 'Al ' + data.count + ' mensen doen mee.';
          countEl.hidden = false;
        }
      })
      .catch(function () {});
  }
  loadSupportersCount();

  // Copy to clipboard (donate BTC address)
  var copyBtn = document.getElementById('btn-copy-btc');
  var btcAddress = document.getElementById('btc-address');
  if (copyBtn && btcAddress) {
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(btcAddress.textContent).then(function () {
        copyBtn.innerHTML = '<i class="lucide lucide-check" aria-hidden="true"></i>';
        setTimeout(function () {
          copyBtn.innerHTML = '<i class="lucide lucide-copy" aria-hidden="true"></i>';
        }, 2000);
      });
    });
  }

  // Cookie banner
  var banner = document.getElementById('cookie-banner');
  var dismissBtn = document.getElementById('cookie-dismiss');
  if (banner && dismissBtn) {
    if (!localStorage.getItem('cookie-dismissed')) {
      banner.hidden = false;
    }
    dismissBtn.addEventListener('click', function () {
      banner.hidden = true;
      localStorage.setItem('cookie-dismissed', '1');
    });
  }

  // Finance table (transparantie page)
  var financeBody = document.getElementById('finance-data');
  if (financeBody) {
    var API_BASE = '/api';

    function formatEurFromString(eurStr) {
      var num = parseFloat(eurStr);
      var sign = num < 0 ? '-' : '';
      var abs = Math.abs(num);
      return sign + '\u20AC' + abs.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function renderRows(items) {
      if (!items.length) {
        financeBody.innerHTML = '<tr><td colspan="6" class="table-status">Nog geen transacties.</td></tr>';
        return;
      }
      financeBody.innerHTML = items.map(function (item) {
        var isExpense = item.type === 'uitgave';
        var badgeClass = isExpense ? 'badge--expense' : 'badge--income';
        var badgeLabel = isExpense ? 'Uitgave' : 'Inkomst';
        var amountClass = 'col-amount' + (isExpense ? ' expense' : ' income');
        var receiptCell = '';
        if (item.receipt_url) {
          var isBlockchain = item.receipt_url.indexOf('blockstream.info') !== -1;
          var linkLabel = isBlockchain ? 'Blockchain' : 'Factuur';
          var hashTag = item.receipt_hash
            ? '<span class="receipt-hash">' + item.receipt_hash.substring(0, 8) + '</span>'
            : '';
          receiptCell = '<a href="' + item.receipt_url + '" class="receipt-link" target="_blank" rel="noopener">' + linkLabel + '</a>' + hashTag;
        }
        return '<tr>' +
          '<td>' + item.date + '</td>' +
          '<td><span class="badge ' + badgeClass + '">' + badgeLabel + '</span></td>' +
          '<td>' + item.category + '</td>' +
          '<td>' + item.description + '</td>' +
          '<td class="' + amountClass + '">' + formatEurFromString(item.amount_eur) + '</td>' +
          '<td class="col-receipt">' + receiptCell + '</td>' +
          '</tr>';
      }).join('');
    }

    fetch(API_BASE + '/financien')
      .then(function (res) { return res.json(); })
      .then(function (data) { renderRows(data.transacties || []); })
      .catch(function () {
        financeBody.innerHTML = '<tr><td colspan="6" class="table-status">Kan gegevens niet laden. Probeer het later opnieuw.</td></tr>';
      });

    var summaryIncome = document.getElementById('summary-income');
    var summaryExpenses = document.getElementById('summary-expenses');
    var summaryBalance = document.getElementById('summary-balance');

    fetch(API_BASE + '/financien/samenvatting')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        summaryIncome.textContent = formatEurFromString(data.totaal_inkomsten_eur);
        summaryExpenses.textContent = formatEurFromString(data.totaal_uitgaven_eur);
        summaryBalance.textContent = formatEurFromString(data.saldo_eur);
        summaryBalance.classList.add(parseFloat(data.saldo_eur) >= 0 ? 'income' : 'expense');

        if (data.bitcoin_balans_btc && data.bitcoin_balans_btc !== '0.00000000') {
          var btcCard = document.getElementById('summary-btc-card');
          var btcValue = document.getElementById('summary-btc');
          if (btcCard && btcValue) {
            btcValue.textContent = data.bitcoin_balans_btc + ' BTC';
            btcCard.hidden = false;
          }
        }
      })
      .catch(function () {
        summaryIncome.textContent = '--';
        summaryExpenses.textContent = '--';
        summaryBalance.textContent = '--';
      });
  }
})();

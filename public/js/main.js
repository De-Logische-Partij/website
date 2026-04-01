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

  // Signup form — inline feedback instead of alert
  var form = document.getElementById('signup-form');
  if (form) {
    var submitting = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitting) return;
      var input = document.getElementById('email-input');
      var email = input.value.trim();
      if (!email) return;

      submitting = true;
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Bezig...';

      // Simulate a submission (replace with real endpoint later)
      setTimeout(function () {
        input.value = '';
        submitting = false;
        btn.disabled = false;
        btn.textContent = 'Aanmelden';

        var msg = document.createElement('p');
        msg.className = 'form-feedback';
        msg.textContent = 'Bedankt! Je bent aangemeld.';
        form.parentNode.insertBefore(msg, form.nextSibling);

        setTimeout(function () {
          msg.classList.add('fade-out');
          msg.addEventListener('transitionend', function () { msg.remove(); });
        }, 4000);
      }, 600);
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
          var hashTag = item.receipt_hash
            ? '<span class="receipt-hash">' + item.receipt_hash.substring(0, 8) + '</span>'
            : '';
          receiptCell = '<a href="' + item.receipt_url + '" class="receipt-link" target="_blank" rel="noopener">Factuur</a>' + hashTag;
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
      })
      .catch(function () {
        summaryIncome.textContent = '--';
        summaryExpenses.textContent = '--';
        summaryBalance.textContent = '--';
      });
  }
})();

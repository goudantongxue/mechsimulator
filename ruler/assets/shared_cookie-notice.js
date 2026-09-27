/* cookie-notice.js — v2
   Shows a cookie consent banner once per browser session (using localStorage).
   Automatically removed on dismiss. No external dependencies. */
(function () {
  'use strict';
  if (localStorage.getItem('cookieOK') === '1') return;

  var div = document.createElement('div');
  div.id = 'cookie-notice';
  div.innerHTML =
    'This site uses cookies from <strong>Google Analytics</strong> and <strong>Google AdSense</strong> ' +
    'to measure traffic and show relevant ads. ' +
    '<a href="/privacy-policy/">Learn more in our Privacy Policy</a>' +
    '&nbsp;&nbsp;<button id="cookie-notice-btn">Got it</button>';
  document.body.appendChild(div);

  document.getElementById('cookie-notice-btn').addEventListener('click', function () {
    localStorage.setItem('cookieOK', '1');
    div.parentNode.removeChild(div);
  });
})();

// ── CUSTOMER STATE
var CFG = { vat: 7 };
var menuItems = [];
var table = '';
var cCart = [];
var cCat = 'All';
var cNote = '';
var cSent = false;
var sentOrder = null;
var socket = null;

var SPICE = ['', '🌶', '🌶🌶', '🌶🌶🌶'];

// ── INIT
document.addEventListener('DOMContentLoaded', function () {
  parseQueryParams();
  fetchMenu();
  initSocket();
});

// Extract table number from QR URL params (e.g. ?table=T4)
function parseQueryParams() {
  var params = new URLSearchParams(window.location.search);
  table = params.get('table') || 'Takeaway';
}

function fetchMenu() {
  Promise.all([
    fetch('/api/config').then(r => r.json()),
    fetch('/api/menu').then(r => r.json())
  ]).then(([cfgData, menuData]) => {
    CFG = cfgData;
    menuItems = menuData.filter(m => m.available !== false);
    renderCPH();
  }).catch(err => {
    console.error('Failed to load menu:', err);
    toast('Connection Error', true);
  });
}

// ── REAL-TIME EVENTS
function initSocket() {
  socket = io();

  // Listen for Cashier approvals
  socket.on('pending-confirmed', function ({ id, order }) {
    if (sentOrder && sentOrder.id === id) {
      sentOrder.status = 'confirmed';
      renderCPH();
      playSuccessChime();
    }
  });

  // Listen for Cashier rejections
  socket.on('pending-rejected', function ({ id }) {
    if (sentOrder && sentOrder.id === id) {
      cSent = false;
      sentOrder = null;
      toast('Order declined by staff', true);
      renderCPH();
    }
  });

  socket.on('db-cleared', function () {
    cCart = [];
    cSent = false;
    sentOrder = null;
    renderCPH();
  });
}

// ── NOTIFICATION CHIME FOR CUSTOMER SUCCESS (WEB AUDIO)
function playSuccessChime() {
  try {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Upward positive arpeggio!
    var notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + (index * 0.08));
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime + (index * 0.08));
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + (index * 0.08) + 0.25);
      
      osc.start(audioCtx.currentTime + (index * 0.08));
      osc.stop(audioCtx.currentTime + (index * 0.08) + 0.25);
    });
  } catch (e) {
    console.warn("Chime failed:", e);
  }
}

// ── CUSTOMER FUNCTIONS
function cGQ(id) {
  var item = cCart.find(function (x) { return x.id === id; });
  return item ? item.qty : 0;
}

function cpSub() {
  return cCart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
}

function cpVat() {
  return Math.round(cpSub() * (CFG.vat / 100));
}

function cpGrand() {
  return cpSub() + cpVat();
}

function cpCnt() {
  return cCart.reduce(function (s, i) { return s + i.qty; }, 0);
}

function cAdd(id) {
  var m = menuItems.find(function (x) { return x.id === id; });
  if (!m) return;
  var ex = cCart.find(function (x) { return x.id === id; });
  if (ex) {
    ex.qty++;
  } else {
    cCart.push({
      id: m.id,
      name: m.name,
      en: m.en,
      emoji: m.emoji,
      photo: m.photo || '',
      price: Number(m.price),
      qty: 1
    });
  }
  renderCPH();
}

function cChg(id, d) {
  var item = cCart.find(function (x) { return x.id === id; });
  if (!item) return;
  item.qty += d;
  if (item.qty <= 0) {
    cCart = cCart.filter(function (x) { return x.id !== id; });
  }
  renderCPH();
}

// Customer Send Order API call
function cSend() {
  if (!cCart.length) return;
  
  var orderId = 'QR-' + Math.floor(1000 + Math.random() * 9000); // Temporary customer-side ID tracking
  var rec = {
    id: orderId,
    table: table,
    items: cCart.map(function (i) { return Object.assign({}, i); }),
    note: cNote,
    subtotal: cpSub(),
    vat: cpVat(),
    total: cpGrand()
  };

  toast('Sending order...');
  fetch('/api/pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rec)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      cSent = true;
      sentOrder = data.order;
      renderCPH();
      toast('Order sent successfully!');
    } else {
      toast('Failed to send order', true);
    }
  })
  .catch(() => toast('API Connection Error', true));
}

// ── CUSTOMER MENU RENDERER (Clean Mobile view)
function renderCPH() {
  var ph = document.getElementById('cph-container');
  if (!ph) return;

  var avail = menuItems.filter(function (m) { return m.available !== false; });
  var cats = ['All'].concat(Array.from(new Set(avail.map(function (m) { return m.cat; }))));
  var fl = avail.filter(function (m) { return cCat === 'All' || m.cat === cCat; });
  var cnt = cpCnt(), tot = cpGrand();

  // Screen 1: Order has been sent, pending approval or confirmed
  if (cSent && sentOrder) {
    var isConfirmed = sentOrder.status === 'confirmed';
    var icon = isConfirmed ? '🍳' : '🕒';
    var title = isConfirmed ? 'Order Confirmed!' : 'Awaiting Approval';
    var text = isConfirmed 
      ? 'Staff has accepted your order.<br>Your dishes are now cooking in the kitchen! 🧑‍🍳'
      : 'Order successfully sent to staff.<br>Please wait a moment for cashier confirmation...';
    var buttonClass = isConfirmed ? 'background:#34c759' : 'background:#ff9500; opacity: 0.95; cursor: default;';
    var buttonLabel = isConfirmed ? '✓ Approved' : '⏳ Awaiting Staff...';
    
    ph.innerHTML =
      '<div class="cph-sent" style="min-height: 100vh; padding: 40px 20px;">' +
      '<div style="font-size:68px; margin-bottom:16px; animation: bounce 1.5s infinite alternate;">' + icon + '</div>' +
      '<div style="font-size:22px; font-weight:700; color:#1c1c1e; margin-bottom:10px">' + title + '</div>' +
      '<div style="font-size:14px; color:#62627a; line-height:1.8; margin-bottom:30px; max-width:280px; margin-left:auto; margin-right:auto">' + text + '</div>' +
      '<div style="padding:10px 24px; border-radius:10px; font-size:13px; font-weight:700; color:#fff; text-align:center;' + buttonClass + '">' + buttonLabel + '</div>' +
      (isConfirmed ? '<button onclick="cSent=false;cCart=[];renderCPH()" style="margin-top:12px; padding:10px 24px; background:#e5e5ea; color:#1c1c1e; border:none; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; width:100%; max-width:200px">Order More Dishes</button>' : '') +
      '</div>';
    return;
  }

  // Screen 2: Catalog and Ordering View
  var h = 
    '<div class="cph-hero"><div class="cph-logo">🌶 Khao Dee</div><div class="cph-sub">Dining Table <strong>' + table + '</strong> · Self-Service Digital Menu</div></div>' +
    '<div class="cph-cats">' + cats.map(function (c) { return '<button class="cph-cat' + (cCat === c ? ' on' : '') + '" onclick="cCat=\'' + c + '\';renderCPH()">' + c + '</button>'; }).join('') + '</div>' +
    '<div class="cph-list">';

  fl.forEach(function (m) {
    var q = cGQ(m.id);
    var pp = m.photo
      ? '<img class="cph-photo" src="' + m.photo + '" onerror="this.outerHTML=\'<div class=cph-photo-ph>' + (m.emoji || '🍽') + '</div>\'">'
      : '<div class="cph-photo-ph">' + (m.emoji || '🍽') + '</div>';

    h += '<div class="cph-item">' + pp + '<div class="cph-info"><div>' +
      '<div class="cph-name">' + m.en + (m.spice > 0 ? ' ' + SPICE[Math.min(m.spice, 3)] : '') + '</div>' +
      '<div class="cph-desc">' + (m.desc || m.name || '') + '</div></div>' +
      '<div class="cph-foot"><div class="cph-price">฿' + Number(m.price).toLocaleString() + '</div>' +
      (q > 0 ? '<div class="cph-qctrl"><button class="cph-qbtn" onclick="cChg(' + m.id + ',-1)">−</button><span class="cph-qnum">' + q + '</span><button class="cph-qbtn" onclick="cAdd(' + m.id + ')">+</button></div>'
        : '<button class="cph-add" onclick="cAdd(' + m.id + ')">Add</button>') +
      '</div></div></div>';
  });

  h += '</div>';

  if (cnt > 0) {
    h += '<div class="cph-notezone"><textarea rows="2" placeholder="Note: No spice, allergies, extra ice..." oninput="cNote=this.value">' + cNote + '</textarea></div>' +
      '<div class="cph-cartbar" onclick="cSend()"><span class="cph-cartcnt">' + cnt + ' items</span><span style="font-size:13px;font-weight:700">Send Table Order · ฿' + tot.toLocaleString() + '</span></div>';
  }

  ph.innerHTML = h;
}

// ── CUSTOMER TOAST
var _ctt;
function toast(msg, err) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(_ctt);
  _ctt = setTimeout(function () { el.classList.remove('show'); }, 3000);
}

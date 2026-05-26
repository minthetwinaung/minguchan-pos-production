// ── STATE VARIABLES
var CFG = { shopName: 'Min Gu Chan', shopAddr: 'Bangkok', shopPhone: '02-123-4567', shopTax: '0-1234-56789', vat: 7 };
var menuItems = [];
var salesDB = [];
var pendingDB = [];
var cart = {};
var actCat = 'All';
var srch = '';
var actTbl = 'T1';
var orderNote = '';
var anPer = 'today';
var anFrom = '';
var anTo = '';
var salFilter = 'all';
var backupInfo = { lastBackup: null, recentBackups: [] };
var selMI = null;
var editMI = {};
var selSaleId = null;
var curPage = 'pos';

var TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'Bar', 'Takeaway'];
var SPICE = ['', '🌶', '🌶🌶', '🌶🌶🌶'];

function dedupeById(list) {
  return (list || []).reduce(function (acc, item) {
    if (!acc.find(function (x) { return x.id === item.id; })) acc.push(item);
    return acc;
  }, []);
}

function genId() {
  var maxOrd = salesDB.concat(pendingDB).reduce(function (max, o) {
    var m = String(o.id).match(/^ORD-(\d+)$/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return 'ORD-' + String(maxOrd + 1).padStart(4, '0');
}

// ── INITIALIZATION
document.addEventListener('DOMContentLoaded', function () {
  initSocket();
  fetchInitialData();
  startClock();
});

// ── DATA FETCHING (REST API)
function fetchInitialData() {
  Promise.all([
    fetch('/api/config').then(r => r.json()),
    fetch('/api/menu').then(r => r.json()),
    fetch('/api/sales').then(r => r.json()),
    fetch('/api/pending').then(r => r.json()),
    fetch('/api/backup/status').then(r => r.json()).catch(() => ({ lastBackup: null, recentBackups: [] }))
  ]).then(([cfgData, menuData, salesData, pendingData, backupData]) => {
    CFG = cfgData;
    menuItems = menuData;
    // Ensure no duplicate sales/pending entries by id
    salesDB = dedupeById(salesData);
    pendingDB = dedupeById(pendingData);
    backupInfo = backupData || backupInfo;
    
    // Initial Render
    gp('pos');
    updatePendingBadge();
  }).catch(err => {
    console.error('Failed to load server data:', err);
    toast('API Connection Failed', true);
  });
}

// ── SOCKET.IO SYNC
var socket;
function initSocket() {
  socket = io();

  // Live Sync: Customer places self-order
  socket.on('new-pending-order', function (newOrder) {
    // avoid duplicates
    if (!pendingDB.find(function (o) { return o.id === newOrder.id; })) pendingDB.push(newOrder);
    updatePendingBadge();
    playChime();
    toast('🔔 New order from Table ' + newOrder.table);
    if (curPage === 'qr') rQR();
  });

  // Live Sync: Order confirmed
  socket.on('pending-confirmed', function ({ id, order }) {
    pendingDB = pendingDB.filter(o => o.id !== id);
    // avoid duplicate sales entries
    if (!salesDB.find(function (s) { return s.id === order.id; })) salesDB.unshift(order);
    updatePendingBadge();
    toast('Order ' + id + ' confirmed');
    if (curPage === 'qr') rQR();
    if (curPage === 'sales') rSales();
    if (curPage === 'reports') rReports();
  });

  // Live Sync: New sale created on another terminal
  socket.on('sale-created', function (sale) {
    if (!salesDB.find(o => o.id === sale.id)) {
      salesDB.unshift(sale);
      toast('New sale recorded: ' + sale.id);
      if (curPage === 'sales') rSales();
      if (curPage === 'reports') rReports();
    }
  });

  // Live Sync: Sale status updated (void/refund)
  socket.on('sale-updated', function (sale) {
    var record = salesDB.find(o => o.id === sale.id);
    if (record) {
      Object.assign(record, sale);
      toast('Sale updated: ' + sale.id);
      if (curPage === 'sales') rSales();
      if (curPage === 'reports') rReports();
    }
  });

  // Live Sync: Order rejected
  socket.on('pending-rejected', function ({ id }) {
    pendingDB = pendingDB.filter(o => o.id !== id);
    updatePendingBadge();
    toast('Order ' + id + ' rejected', true);
    if (curPage === 'qr') rQR();
    if (curPage === 'reports') rReports();
  });

  // Live Sync: Databases cleared
  socket.on('db-cleared', function () {
    salesDB = [];
    pendingDB = [];
    updatePendingBadge();
    toast('Databases reset', true);
    if (curPage === 'sales') rSales();
    if (curPage === 'reports') rReports();
    if (curPage === 'qr') rQR();
  });
}

// ── NOTIFICATION CHIME (WEB AUDIO API)
function playChime() {
  try {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Double chime ding!
    var osc1 = audioCtx.createOscillator();
    var gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    gain1.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

    var osc2 = audioCtx.createOscillator();
    var gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12); // E5
    gain2.gain.setValueAtTime(0.2, audioCtx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.47);

    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.35);
    osc2.start(audioCtx.currentTime + 0.12);
    osc2.stop(audioCtx.currentTime + 0.47);
  } catch (e) {
    console.warn("Chime failed:", e);
  }
}

// ── CLOCK & BADGE UPDATER
function startClock() {
  setInterval(function () {
    var el = document.getElementById('clock');
    if (el) el.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }, 1000);
}

function updatePendingBadge() {
  var cnt = pendingDB.filter(function (o) { return o.status === 'pending'; }).length;
  var b = document.getElementById('pbadge');
  if (b) {
    b.textContent = cnt + ' New';
    b.style.display = cnt > 0 ? 'inline' : 'none';
  }
  var ta = document.getElementById('btn-confirm-all');
  if (ta) ta.style.display = cnt > 0 ? 'inline-block' : 'none';
}

// ── TOAST NOTIFICATION
var _tt;
function toast(msg, err) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(_tt);
  _tt = setTimeout(function () { el.classList.remove('show'); }, 3500);
}

// ── GENERAL ROUTING
function gp(p) {
  curPage = p;
  document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
  var nb = document.getElementById('nb-' + p);
  if (nb) nb.classList.add('active');
  
  ['pos', 'sales', 'reports', 'menu', 'qr', 'cfg'].forEach(function (pg) {
    document.getElementById('pg-' + pg).classList.toggle('dn', pg !== p);
  });
  
  if (p === 'pos') rPOS();
  if (p === 'sales') rSales();
  if (p === 'reports') rReports();
  if (p === 'menu') rMenu();
  if (p === 'qr') rQR();
  if (p === 'cfg') rCFG();
}

// Keyboard shortcut: Alt+Q opens QR Table Sync
document.addEventListener('keydown', function (e) {
  if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
    gp('qr');
  }
});

// ── POS CART & SELECTION
function getQ(id) { return cart[id] ? cart[id].qty : 0; }
function cSub() { return Object.values(cart).reduce(function (s, i) { return s + i.price * i.qty; }, 0); }
function cVat() { return Math.round(cSub() * (CFG.vat / 100)); }
function cTotal() { return cSub() + cVat(); }
function cCount() { return Object.values(cart).reduce(function (s, i) { return s + i.qty; }, 0); }

function addItem(id) {
  var m = menuItems.find(function (x) { return x.id === id; });
  if (!m || m.available === false) return;
  if (cart[id]) cart[id].qty++; else cart[id] = Object.assign({}, m, { qty: 1 });
  rPOS();
}

function chgQty(id, d) {
  if (!cart[id]) return;
  cart[id].qty += d;
  if (cart[id].qty <= 0) delete cart[id];
  rPOS();
}

// POS Action: Send to Kitchen
function sendKitchen() {
  if (!Object.keys(cart).length) return;
  var r = {
    id: genId(), table: actTbl, items: Object.values(cart).map(function (i) { return Object.assign({}, i); }),
    note: orderNote, subtotal: cSub(), vat: cVat(), total: cTotal(), method: null, status: 'sent', time: new Date().toISOString()
  };

  fetch('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(r)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      var sale = data.sale || r;
      if (!salesDB.find(function (x) { return x.id === sale.id; })) salesDB.unshift(sale);
      toast('Order ' + sale.id + ' sent to Kitchen');
      cart = {}; 
      orderNote = ''; 
      rPOS();
    }
  })
  .catch(() => toast('API Error saving order', true));
}

// POS Action: Cash/Card Settlement
function payNow(method) {
  if (!Object.keys(cart).length) return;
  var r = {
    id: genId(), table: actTbl, items: Object.values(cart).map(function (i) { return Object.assign({}, i); }),
    note: orderNote, subtotal: cSub(), vat: cVat(), total: cTotal(), method: method, status: 'paid', time: new Date().toISOString()
  };

  fetch('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(r)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      var sale = data.sale || r;
      if (!salesDB.find(function (x) { return x.id === sale.id; })) salesDB.unshift(sale);
      showR(sale);
      cart = {}; 
      orderNote = ''; 
      rPOS();
    }
  })
  .catch(() => toast('API Settlement Error', true));
}

// ── BILL PRINT RECEIPT VIEW
function showR(r) {
  var dt = new Date(r.time);
  var ds = dt.toLocaleDateString('th-TH') + ' ' + dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('r-body').innerHTML =
    '<div class="r-ctr"><div class="r-shop">' + CFG.shopName + '</div>' +
    '<div class="r-addr">' + CFG.shopAddr + '<br>Tel: ' + CFG.shopPhone + '<br>Tax: ' + CFG.shopTax + '</div></div>' +
    '<hr class="r-hr">' +
    '<div class="r-row"><span>Order</span><span><b>' + r.id + '</b></span></div>' +
    '<div class="r-row"><span>Table</span><span>' + r.table + '</span></div>' +
    '<div class="r-row"><span>Date</span><span>' + ds + '</span></div>' +
    '<div class="r-row"><span>Payment</span><span>' + (r.method || '—') + '</span></div>' +
    '<hr class="r-hr">' +
    r.items.map(function (i) { 
      return '<div class="r-item"><span class="r-item-n">' + i.en + '</span><span class="r-item-q">x' + i.qty + '</span><span>฿' + (i.price * i.qty).toLocaleString() + '</span></div>'; 
    }).join('') +
    '<hr class="r-hr">' +
    '<div class="r-row"><span>Subtotal</span><span>฿' + r.subtotal.toLocaleString() + '</span></div>' +
    '<div class="r-row"><span>VAT ' + CFG.vat + '%</span><span>฿' + r.vat.toLocaleString() + '</span></div>' +
    '<div class="r-row big"><span>TOTAL</span><span>฿' + r.total.toLocaleString() + '</span></div>' +
    (r.note ? '<hr class="r-hr"><div style="font-size:10px;color:#666">Note: ' + r.note + '</div>' : '') +
    '<div class="r-foot">Thank you — Please come again! 🙏</div>';
  document.getElementById('r-ov').style.display = 'flex';
}

function closeR() { 
  document.getElementById('r-ov').style.display = 'none'; 
  if (curPage === 'sales') rSales(); 
}

function reprint(id) { 
  var r = salesDB.find(function (x) { return x.id === id; }); 
  if (r) showR(r); 
}

function selectSale(id) {
  selSaleId = id;
  rSales();
}

function voidOrd(id) {
  if (!confirm('Void order ' + id + '?')) return;
  fetch('/api/sales/' + id + '/void', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        var record = salesDB.find(function (x) { return x.id === id; });
        if (record) record.status = 'void';
        rSales();
        toast('Order voided successfully', true);
      }
    })
    .catch(() => toast('API Void Error', true));
}

function paySale(id, method) {
  fetch('/api/sales/' + id + '/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: method })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        var record = salesDB.find(function (x) { return x.id === id; });
        if (record) Object.assign(record, data.sale);
        rSales();
        toast('Order ' + id + ' settled by ' + method);
      } else {
        toast(data.error || 'Payment failed', true);
      }
    })
    .catch(() => toast('API Payment Error', true));
}

function refundOrd(id) {
  // Ask for optional refund reason and cashier name
  var reason = prompt('Refund reason (optional):', 'Customer request');
  if (reason === null) return; // cancelled
  var by = prompt('Processed by (name, optional):', 'Cashier');

  fetch('/api/sales/' + id + '/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason, by: by })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        var record = salesDB.find(function (x) { return x.id === id; });
        if (record) Object.assign(record, data.sale);
        rSales();
        toast('Order refunded and kitchen request cancelled', true);
      }
    })
    .catch(() => toast('API Refund Error', true));
}

// ── POS INTERFACE RENDERER
function rPOS() {
  var cats = ['All'].concat(Array.from(new Set(menuItems.filter(function (m) { return m.available !== false; }).map(function (m) { return m.cat; }))));
  var fl = menuItems.filter(function (m) {
    return m.available !== false &&
      (actCat === 'All' || m.cat === actCat) &&
      (!srch || m.en.toLowerCase().includes(srch.toLowerCase()) || m.name.includes(srch));
  });
  
  var items = Object.values(cart);
  var sub = cSub(), vat = cVat(), tot = cTotal(), cnt = cCount();
  
  var h = '<div class="pos-wrap"><div class="menu-side">' +
    '<div class="menu-head">' +
    '<div class="search-box"><svg width="14" height="14" fill="none" stroke="var(--text3)" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
    '<input placeholder="Search dishes..." value="' + srch + '" oninput="srch=this.value;rPOS()"></div>' +
    '<div class="cats">' + cats.map(function (c) { return '<button class="cat-btn' + (actCat === c ? ' active' : '') + '" onclick="actCat=\'' + c + '\';rPOS()">' + c + '</button>'; }).join('') + '</div></div>' +
    '<div class="menu-grid">';
    
  fl.forEach(function (m) {
    var q = getQ(m.id);
    var ph = m.photo
      ? '<img class="m-photo" src="' + m.photo + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' + '<div class="m-ph" style="display:none">' + m.emoji + '</div>'
      : '<div class="m-ph">' + m.emoji + '</div>';
      
    h += '<button class="m-card' + (q > 0 ? ' in-cart' : '') + '" onclick="addItem(' + m.id + ')">' +
      (m.tags && m.tags.includes('popular') ? '<span class="m-tag tag-hot">🔥 Popular</span>' : '') +
      (m.tags && m.tags.includes('new') ? '<span class="m-tag tag-new">New</span>' : '') +
      ph + '<div class="m-body">' +
      '<div class="m-name">' + m.en + '</div>' +
      '<div class="m-sub">' + (m.name || '') + (m.desc ? ' · ' + m.desc : '') + '</div>' +
      '<div class="m-price">฿' + Number(m.price).toLocaleString() + '</div>' +
      (m.spice > 0 ? '<div class="m-spice">' + SPICE[Math.min(m.spice, 3)] + '</div>' : '') +
      '</div>' + (q > 0 ? '<div class="m-qdot">' + q + '</div>' : '') +
      '</button>';
  });
  
  h += '</div></div>' +
    '<div class="order-side">' +
    '<div class="ord-hdr"><span>Current Order</span><span style="font-size:12px;color:var(--text3)">' + cnt + ' items</span></div>' +
    '<div class="tbl-row">' + TABLES.map(function (t) { return '<button class="tbl-btn' + (actTbl === t ? ' active' : '') + '" onclick="actTbl=\'' + t + '\';rPOS()">' + t + '</button>'; }).join('') + '</div>' +
    '<div class="ord-items">' +
    (items.length === 0 ? '<div class="empty-cart"><span style="font-size:32px">🍔</span><span>Select dishes to start</span></div>'
      : items.map(function (i) {
        return '<div class="o-row">' +
          '<div class="q-ctrl"><button class="q-btn" onclick="chgQty(' + i.id + ',-1)">−</button>' +
          '<span class="q-num">' + i.qty + '</span>' +
          '<button class="q-btn" onclick="chgQty(' + i.id + ',+1)">+</button></div>' +
          '<span class="o-name">' + (i.emoji || '') + ' ' + i.en + '</span>' +
          '<span class="o-price">฿' + (i.price * i.qty).toLocaleString() + '</span></div>';
      }).join('')) +
    '</div>' +
    '<div class="ord-foot">' +
    '<textarea class="note-box" rows="2" placeholder="Ex: Special requests, allergies..." oninput="orderNote=this.value">' + orderNote + '</textarea>' +
    '<div class="tot-line"><span>Subtotal</span><span>฿' + sub.toLocaleString() + '</span></div>' +
    '<div class="tot-line"><span>VAT ' + CFG.vat + '%</span><span>฿' + vat.toLocaleString() + '</span></div>' +
    '<div class="grand-line"><span>Total Due</span><span>฿' + tot.toLocaleString() + '</span></div>' +
    '<button class="send-btn" onclick="sendKitchen()" ' + (items.length === 0 ? 'disabled' : '') + '>Send to Kitchen →</button>' +
    '<div class="pay-row">' +
    '<button class="pay-btn btn-cash" onclick="payNow(\'Cash\')" ' + (items.length === 0 ? 'disabled' : '') + '>💵 Cash</button>' +
    '<button class="pay-btn btn-card" onclick="payNow(\'Card\')" ' + (items.length === 0 ? 'disabled' : '') + '>💳 Card</button>' +
    '</div></div></div></div>';
    
  document.getElementById('pg-pos').innerHTML = h;
}

// ── SALES & ANALYTICS REPORT RENDERER
function getRange() {
  var now = new Date(), from, to = new Date(now); to.setHours(23, 59, 59, 999);
  if (anPer === 'today') { from = new Date(now); from.setHours(0, 0, 0, 0); }
  else if (anPer === 'week') { from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0); }
  else if (anPer === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (anPer === 'year') { from = new Date(now.getFullYear(), 0, 1); }
  else { from = anFrom ? new Date(anFrom + 'T00:00:00') : new Date(now); from.setHours(0, 0, 0, 0); to = anTo ? new Date(anTo + 'T23:59:59') : to; }
  return { from: from, to: to };
}

function rSales() {
  var rng = getRange();
  var inR = salesDB.filter(function (o) { var d = new Date(o.time); return d >= rng.from && d <= rng.to; });
  var paid = inR.filter(function (o) { return o.status === 'paid'; });
  var rev = paid.reduce(function (s, o) { return s + o.total; }, 0);

  var orders = paid.length;
  var avg = orders > 0 ? Math.round(rev / orders) : 0;

  var allPaid = salesDB.filter(function (o) { return o.status === 'paid'; });
  var allRev = allPaid.reduce(function (s, o) { return s + o.total; }, 0);

  var allOrders = salesDB;
  var shown = salFilter === 'all' ? allOrders : allOrders.filter(function (o) { return o.status === salFilter; });

  if (!shown.some(function (x) { return x.id === selSaleId; })) {
    selSaleId = shown.length ? shown[0].id : null;
  }
  var selectedSale = shown.find(function (o) { return o.id === selSaleId; }) || shown[0] || null;

  // Dynamic Charts Compiled Safely
  var chartData = [];
  if (anPer === 'today' || anPer === 'custom') {
    var hh = Array.from({ length: 24 }, function (_, i) { return { l: String(i).padStart(2, '0') + 'h', v: 0 }; });
    paid.forEach(function (o) { hh[new Date(o.time).getHours()].v += o.total; });
    chartData = hh.filter(function (_, i) { return i >= 8 && i <= 22; });
  } else if (anPer === 'week') {
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var dd = Array.from({ length: 7 }, function (_, i) {
      var dt = new Date(); dt.setDate(dt.getDate() - 6 + i);
      return { l: days[dt.getDay()], v: 0, dt: dt };
    });
    paid.forEach(function (o) {
      var od = new Date(o.time);
      dd.forEach(function (x) { if (od.toDateString() === x.dt.toDateString()) x.v += o.total; });
    });
    chartData = dd;
  } else if (anPer === 'month') {
    var dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    var dm = Array.from({ length: dim }, function (_, i) { return { l: String(i + 1), v: 0 }; });
    paid.forEach(function (o) { var d = new Date(o.time).getDate() - 1; if (dm[d]) dm[d].v += o.total; });
    chartData = dm;
  } else {
    var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var dy = mo.map(function (l) { return { l: l, v: 0 }; });
    paid.forEach(function (o) { dy[new Date(o.time).getMonth()].v += o.total; });
    chartData = dy;
  }

  var maxV = Math.max.apply(null, chartData.map(function (x) { return x.v; }).concat([1]));
  var imap = {};
  paid.forEach(function (o) {
    o.items.forEach(function (i) {
      if (!imap[i.en]) imap[i.en] = { name: i.en, emoji: i.emoji || '🍽', qty: 0 };
      imap[i.en].qty += i.qty;
    });
  });

  var top = Object.values(imap).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 6);
  var maxQ = (top[0] || { qty: 1 }).qty;

  var totalOrders = shown.length;
  var totalTables = Array.from(new Set(shown.map(function (o) { return o.table; }))).length;
  var averageItems = totalOrders > 0 ? Math.round(shown.reduce(function (s, o) { return s + o.items.length; }, 0) / totalOrders) : 0;

  var tableGroups = inR.reduce(function (acc, o) {
    var table = o.table || 'Unknown';
    if (!acc[table]) acc[table] = { table: table, orders: 0, revenue: 0, subtotal: 0 };
    acc[table].orders += 1;
    acc[table].revenue += Number(o.total) || 0;
    acc[table].subtotal += Number(o.subtotal) || 0;
    return acc;
  }, {});

  var tableRows = Object.values(tableGroups)
    .sort(function (a, b) { return b.revenue - a.revenue; })
    .slice(0, 8)
    .map(function (t) {
      return '<tr><td>' + t.table + '</td><td>' + t.orders + '</td><td>฿' + t.revenue.toLocaleString() + '</td><td>฿' + (t.orders > 0 ? Math.round(t.revenue / t.orders).toLocaleString() : '0') + '</td></tr>';
    }).join('');

  var dailyGroups = inR.reduce(function (acc, o) {
    var isoDate = o.time ? o.time.slice(0, 10) : new Date().toISOString().slice(0, 10);
    if (!acc[isoDate]) acc[isoDate] = { date: isoDate, orders: 0, revenue: 0, subtotal: 0 };
    acc[isoDate].orders += 1;
    acc[isoDate].revenue += Number(o.total) || 0;
    acc[isoDate].subtotal += Number(o.subtotal) || 0;
    return acc;
  }, {});

  var dailyRows = Object.values(dailyGroups)
    .sort(function (a, b) { return a.date.localeCompare(b.date); })
    .slice(-8)
    .map(function (d) {
      return '<tr><td>' + d.date + '</td><td>' + d.orders + '</td><td>฿' + d.revenue.toLocaleString() + '</td></tr>';
    }).join('');

  var saleCards = shown.map(function (o) {
    var isActive = selectedSale && selectedSale.id === o.id;
    return '<button class="sale-card' + (isActive ? ' active' : '') + '" onclick="selectSale(\'' + o.id + '\')">' +
      '<div class="sc-row"><span class="sc-id">' + o.id + '</span><span class="pill pill-' + o.status + '">' + o.status.toUpperCase() + '</span></div>' +
      '<div class="sc-line"><span>' + o.table + '</span><span>฿' + o.total.toLocaleString() + '</span></div>' +
      '<div class="sc-meta"><span>' + o.items.length + ' items</span><span>' + new Date(o.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' • ' + new Date(o.time).toLocaleDateString('th-TH') + '</span></div>' +
    '</button>';
  }).join('');

  var selectedDetails = '';
  if (selectedSale) {
    selectedDetails = '<div class="sd-panel">' +
      '<div class="sd-head"><div><div class="sd-label">Sale Details</div><div class="sd-title">' + selectedSale.id + '</div></div><div class="sd-status pill pill-' + selectedSale.status + '">' + selectedSale.status.toUpperCase() + '</div></div>' +
      '<div class="sd-grid"><div><span>Table</span><strong>' + selectedSale.table + '</strong></div><div><span>Payment</span><strong>' + (selectedSale.method || '–') + '</strong></div><div><span>Items</span><strong>' + selectedSale.items.length + '</strong></div><div><span>Timestamp</span><strong>' + new Date(selectedSale.time).toLocaleString('th-TH') + '</strong></div></div>' +
      '<div class="sd-section"><div class="sd-section-title">Order Items</div>' +
      selectedSale.items.map(function (item) {
        return '<div class="sd-item"><div><span>' + item.en + '</span><small>' + (item.emoji || '') + ' x' + item.qty + '</small></div><div>฿' + (item.price * item.qty).toLocaleString() + '</div></div>';
      }).join('') +
      '</div>' +
      '<div class="sd-summary-row"><span>Subtotal</span><strong>฿' + selectedSale.subtotal.toLocaleString() + '</strong></div>' +
      '<div class="sd-summary-row"><span>VAT ' + CFG.vat + '%</span><strong>฿' + selectedSale.vat.toLocaleString() + '</strong></div>' +
      '<div class="sd-summary-row sd-total"><span>Total</span><strong>฿' + selectedSale.total.toLocaleString() + '</strong></div>' +
      (selectedSale.note ? '<div class="sd-note">Note: ' + selectedSale.note + '</div>' : '') +
      (selectedSale.refundedAt ? '<div class="sd-refund">Refunded by ' + (selectedSale.refundedBy || '—') + ' at ' + new Date(selectedSale.refundedAt).toLocaleString('th-TH') + (selectedSale.refundReason ? ' — Reason: ' + selectedSale.refundReason : '') + '</div>' : '') +
      '<div class="sd-actions"><button class="sm-btn" onclick="reprint(\'' + selectedSale.id + '\')">Reprint</button>' +
      (selectedSale.status === 'sent' ? '<button class="sm-btn" onclick="paySale(\'' + selectedSale.id + '\', \'Cash\')">Settle Cash</button><button class="sm-btn" onclick="paySale(\'' + selectedSale.id + '\', \'Card\')">Settle Card</button>' : '') +
      (selectedSale.status === 'sent' ? '<button class="sm-btn" onclick="refundOrd(\'' + selectedSale.id + '\')">Refund</button>' : '') +
      (selectedSale.status === 'paid' ? '<button class="sm-btn" onclick="voidOrd(\'' + selectedSale.id + '\')">Void</button>' : '') +
      '</div>' +
      '</div>';
  } else {
    selectedDetails = '<div class="sd-panel sd-empty">Select a sale from the list to inspect order details.</div>';
  }

  var pl = { today: 'Today', week: '7 Days', month: 'Month', year: 'Year', custom: 'Custom' };

  var h = '<div class="an-wrap">' +
    '<div class="an-toolbar">' +
    ['today', 'week', 'month', 'year', 'custom'].map(function (p) { return '<button class="p-btn' + (anPer === p ? ' active' : '') + '" onclick="anPer=\'' + p + '\';rSales()">' + pl[p] + '</button>'; }).join('') +
    (anPer === 'custom' ? '<input type="date" class="date-in" id="rng-from" value="' + anFrom + '" onchange="anFrom=this.value;rSales()"><span style="color:var(--text3);font-size:12px">to</span><input type="date" class="date-in" id="rng-to" value="' + anTo + '" onchange="anTo=this.value;rSales()">' : '') +
    '<button class="ico-btn" onclick="exportCSV()">⬇ Export CSV</button>' +
    '<span style="font-size:12px;color:var(--text3);margin-left:auto;font-weight:600">' + rng.from.toLocaleDateString('th-TH') + ' – ' + rng.to.toLocaleDateString('th-TH') + '</span></div>' +
    '<div class="summary-grid">' +
      '<div class="summary-card summary-revenue"><div class="summary-label">Revenue</div><div class="summary-value">฿' + rev.toLocaleString() + '</div><div class="summary-meta">Completed in range</div></div>' +
      '<div class="summary-card summary-orders"><div class="summary-label">Orders</div><div class="summary-value">' + orders + '</div><div class="summary-meta">Paid / completed</div></div>' +
      '<div class="summary-card summary-average"><div class="summary-label">Avg. Bill</div><div class="summary-value">฿' + avg.toLocaleString() + '</div><div class="summary-meta">Per successful order</div></div>' +
      '<div class="summary-card summary-tables"><div class="summary-label">Active Tables</div><div class="summary-value">' + totalTables + '</div><div class="summary-meta">Unique tables covered</div></div>' +
    '</div>' +
    '<div class="an-card full"><div class="an-head">Sales Summary Reports</div>' +
      '<div class="two-col" style="padding: 20px; gap: 18px;">' +
        '<div class="an-card" style="min-height:320px;">' +
          '<div class="an-head">Top Tables</div>' +
          '<div class="s-scroll"><table class="stbl"><thead><tr><th>Table</th><th>Orders</th><th>Revenue</th><th>Avg</th></tr></thead><tbody>' +
            (tableRows || '<tr><td colspan="4" style="color:var(--text3);padding:20px;text-align:center">No table sales in selected range</td></tr>') +
          '</tbody></table></div>' +
        '</div>' +
        '<div class="an-card" style="min-height:320px;">' +
          '<div class="an-head">Daily Revenue</div>' +
          '<div class="s-scroll"><table class="stbl"><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>' +
            (dailyRows || '<tr><td colspan="3" style="color:var(--text3);padding:20px;text-align:center">No daily entries in selected range</td></tr>') +
          '</tbody></table></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="two-col">' +
      '<div class="an-card"><div class="an-head">Sales Analytics Chart</div>' +
      '<div class="bar-chart">' +
      (paid.length === 0 ? '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:13px">No sales recorded yet</div>'
        : chartData.map(function (x) {
            var pct = Math.max(Math.round(x.v / maxV * 100), x.v > 0 ? 5 : 2);
            var isMax = x.v > 0 && x.v === Math.max.apply(null, chartData.map(function (a) { return a.v; }));
            return '<div class="b-col"><div class="b-fill" style="height:' + pct + '%;background:' + (isMax ? 'var(--amber)' : 'var(--red)') + ';opacity:' + (x.v > 0 ? 0.7 + x.v / maxV * 0.3 : 0.15) + '"></div><div class="b-lbl">' + x.l + '</div></div>';
          }).join('')) +
      '</div></div>' +
      '<div class="an-card"><div class="an-head">Top Selling Dishes</div>' +
      (top.length === 0 ? '<div style="padding:24px;text-align:center;font-size:13px;color:var(--text3)">No products sold yet</div>'
        : top.map(function (it, i) {
            return '<div class="top-row"><span style="color:var(--text3);font-size:11px;min-width:16px">' + (i + 1) + '</span><span style="font-size:16px">' + it.emoji + '</span><span style="flex:1;font-weight:500">' + it.name + '</span><div class="ti-bg"><div class="ti-fill" style="width:' + Math.round(it.qty / maxQ * 100) + '%"></div></div><span class="ti-val">' + it.qty + 'x</span></div>';
          }).join('')) +
      '</div></div>' +
    '</div>' +
    '<div class="sales-detail-grid">' +
      '<div class="sales-list-card"><div class="an-head">Sales Details (' + totalOrders + ' entries)</div>' +
        '<div class="f-row">' + [['all', 'All Logs'], ['paid', 'Completed'], ['sent', 'Pending Kitchen'], ['void', 'Voided']].map(function (v) { return '<button class="f-btn' + (salFilter === v[0] ? ' active' : '') + '" onclick="salFilter=\'' + v[0] + '\';rSales()">' + v[1] + '</button>'; }).join('') + '</div>' +
        '<div class="sales-list">' +
        (shown.length === 0 ? '<div class="sales-empty">No transactions in selected filter</div>' : saleCards) +
        '</div>' +
      '</div>' +
      selectedDetails +
    '</div>' +
  '</div>';

  document.getElementById('pg-sales').innerHTML = h;
}

async function rReports() {
  var range = getRange();
  var from = range.from.toISOString();
  var to = range.to.toISOString();
  var summary = null;
  var tableData = null;
  var dailyData = null;

  try {
    var reqs = await Promise.all([
      fetch('/api/reports/summary?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to)),
      fetch('/api/reports/sales-by-table?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to)),
      fetch('/api/reports/daily?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to))
    ]);
    var json = await Promise.all(reqs.map(function (r) { return r.ok ? r.json() : Promise.reject(r); }));
    summary = json[0];
    tableData = json[1];
    dailyData = json[2];
  } catch (err) {
    console.error('Report fetch failed', err);
    toast('Unable to load reports', true);
    return;
  }

  var avgOrder = summary.totalOrders > 0 ? Math.round(summary.revenue / summary.totalOrders) : 0;
  var tableRows = (tableData.tables || []).map(function (t) {
    return '<tr><td>' + t.table + '</td><td>' + t.totalOrders + '</td><td>฿' + t.revenue.toLocaleString() + '</td><td>฿' + (t.totalOrders ? Math.round(t.revenue / t.totalOrders).toLocaleString() : '0') + '</td></tr>';
  }).join('');
  var dailyRows = (dailyData.daily || []).map(function (d) {
    return '<tr><td>' + d.date + '</td><td>' + d.totalOrders + '</td><td>฿' + d.revenue.toLocaleString() + '</td></tr>';
  }).join('');
  var statusRows = (summary.byStatus || []).map(function (s) {
    return '<div class="status-card"><span>' + s.status + '</span><strong>' + s.count + '</strong><small>฿' + s.revenue.toLocaleString() + '</small></div>';
  }).join('');

  var h = '<div class="an-wrap">' +
    '<div class="an-toolbar">' +
      '<span class="an-title">Production Reports</span>' +
      '<span style="margin-left:auto;color:var(--text3);font-size:13px">' + range.from.toLocaleDateString('th-TH') + ' – ' + range.to.toLocaleDateString('th-TH') + '</span>' +
    '</div>' +
    '<div class="summary-grid">' +
      '<div class="summary-card summary-revenue"><div class="summary-label">Revenue</div><div class="summary-value">฿' + summary.revenue.toLocaleString() + '</div><div class="summary-meta">Sales revenue in range</div></div>' +
      '<div class="summary-card summary-orders"><div class="summary-label">Orders</div><div class="summary-value">' + summary.totalOrders + '</div><div class="summary-meta">Total orders</div></div>' +
      '<div class="summary-card summary-average"><div class="summary-label">Avg Order</div><div class="summary-value">฿' + avgOrder.toLocaleString() + '</div><div class="summary-meta">Average order value</div></div>' +
      '<div class="summary-card summary-tables"><div class="summary-label">Tax / VAT</div><div class="summary-value">฿' + summary.vat.toLocaleString() + '</div><div class="summary-meta">VAT collected</div></div>' +
    '</div>' +
    '<div class="two-col">' +
      '<div class="an-card"><div class="an-head">Top Performing Tables</div>' +
        '<div class="s-scroll"><table class="stbl"><thead><tr><th>Table</th><th>Orders</th><th>Revenue</th><th>Avg</th></tr></thead><tbody>' +
          (tableRows || '<tr><td colspan="4" style="color:var(--text3);padding:20px;text-align:center">No table sales yet</td></tr>') +
        '</tbody></table></div>' +
      '</div>' +
      '<div class="an-card"><div class="an-head">Daily Sales</div>' +
        '<div class="s-scroll"><table class="stbl"><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>' +
          (dailyRows || '<tr><td colspan="3" style="color:var(--text3);padding:20px;text-align:center">No daily sales yet</td></tr>') +
        '</tbody></table></div>' +
      '</div>' +
    '</div>' +
    '<div class="status-panel">' + statusRows + '</div>' +
  '</div>';

  document.getElementById('pg-reports').innerHTML = h;
}

// ── MENU MANAGER RENDERER
function rMenu() {
  var sb = menuItems.map(function (m) {
    var on = selMI && selMI.id === m.id;
    var ph = m.photo 
      ? '<img src="' + m.photo + '" onerror="this.style.display=\'none\'">' 
      : (m.emoji || '🍽');
    return '<div class="mgr-row' + (on ? ' sel' : '') + '" onclick="selMIFn(' + m.id + ')">' +
      '<div class="mgr-thumb">' + (m.photo ? ph : m.emoji || '🍽') + '</div>' +
      '<div style="flex:1;min-width:0"><div class="mgr-iname">' + m.en + '</div>' +
      '<div class="mgr-iprice">฿' + Number(m.price).toLocaleString() + '<span class="av-dot ' + (m.available !== false ? 'av-on' : 'av-off') + '">' + (m.available !== false ? 'ACTIVE' : 'INACTIVE') + '</span></div>' +
      '</div></div>';
  }).join('');
  
  document.getElementById('pg-menu').innerHTML =
    '<div class="mgr-wrap"><div class="mgr-sb">' +
    '<div class="mgr-sb-hdr"><span>Dish Database (' + menuItems.length + ')</span><button class="madd-btn" onclick="newMI()">+ Add New</button></div>' +
    '<div class="mgr-list">' + sb + '</div></div>' +
    '<div class="mgr-main" id="mgr-fm">' +
    (selMI ? rMIForm() : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);flex-direction:column;gap:15px"><span style="font-size:54px">🍽</span><span style="font-weight:500">Select a dish to edit or click Add New</span></div>') +
    '</div></div>';
}

function rMIForm() {
  var m = selMI, d = editMI;
  var cats = ['Salads', 'Soups', 'Stir Fry', 'Rice', 'Noodles', 'Drinks', 'Desserts', 'Specials'];
  var tags = d.tags !== undefined ? d.tags : (m.tags || []);
  var avail = d.available !== undefined ? d.available : (m.available !== false);
  var photo = d.photo !== undefined ? d.photo : (m.photo || '');
  
  return '<div class="mform">' +
    '<div class="mform-title">' + (m._new ? '✨ Register New Dish' : '📝 Modify Dish: ' + m.en) + '</div>' +
    
    '<div class="ff"><label>Dish Picture</label>' +
    (photo ? '<img class="photo-prev-img" id="pp" src="' + photo + '">' : '<img class="photo-prev-img" id="pp" style="display:none">') +
    '<div class="upload-zone" onclick="document.getElementById(\'pfi\').click()">' +
    '<input type="file" id="pfi" accept="image/*" style="display:none" onchange="handleImageUpload(event)">' +
    '<div style="font-size:32px;margin-bottom:6px">📸</div>' +
    '<div style="font-size:12px;color:var(--text2)">Upload standard PNG/JPG image</div>' +
    '</div>' +
    '<input type="text" id="phurl" placeholder="Alternatively, paste external image URL..." value="' + photo + '" ' +
    'oninput="editMI.photo=this.value;updPP(this.value)" ' +
    'class="cfg-input" style="margin-top:8px; font-size: 11px;">' +
    '</div>' +
    
    '<div class="fg2">' +
    '<div class="ff"><label>English Title *</label><input value="' + (d.en != null ? d.en : (m.en || '')) + '" oninput="editMI.en=this.value"></div>' +
    '<div class="ff"><label>Thai / Alternate Title</label><input value="' + (d.name != null ? d.name : (m.name || '')) + '" oninput="editMI.name=this.value"></div>' +
    '<div class="ff"><label>Price (฿) *</label><input type="number" min="0" value="' + (d.price != null ? d.price : (m.price || '')) + '" oninput="editMI.price=Number(this.value)"></div>' +
    '<div class="ff"><label>Food Category</label><select onchange="editMI.cat=this.value">' + cats.map(function (c) { return '<option ' + ((d.cat || m.cat) === c ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>' +
    '<div class="ff"><label>Assoc. Emoji</label><input value="' + (d.emoji != null ? d.emoji : (m.emoji || '')) + '" oninput="editMI.emoji=this.value" maxlength="4"></div>' +
    '<div class="ff"><label>Spiciness Level</label><select onchange="editMI.spice=Number(this.value)">' +
    [[0, 'Mild / No Spice'], [1, '🌶 Low Heat'], [2, '🌶🌶 Med Heat'], [3, '🌶🌶🌶 Extreme Hot']].map(function (v) { return '<option value="' + v[0] + '" ' + ((d.spice != null ? d.spice : (m.spice || 0)) == v[0] ? 'selected' : '') + '>' + v[1] + '</option>'; }).join('') + '</select></div></div>' +
    
    '<div class="ff"><label>Detailed Description</label><input value="' + (d.desc != null ? d.desc : (m.desc || '')) + '" oninput="editMI.desc=this.value" placeholder="Briefly describe dish ingredients..."></div>' +
    
    '<div class="tog-row">' +
    '<label class="tog-item" onclick="editMI.available=!(editMI.available!=null?editMI.available:selMI.available!==false);rMenu()">' +
    '<div class="tog-track' + (avail ? ' on' : '') + '"><div class="tog-thumb"></div></div>In Stock / Active</label>' +
    '<label class="tog-item" onclick="togTag(\'popular\')">' +
    '<div class="tog-track' + (tags.includes('popular') ? ' on' : '') + '"><div class="tog-thumb"></div></div>🔥 Popularity Tag</label>' +
    '<label class="tog-item" onclick="togTag(\'new\')">' +
    '<div class="tog-track' + (tags.includes('new') ? ' on' : '') + '"><div class="tog-thumb"></div></div>✨ Fresh Debut Tag</label>' +
    '</div>' +
    
    '<div><button class="btn-sv" onclick="saveMIFn()">💾 Save Dish Details</button>' +
    (!m._new ? '<button class="btn-dl" onclick="delMI(' + m.id + ')">🗑 Delete Dish</button>' : '') +
    '</div></div>';
}

// REST API Image Upload integration (Removes Base64 storage bottleneck)
function handleImageUpload(event) {
  var file = event.target.files[0];
  if (!file) return;

  var formData = new FormData();
  formData.append('photo', file);

  toast('Uploading photo...');
  fetch('/api/upload', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      editMI.photo = data.photoUrl;
      updPP(data.photoUrl);
      toast('Photo uploaded!');
    } else {
      toast('Upload failed: ' + (data.error || 'Unknown error'), true);
    }
  })
  .catch(() => toast('Server error uploading image', true));
}

function updPP(src) {
  var p = document.getElementById('pp');
  if (src) {
    p.src = src;
    p.style.display = 'block';
  } else {
    p.style.display = 'none';
  }
}

function selMIFn(id) { 
  selMI = Object.assign({}, menuItems.find(function (x) { return x.id === id; })); 
  editMI = {}; 
  rMenu(); 
}

function newMI() {
  var nid = Math.max.apply(null, menuItems.map(function (x) { return x.id; }).concat([0])) + 1;
  selMI = { id: nid, en: '', name: '', cat: 'Stir Fry', price: 0, emoji: '🍽', spice: 0, desc: '', photo: '', available: true, tags: [], _new: true };
  editMI = Object.assign({}, selMI); 
  rMenu();
}

function togTag(t) {
  var tg = (editMI.tags !== undefined ? editMI.tags : (selMI.tags || [])).slice();
  var i = tg.indexOf(t); 
  if (i >= 0) tg.splice(i, 1); else tg.push(t); 
  editMI.tags = tg; 
  rMenu();
}

function saveMIFn() {
  var en = editMI.en != null ? editMI.en : selMI.en;
  var pr = editMI.price != null ? editMI.price : selMI.price;
  if (!en) { toast('Please enter dish title', true); return; }
  if (!pr) { toast('Please specify pricing', true); return; }
  
  var mg = Object.assign({}, selMI, editMI); 
  delete mg._new;

  fetch('/api/menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mg)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      var idx = menuItems.findIndex(function (x) { return x.id === mg.id; });
      if (idx >= 0) menuItems[idx] = mg; else menuItems.push(mg);
      selMI = mg; 
      editMI = {}; 
      toast('Saved successfully: ' + mg.en); 
      rMenu();
    }
  })
  .catch(() => toast('API Error saving dish', true));
}

function delMI(id) {
  if (!confirm('Permanently delete this dish from the menu?')) return;
  fetch('/api/menu/' + id, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        menuItems = menuItems.filter(function (x) { return x.id !== id; }); 
        selMI = null; 
        editMI = {}; 
        toast('Dish deleted'); 
        rMenu();
      }
    })
    .catch(() => toast('API Error deleting dish', true));
}

// ── QR SYNC & PENDING ORDERS RENDERER
function rQR() {
  var pend = pendingDB.filter(function (o) { return o.status === 'pending'; });
  var h = '<div class="qr-pg"><div class="qr-ibox">' +
    '<div style="font-size:15px;font-weight:700;margin-bottom:6px">📱 Live QR Ordering Dashboard</div>' +
    '<div style="font-size:12px;color:var(--text2);line-height:1.8">Waitstaff places QR codes on dining tables. Customers scan → place orders → server broadcasts → cashier approves → sent to kitchen.</div></div>';
    
  if (pend.length > 0) {
    h += '<div class="pend-box"><div class="pend-hd"><span>🔔 Live Self-Orders awaiting Staff Confirmation (' + pend.length + ')</span>' +
      '<button onclick="cfmAll()" style="padding:6px 14px;background:var(--green);border:none;border-radius:8px;color:#000;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(52,199,89,0.3)">Confirm All Orders</button></div>' +
      pend.map(function (o) {
        return '<div class="pend-row"><div class="pend-info">' +
          '<div class="pend-nm">Table ' + o.table + ' · <span style="color:var(--amber2)">' + o.id + '</span></div>' +
          '<div class="pend-it">' + o.items.map(function (i) { return i.en + ' × ' + i.qty; }).join(' · ') + '</div>' +
          '<div class="pend-tm">' + new Date(o.time).toLocaleTimeString('th-TH') + ' · Total Bill: ฿' + o.total.toLocaleString() + '</div>' +
          (o.note ? '<div style="font-size:11px;color:var(--amber2);margin-top:4px">📝 Note: ' + o.note + '</div>' : '') +
          '</div><div style="display:flex;gap:8px">' +
          '<button class="btn-cfm" onclick="cfmQR(\'' + o.id + '\')">✓ Approve</button>' +
          '<button class="btn-rej" onclick="rejQR(\'' + o.id + '\')">✕ Decline</button>' +
          '</div></div>';
      }).join('') + '</div>';
  }
  
  h += '<div style="font-size:13px;font-weight:700;color:var(--text2);margin-top:10px">Interactive Table QR Codes</div>' +
    '<div class="qr-grid" id="qr-grid-el"></div></div>';
    
  document.getElementById('pg-qr').innerHTML = h;
  
  setTimeout(function () {
    var grid = document.getElementById('qr-grid-el'); 
    if (!grid) return;
    
    TABLES.forEach(function (tbl) {
      // Direct absolute URL mapping dynamically
      var url = window.location.protocol + '//' + window.location.host + '/customer.html?table=' + encodeURIComponent(tbl);
      var card = document.createElement('div'); 
      card.className = 'qr-tc';
      var canvas = document.createElement('canvas');
      var cw = document.createElement('div'); 
      cw.className = 'qr-cv-wrap'; 
      cw.appendChild(canvas);
      
      var ut = document.createElement('div'); 
      ut.className = 'qr-url-txt'; 
      ut.textContent = url;
      
      var pb = document.createElement('button'); 
      pb.className = 'qr-prev-btn';
      pb.textContent = 'Preview Menu (Simulate Table)';
      pb.onclick = function () { openCPH(tbl); };
      
      card.innerHTML = '<div class="qr-tc-name">Table ' + tbl + '</div>';
      card.appendChild(cw); 
      card.appendChild(ut); 
      card.appendChild(pb);
      grid.appendChild(card);
      
      drawQR(canvas, url, 140);
    });
  }, 100);
}

// ── CUSTOM INLINE LOCAL QR ENGINE WITH STATIC BACKUP
function drawQR(canvas, text, sz) {
  canvas.width = sz; 
  canvas.height = sz;
  var ctx = canvas.getContext('2d');
  
  var img = new Image(); 
  img.crossOrigin = 'anonymous';
  img.onload = function () { 
    ctx.clearRect(0, 0, sz, sz); 
    ctx.drawImage(img, 0, 0, sz, sz); 
  };
  img.onerror = function () { 
    drawQRFallback(ctx, sz, text); 
  };
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=' + sz + 'x' + sz + '&data=' + encodeURIComponent(text) + '&bgcolor=ffffff&color=111111&margin=3';
  drawQRFallback(ctx, sz, text);
}

function drawQRFallback(ctx, sz, text) {
  ctx.fillStyle = '#fff'; 
  ctx.fillRect(0, 0, sz, sz);
  ctx.fillStyle = '#111';
  
  // Standard outer anchor patterns
  [[6, 6], [sz - 36, 6], [6, sz - 36]].forEach(function (p) {
    ctx.fillRect(p[0], p[1], 30, 30);
    ctx.fillStyle = '#fff'; ctx.fillRect(p[0] + 4, p[1] + 4, 22, 22);
    ctx.fillStyle = '#111'; ctx.fillRect(p[0] + 8, p[1] + 8, 14, 14);
  });
  
  var seed = 0; 
  for (var i = 0; i < text.length; i++) seed += text.charCodeAt(i);
  for (var r = 0; r < 8; r++) {
    for (var c = 0; c < 8; c++) {
      if ((seed ^ (r * 11 + c * 7)) % 2 === 0) {
        ctx.fillRect(44 + c * 5, 44 + r * 5, 4, 4);
      }
    }
  }
  
  var lbl = text.split('table=')[1] || 'QR';
  ctx.font = 'bold 11px sans-serif'; 
  ctx.textAlign = 'center';
  ctx.fillText('Table ' + decodeURIComponent(lbl), sz / 2, sz - 18);
  ctx.font = '8px sans-serif'; 
  ctx.fillStyle = '#666';
  ctx.fillText('Scan to Self-Order', sz / 2, sz - 5);
}

function cfmQR(id) {
  fetch('/api/pending/' + id + '/confirm', { method: 'POST' })
    .catch(() => toast('API approval failed', true));
}

function cfmAll() {
  var pend = pendingDB.filter(function (o) { return o.status === 'pending'; });
  if (!pend.length) return;
  
  Promise.all(pend.map(o => fetch('/api/pending/' + o.id + '/confirm', { method: 'POST' })))
    .then(() => toast('All pending table orders confirmed!'))
    .catch(() => toast('Error bulk confirming', true));
}

function rejQR(id) {
  if (!confirm('Decline pending self-order ' + id + '?')) return;
  fetch('/api/pending/' + id + '/reject', { method: 'POST' })
    .catch(() => toast('API reject failed', true));
}

// ── CUSTOMER PHONE PREVIEW VIEW (FOR STAFF SIMULATIONS)
var cCart = [], cCat = 'All', cTbl = '', cNote = '', cSent = false;

function openCPH(tbl) { 
  cTbl = tbl; 
  cCart = []; 
  cCat = 'All'; 
  cNote = ''; 
  cSent = false; 
  document.getElementById('qr-ov').style.display = 'flex'; 
  renderCPH(); 
}

function closeCPH() { 
  document.getElementById('qr-ov').style.display = 'none'; 
}

function cGQ(id) { 
  return (cCart.find(function (x) { return x.id === id; }) || { qty: 0 }).qty; 
}

function cpSub() { 
  return cCart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); 
}

function cpVat() { 
  return Math.round(cpSub() * (CFG.vat / 100)); 
}

function cpGrand() { return cpSub() + cpVat(); }
function cpCnt() { return cCart.reduce(function (s, i) { return s + i.qty; }, 0); }

function cAdd(id) {
  var m = menuItems.find(function (x) { return x.id === id; }); 
  if (!m || m.available === false) return;
  var ex = cCart.find(function (x) { return x.id === id; });
  if (ex) ex.qty++; else cCart.push({ id: m.id, name: m.name, en: m.en, emoji: m.emoji, photo: m.photo || '', price: Number(m.price), qty: 1 });
  renderCPH();
}

function cChg(id, d) {
  var i = cCart.find(function (x) { return x.id === id; }); 
  if (!i) return; 
  i.qty += d;
  if (i.qty <= 0) cCart = cCart.filter(function (x) { return x.id !== id; }); 
  renderCPH();
}

function cSend() {
  if (!cCart.length) return;
  var rec = {
    id: 'QR-' + String(pendingDB.length + 1).padStart(4, '0'), 
    table: cTbl,
    items: cCart.map(function (i) { return Object.assign({}, i); }), 
    note: cNote,
    subtotal: cpSub(), 
    vat: cpVat(), 
    total: cpGrand(), 
    method: null, 
    status: 'pending', 
    time: new Date().toISOString()
  };

  fetch('/api/pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rec)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      cSent = true; 
      renderCPH();
    }
  })
  .catch(() => toast('API Error placing self-order', true));
}

function renderCPH() {
  var ph = document.getElementById('qr-ph'); 
  if (!ph) return;
  var avail = menuItems.filter(function (m) { return m.available !== false; });
  var cats = ['All'].concat(Array.from(new Set(avail.map(function (m) { return m.cat; }))));
  var fl = avail.filter(function (m) { return cCat === 'All' || m.cat === cCat; });
  var cnt = cpCnt(), tot = cpGrand();
  
  if (cSent) {
    ph.innerHTML = '<button class="cph-close" onclick="closeCPH()">✕</button>' +
      '<div class="cph-sent"><div style="font-size:56px;margin-bottom:12px">✅</div>' +
      '<div style="font-size:20px;font-weight:700;color:#111;margin-bottom:8px">Order Sent!</div>' +
      '<div style="font-size:13px;color:#666;line-height:1.7">Your request has been sent to staff.<br>Preparing shortly. Thank you!</div>' +
      '<button onclick="cSent=false;cCart=[];renderCPH()" style="margin-top:20px;padding:10px 24px;background:#ff3b30;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">Order More</button>' +
      '<button onclick="closeCPH()" style="margin-top:8px;padding:10px 24px;background:#e5e5ea;color:#333;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">Close</button></div>';
    return;
  }
  
  var h = '<button class="cph-close" onclick="closeCPH()">✕</button>' +
    '<div class="cph-hero"><div class="cph-logo">🌶 Min Gu Chan</div><div class="cph-sub">Table ' + cTbl + ' · Customer Mobile Menu</div></div>' +
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

// ── SETTINGS MANAGEMENT
function rCFG() {
  // Dynamically request server to provide intranet configuration IP on render
  var localIP = window.location.hostname;
  var tableUrlExample = window.location.protocol + '//' + window.location.host + '/customer.html?table=T1';
  
  document.getElementById('pg-cfg').innerHTML =
    '<div class="cfg-wrap"><div class="cfg-card">' +
    '<div class="cfg-title">⚙ Shop Configurations</div>' +
    
    '<label class="cfg-lbl">Shop Title</label><input class="cfg-input" id="cn" value="' + CFG.shopName + '">' +
    '<label class="cfg-lbl">Street Address</label><input class="cfg-input" id="ca" value="' + CFG.shopAddr + '">' +
    '<label class="cfg-lbl">Contact Phone</label><input class="cfg-input" id="cp" value="' + CFG.shopPhone + '">' +
    '<label class="cfg-lbl">Tax Registration ID</label><input class="cfg-input" id="ct" value="' + CFG.shopTax + '">' +
    '<label class="cfg-lbl">Service VAT (%)</label><input class="cfg-input" id="cv" type="number" value="' + CFG.vat + '" min="0" max="30">' +
    
    '<button class="cfg-btn" onclick="saveCfg()">💾 Save Settings</button>' +
    
    '<div class="cfg-hint">' +
    '<strong>💡 Production Intranet IP Setup:</strong><br>' +
    '• Customers scan QR codes and ordering requests are synced over your restaurant Wi-Fi network.<br>' +
    '• Customer Entry URL: <a href="' + tableUrlExample + '" target="_blank" style="color:var(--red2)">' + tableUrlExample + '</a><br>' +
    '• Central Wi-Fi Server IP Address: <strong>' + localIP + '</strong>' +
    '</div>' +
    '<div style="margin-top:16px;color:var(--text3);font-size:13px">' +
    '• Last automated backup: <strong>' + (backupInfo.lastBackup || 'Not available yet') + '</strong>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
    '<button onclick="exportCSV()" class="ico-btn" style="flex:1;justify-content:center">⬇ Export CSV</button>' +
    '<button onclick="requestBackup()" class="ico-btn" style="flex:1;justify-content:center;background:var(--amber);color:#000">🗄 Backup Now</button>' +
    '<button onclick="requestPrune()" class="ico-btn" style="flex:1;justify-content:center;border-color:var(--blue);color:var(--blue)">🧹 Prune Backups</button>' +
    '<button onclick="clearData()" class="ico-btn" style="flex:1;justify-content:center;border-color:var(--red);color:var(--red2)">🗑 Clear Ledger</button>' +
    '<button onclick="resetMenu()" class="ico-btn" style="flex:1;justify-content:center">↺ Reset Menu</button>' +
    '</div></div></div>';
}

function saveCfg() {
  var newConfig = {
    shopName: document.getElementById('cn').value,
    shopAddr: document.getElementById('ca').value,
    shopPhone: document.getElementById('cp').value,
    shopTax: document.getElementById('ct').value,
    vat: Number(document.getElementById('cv').value) || 7
  };

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newConfig)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      CFG = data.config;
      toast('Settings saved successfully!');
    }
  })
  .catch(() => toast('API Error saving configurations', true));
}

function requestBackup() {
  fetch('/api/backup/run', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        backupInfo.lastBackup = data.backup.timestamp;
        toast('Backup completed: ' + data.backup.backupFolder);
        if (curPage === 'cfg') rCFG();
      } else {
        toast('Backup failed', true);
      }
    })
    .catch(() => toast('Backup request failed', true));
}

function requestPrune() {
  if (!confirm('Prune old backups and keep the most recent backups?')) return;
  fetch('/api/backup/prune', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data && data.success) {
        toast('Prune completed, removed: ' + (data.removed && data.removed.length ? data.removed.join(', ') : 'none'));
        if (curPage === 'cfg') rCFG();
      } else {
        toast('Prune failed', true);
      }
    })
    .catch(() => toast('Prune request failed', true));
}

function clearData() {
  if (!confirm('Warning: Clear all transaction logs and pending tickets permanently? This cannot be undone.')) return;
  fetch('/api/sales/clear', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        salesDB = [];
        pendingDB = [];
        updatePendingBadge();
        toast('Audits wiped', true);
        if (curPage === 'cfg') rCFG();
      }
    })
    .catch(() => toast('API Clear Data Error', true));
}

function resetMenu() {
  if (!confirm('Restore Thai default sample menu items? This will override updates.')) return;
  fetch('/api/menu/reset', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        menuItems = data.menuItems;
        selMI = null; 
        editMI = {}; 
        toast('Default menu loaded'); 
        if (curPage === 'menu') rMenu();
      }
    })
    .catch(() => toast('API Reset Menu Error', true));
}

// ── DYNAMIC CSV AUDIT REPORT EXPORTER
function exportCSV() {
  var rows = [['Order ID', 'Table', 'Items Breakdown', 'Subtotal (฿)', 'VAT (฿)', 'Total Paid (฿)', 'Method', 'Status', 'Timestamp', 'Staff / Customer Note']];
  salesDB.forEach(function (o) { 
    rows.push([
      o.id, 
      o.table, 
      o.items.map(function (i) { return i.en + 'x' + i.qty; }).join('|'), 
      o.subtotal, 
      o.vat, 
      o.total, 
      o.method || '', 
      o.status, 
      new Date(o.time).toLocaleString('th-TH'), 
      o.note || ''
    ]); 
  });
  
  var csv = rows.map(function (r) { 
    return r.map(function (c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(','); 
  }).join('\n');
  
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); 
  a.href = URL.createObjectURL(blob);
  a.download = 'khaodee-pos-ledger-' + new Date().toISOString().split('T')[0] + '.csv'; 
  a.click();
  toast('CSV Ledger exported!');
}

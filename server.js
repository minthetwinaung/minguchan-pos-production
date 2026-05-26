const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const multer = require('multer');

const db = require('./database-service');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve public static folder
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Multer Disk Storage Configuration for Menu Images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'dish-' + uniqueSuffix + ext);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max file size
});

// ── REST API ENDPOINTS ──

// Shop Config
app.get('/api/config', async (req, res) => {
  const config = await db.getConfig();
  res.json(config);
});

app.post('/api/config', async (req, res) => {
  const updated = await db.saveConfig(req.body);
  res.json({ success: true, config: updated });
});

// Menu Items
app.get('/api/menu', async (req, res) => {
  const menuItems = await db.getMenuItems();
  res.json(menuItems);
});

app.post('/api/menu', async (req, res) => {
  const item = req.body;
  if (!item.en || !item.price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  const saved = await db.saveMenuItem(item);
  res.json({ success: true, menuItem: saved });
});

app.delete('/api/menu/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const success = await db.deleteMenuItem(id);
  res.json({ success });
});

// Reset Menu to prototype default
app.post('/api/menu/reset', async (req, res) => {
  // Read default items from seed data (seeded database contains them)
  const defaultItems = [
    { id: 1, cat: 'Salads', emoji: '🥗', name: 'ยำวุ้นเส้น', en: 'Glass Noodle Salad', desc: 'Vermicelli, pork, lime', price: 89, spice: 2, tags: ['popular'] },
    { id: 2, cat: 'Salads', emoji: '🥗', name: 'ส้มตำไทย', en: 'Som Tam Thai', desc: 'Green papaya, peanuts', price: 79, spice: 3, tags: ['popular'] },
    { id: 3, cat: 'Salads', emoji: '🌿', name: 'ลาบหมู', en: 'Pork Laab', desc: 'Minced pork, mint, chilli', price: 95, spice: 3, tags: ['new'] },
    { id: 4, cat: 'Soups', emoji: '🍜', name: 'ต้มยำกุ้ง', en: 'Tom Yum Goong', desc: 'Prawns, lemongrass', price: 129, spice: 3, tags: ['popular'] },
    { id: 5, cat: 'Soups', emoji: '🥣', name: 'ต้มข่าไก่', en: 'Tom Kha Gai', desc: 'Coconut milk, chicken', price: 115, spice: 1, tags: [] },
    { id: 6, cat: 'Soups', emoji: '🍲', name: 'แกงเขียวหวาน', en: 'Green Curry', desc: 'Bamboo shoots, basil', price: 119, spice: 2, tags: ['popular'] },
    { id: 7, cat: 'Stir Fry', emoji: '🥘', name: 'ผัดกะเพราหมู', en: 'Pad Kra Pao Pork', desc: 'Holy basil, pork, egg', price: 99, spice: 3, tags: ['popular'] },
    { id: 8, cat: 'Stir Fry', emoji: '🫕', name: 'ผัดซีอิ๊ว', en: 'Pad See Ew', desc: 'Flat noodles, broccoli', price: 89, spice: 1, tags: [] },
    { id: 9, cat: 'Stir Fry', emoji: '🍳', name: 'ข้าวผัดกุ้ง', en: 'Prawn Fried Rice', desc: 'Jasmine rice, prawn', price: 109, spice: 1, tags: ['new'] },
    { id: 10, cat: 'Rice', emoji: '🍚', name: 'ข้าวมันไก่', en: 'Khao Man Gai', desc: 'Poached chicken, ginger rice', price: 79, spice: 0, tags: ['popular'] },
    { id: 11, cat: 'Rice', emoji: '🍛', name: 'ข้าวหมูแดง', en: 'Red Pork Rice', desc: 'Roast pork, gravy', price: 85, spice: 0, tags: [] },
    { id: 12, cat: 'Rice', emoji: '🫙', name: 'ข้าวหน้าเป็ด', en: 'Duck on Rice', desc: 'Five-spice duck, egg', price: 119, spice: 0, tags: ['new'] },
    { id: 13, cat: 'Noodles', emoji: '🍝', name: 'ผัดไทยกุ้ง', en: 'Pad Thai Prawn', desc: 'Rice noodles, peanuts', price: 109, spice: 1, tags: ['popular'] },
    { id: 14, cat: 'Noodles', emoji: '🍜', name: 'บะหมี่หมูแดง', en: 'Roast Pork Noodle', desc: 'Egg noodles, bok choy', price: 95, spice: 0, tags: [] },
    { id: 15, cat: 'Drinks', emoji: '🧃', name: 'น้ำมะพร้าว', en: 'Fresh Coconut', desc: 'Young coconut, chilled', price: 55, spice: 0, tags: [] },
    { id: 16, cat: 'Drinks', emoji: '🧋', name: 'ชาไทยเย็น', en: 'Thai Iced Tea', desc: 'Condensed milk, ice', price: 45, spice: 0, tags: ['popular'] },
    { id: 17, cat: 'Drinks', emoji: '🥤', name: 'น้ำส้มคั้น', en: 'Fresh Orange Juice', desc: 'Freshly squeezed', price: 65, spice: 0, tags: [] },
    { id: 18, cat: 'Desserts', emoji: '🍮', name: 'ข้าวเหนียวมะม่วง', en: 'Mango Sticky Rice', desc: 'Ripe mango, coconut cream', price: 95, spice: 0, tags: ['popular'] },
    { id: 19, cat: 'Desserts', emoji: '🧁', name: 'ทับทิมกรอบ', en: 'Water Chestnut Rubies', desc: 'Coconut milk, pandan jelly', price: 65, spice: 0, tags: ['new'] }
  ];
  const resetItems = await db.resetMenuItems(defaultItems);
  res.json({ success: true, menuItems: resetItems });
});

// Image Upload Endpoint
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }
  const relativePath = `/uploads/${req.file.filename}`;
  res.json({ success: true, photoUrl: relativePath });
});

const backupDir = path.join(__dirname, 'data', 'backups');
// How many recent backups to keep (can override with env BACKUP_KEEP)
const BACKUP_KEEP = parseInt(process.env.BACKUP_KEEP, 10) || 7;

async function ensureBackupDir() {
  if (!fs.existsSync(backupDir)) {
    await fs.promises.mkdir(backupDir, { recursive: true });
  }
}

async function runDbBackup() {
  await ensureBackupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, 'backup-' + stamp);
  await fs.promises.mkdir(backupPath, { recursive: true });

  const files = ['config.db', 'menu.db', 'sales.db', 'pending.db'];
  await Promise.all(files.map(async (file) => {
    const src = path.join(__dirname, 'data', file);
    const dest = path.join(backupPath, file);
    if (fs.existsSync(src)) {
      await fs.promises.copyFile(src, dest);
    }
  }));

  const result = {
    backupFolder: path.basename(backupPath),
    timestamp: stamp,
    filesCopied: files.filter(file => fs.existsSync(path.join(backupPath, file)))
  };

  // After creating a backup, prune old backups to keep disk usage bounded
  try {
    const pruned = await pruneOldBackups();
    if (pruned && pruned.length) console.log('Pruned old backups:', pruned.join(', '));
  } catch (err) {
    console.error('Prune old backups failed:', err);
  }

  return result;
}

async function getBackupStatus() {
  await ensureBackupDir();
  const items = await fs.promises.readdir(backupDir, { withFileTypes: true });
  const backups = items.filter(i => i.isDirectory() && i.name.startsWith('backup-'))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, BACKUP_KEEP)
    .map(i => ({ name: i.name, timestamp: i.name.replace('backup-', '') }));

  return {
    lastBackup: backups.length > 0 ? backups[0].timestamp : null,
    recentBackups: backups
  };
}

async function pruneOldBackups() {
  await ensureBackupDir();
  const items = await fs.promises.readdir(backupDir, { withFileTypes: true });
  const backups = items.filter(i => i.isDirectory() && i.name.startsWith('backup-'))
    .sort((a, b) => b.name.localeCompare(a.name))
    .map(i => i.name);

  if (backups.length <= BACKUP_KEEP) return [];

  const toRemove = backups.slice(BACKUP_KEEP);
  await Promise.all(toRemove.map(async (name) => {
    const p = path.join(backupDir, name);
    // fs.promises.rm supports recursive removal
    try {
      await fs.promises.rm(p, { recursive: true, force: true });
    } catch (err) {
      // Fallback to rmdir for older Node versions
      try { await fs.promises.rmdir(p, { recursive: true }); } catch (e) { /* ignore */ }
    }
  }));

  return toRemove;
}

function startBackupScheduler() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  const delay = next.getTime() - now.getTime();
  setTimeout(async function backupTimer() {
    try {
      const result = await runDbBackup();
      console.log('Automated backup completed:', result.backupFolder);
    } catch (err) {
      console.error('Automated backup failed:', err);
    }
    setInterval(async () => {
      try {
        const result = await runDbBackup();
        console.log('Automated backup completed:', result.backupFolder);
      } catch (err) {
        console.error('Automated backup failed:', err);
      }
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

// Sales Records
app.get('/api/sales', async (req, res) => {
  const sales = await db.getSales();
  res.json(sales);
});

app.get('/api/sales/:id', async (req, res) => {
  const sale = await db.getSaleById(req.params.id);
  if (!sale) {
    return res.status(404).json({ error: 'Sales record not found' });
  }
  res.json(sale);
});

app.get('/api/reports/summary', async (req, res) => {
  const from = req.query.from || '1970-01-01T00:00:00.000Z';
  const to = req.query.to || new Date().toISOString();
  const summary = await db.getSalesSummary(from, to);
  res.json(summary);
});

app.get('/api/reports/sales-by-table', async (req, res) => {
  const from = req.query.from || '1970-01-01T00:00:00.000Z';
  const to = req.query.to || new Date().toISOString();
  const report = await db.getSalesByTable(from, to);
  res.json({ from, to, tables: report });
});

app.get('/api/reports/daily', async (req, res) => {
  const from = req.query.from || '1970-01-01T00:00:00.000Z';
  const to = req.query.to || new Date().toISOString();
  const report = await db.getDailySales(from, to);
  res.json({ from, to, daily: report });
});

app.post('/api/sales', async (req, res) => {
  const saleOrder = req.body;
  if (!saleOrder.items || !saleOrder.total) {
    return res.status(400).json({ error: 'Incomplete sales payload' });
  }
  const saved = await db.addSale(saleOrder);
  io.emit('sale-created', saved);
  res.json({ success: true, sale: saved });
});

app.post('/api/sales/:id/void', async (req, res) => {
  const id = req.params.id;
  const updated = await db.updateSaleStatus(id, 'void');
  if (updated) {
    io.emit('sale-updated', updated);
    res.json({ success: true, sale: updated });
  } else {
    res.status(404).json({ error: 'Sales record not found' });
  }
});

// Settle a sent sale as paid by Cash or Card
app.post('/api/sales/:id/pay', async (req, res) => {
  const id = req.params.id;
  const { method } = req.body || {};
  const updated = await db.updateSalePayment(id, method);
  if (updated) {
    io.emit('sale-updated', updated);
    res.json({ success: true, sale: updated });
  } else {
    res.status(404).json({ error: 'Sales record not found' });
  }
});

// Refund a sale (set status to 'refunded' with metadata)
app.post('/api/sales/:id/refund', async (req, res) => {
  const id = req.params.id;
  const { reason, by } = req.body || {};
  const meta = {
    refundReason: reason || null,
    refundedBy: by || null,
    refundedAt: new Date().toISOString()
  };
  const updated = await db.updateSaleRefund(id, meta);
  if (updated) {
    io.emit('sale-updated', updated);
    res.json({ success: true, sale: updated });
  } else {
    res.status(404).json({ error: 'Sales record not found' });
  }
});

app.post('/api/sales/clear', async (req, res) => {
  await db.clearSales();
  io.emit('db-cleared');
  res.json({ success: true });
});

app.get('/api/backup/status', async (req, res) => {
  try {
    const status = await getBackupStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Unable to read backup status' });
  }
});

app.post('/api/backup/run', async (req, res) => {
  try {
    const result = await runDbBackup();
    res.json({ success: true, backup: result });
  } catch (err) {
    console.error('Backup failed', err);
    res.status(500).json({ error: 'Backup failed' });
  }
});

app.post('/api/backup/prune', async (req, res) => {
  try {
    const removed = await pruneOldBackups();
    res.json({ success: true, removed });
  } catch (err) {
    console.error('Prune failed', err);
    res.status(500).json({ error: 'Prune failed' });
  }
});

// Customer Pending Orders
app.get('/api/pending', async (req, res) => {
  const pending = await db.getPending();
  res.json(pending);
});

// Customer Places self-order
app.post('/api/pending', async (req, res) => {
  const order = req.body;
  if (!order.table || !order.items) {
    return res.status(400).json({ error: 'Invalid pending order payload' });
  }
  order.status = 'pending';
  order.time = new Date().toISOString();
  
  const saved = await db.addPending(order);
  
  // Real-time broadcast to all cashier dashboards
  io.emit('new-pending-order', saved);
  
  res.json({ success: true, order: saved });
});

// Cashier Confirms Order
app.post('/api/pending/:id/confirm', async (req, res) => {
  const id = req.params.id;
  const pendingList = await db.getPending();
  const order = pendingList.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'Pending order not found' });
  }
  
  // Create sales entry (confirmed status maps to 'sent' state in sales)
  const salesEntry = Object.assign({}, order, {
    status: 'sent',
    method: null,
    time: new Date().toISOString()
  });
  
  await db.addSale(salesEntry);
  await db.removePending(id);
  
  // Broadcast updates
  io.emit('pending-confirmed', { id, order: salesEntry });
  res.json({ success: true, sale: salesEntry });
});

// Cashier Rejects Order
app.post('/api/pending/:id/reject', async (req, res) => {
  const id = req.params.id;
  const success = await db.removePending(id);
  if (success) {
    io.emit('pending-rejected', { id });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Pending order not found' });
  }
});

// ── WEBSOCKET ENGINE ──
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── GET LOCAL NETWORK IP ADDR ──
function getLocalNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Boot up server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  const localIP = getLocalNetworkIP();
  console.log(`=============================================================`);
  console.log(`   🌶  MIN GU CHAN POS SERVER RUNNING SUCCESSFULLY  🌶   `);
  console.log(`=============================================================`);
  console.log(`  > Local Intranet URL (Staff/Cashier): http://localhost:${PORT}`);
  console.log(`  > Mobile Self-Ordering (Customers):   http://${localIP}:${PORT}`);
  console.log(`=============================================================`);

  try {
    const result = await runDbBackup();
    console.log('Initial backup completed:', result.backupFolder);
  } catch (err) {
    console.error('Initial backup failed:', err);
  }
  startBackupScheduler();
});

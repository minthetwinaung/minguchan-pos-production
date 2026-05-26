const fs = require('fs');
const path = require('path');
const Datastore = require('nedb-promises');

class DatabaseService {
  constructor() {
    this.dataPath = path.join(__dirname, 'data');
    this.seedFilePath = path.join(__dirname, 'database.json');
    this.configDb = Datastore.create({ filename: path.join(this.dataPath, 'config.db'), autoload: true });
    this.menuDb = Datastore.create({ filename: path.join(this.dataPath, 'menu.db'), autoload: true });
    this.salesDb = Datastore.create({ filename: path.join(this.dataPath, 'sales.db'), autoload: true });
    this.pendingDb = Datastore.create({ filename: path.join(this.dataPath, 'pending.db'), autoload: true });
    this.ready = this.init();
  }

  async ensureDataPath() {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  async init() {
    await this.ensureDataPath();
    await Promise.all([
      this.configDb.loadDatabase(),
      this.menuDb.loadDatabase(),
      this.salesDb.loadDatabase(),
      this.pendingDb.loadDatabase()
    ]);

    const configCount = await this.configDb.count({});
    const menuCount = await this.menuDb.count({});
    const salesCount = await this.salesDb.count({});
    const pendingCount = await this.pendingDb.count({});

    if (configCount === 0 && menuCount === 0 && salesCount === 0 && pendingCount === 0) {
      await this.migrateSeedData();
    }
  }

  async migrateSeedData() {
    if (!fs.existsSync(this.seedFilePath)) {
      return;
    }

    const raw = fs.readFileSync(this.seedFilePath, 'utf8');
    const seed = JSON.parse(raw);

    if (seed.config) {
      await Promise.all(Object.entries(seed.config).map(([key, value]) =>
        this.configDb.update({ key }, { key, value: JSON.stringify(value) }, { upsert: true })
      ));
    }

    if (Array.isArray(seed.menuItems)) {
      await Promise.all(seed.menuItems.map(item => this.menuDb.update({ id: item.id }, this.prepareMenuRow(item), { upsert: true })));
    }

    if (Array.isArray(seed.sales)) {
      await Promise.all(seed.sales.map(order => this.salesDb.update({ id: order.id }, this.prepareOrderRow(order), { upsert: true })));
    }

    if (Array.isArray(seed.pending)) {
      await Promise.all(seed.pending.map(order => this.pendingDb.update({ id: order.id }, this.prepareOrderRow(order), { upsert: true })));
    }
  }

  prepareMenuRow(item) {
    return {
      id: item.id,
      cat: item.cat || '',
      emoji: item.emoji || '',
      name: item.name || '',
      en: item.en || '',
      desc: item.desc || '',
      price: Number(item.price) || 0,
      spice: Number(item.spice) || 0,
      tags: JSON.stringify(Array.isArray(item.tags) ? item.tags : []),
      photo: item.photo || '',
      available: item.available ? 1 : 0,
    };
  }

  prepareOrderRow(order) {
    return {
      id: order.id,
      table_name: order.table || order.table_name || '',
      note: order.note || '',
      subtotal: Number(order.subtotal) || 0,
      vat: Number(order.vat) || 0,
      total: Number(order.total) || 0,
      method: order.method || null,
      status: order.status || 'sent',
      time: order.time || new Date().toISOString(),
      items: JSON.stringify(order.items || []),
      // refund metadata (optional)
      refundReason: order.refundReason || null,
      refundedBy: order.refundedBy || null,
      refundedAt: order.refundedAt || null,
    };
  }

  parseMenuRow(row) {
    return {
      id: row.id,
      cat: row.cat,
      emoji: row.emoji,
      name: row.name,
      en: row.en,
      desc: row.desc,
      price: row.price,
      spice: row.spice,
      tags: row.tags ? JSON.parse(row.tags) : [],
      photo: row.photo,
      available: Boolean(row.available),
    };
  }

  parseOrderRow(row) {
    return {
      id: row.id,
      table: row.table_name,
      note: row.note,
      subtotal: row.subtotal,
      vat: row.vat,
      total: row.total,
      method: row.method,
      status: row.status,
      time: row.time,
      items: row.items ? JSON.parse(row.items) : [],
      refundReason: row.refundReason || null,
      refundedBy: row.refundedBy || null,
      refundedAt: row.refundedAt || null,
    };
  }

  async getConfig() {
    await this.ready;
    const rows = await this.configDb.find({});
    return rows.reduce((acc, row) => {
      acc[row.key] = JSON.parse(row.value);
      return acc;
    }, {});
  }

  async saveConfig(newConfig) {
    await this.ready;
    await Promise.all(Object.entries(newConfig).map(([key, value]) =>
      this.configDb.update({ key }, { key, value: JSON.stringify(value) }, { upsert: true })
    ));
    return this.getConfig();
  }

  async getMenuItems() {
    await this.ready;
    const rows = await this.menuDb.find({}).sort({ cat: 1, id: 1 });
    return rows.map(row => this.parseMenuRow(row));
  }

  async saveMenuItem(item) {
    await this.ready;
    const menuItem = Object.assign({}, item);
    if (!menuItem.id) {
      menuItem.id = await this.getNextMenuId();
    }
    const row = this.prepareMenuRow(menuItem);
    await this.menuDb.update({ id: menuItem.id }, row, { upsert: true });
    return this.parseMenuRow(await this.menuDb.findOne({ id: menuItem.id }));
  }

  async deleteMenuItem(id) {
    await this.ready;
    const result = await this.menuDb.remove({ id }, {});
    return result > 0;
  }

  async resetMenuItems(defaultMenu) {
    await this.ready;
    await this.menuDb.remove({}, { multi: true });
    if (Array.isArray(defaultMenu)) {
      await Promise.all(defaultMenu.map(item => this.menuDb.insert(this.prepareMenuRow(item))));
    }
    return this.getMenuItems();
  }

  async getSales() {
    await this.ready;
    const rows = await this.salesDb.find({}).sort({ time: -1 });
    return rows.map(row => this.parseOrderRow(row));
  }

  async getSaleById(id) {
    await this.ready;
    const row = await this.salesDb.findOne({ id });
    return row ? this.parseOrderRow(row) : null;
  }

  async addSale(saleOrder) {
    await this.ready;
    const order = Object.assign({}, saleOrder);
    if (!order.id) {
      order.id = await this.getNextOrderId();
    }
    order.time = order.time || new Date().toISOString();
    const row = this.prepareOrderRow(order);
    await this.salesDb.update({ id: order.id }, row, { upsert: true });
    return this.getSaleById(order.id);
  }

  async updateSaleStatus(id, status) {
    await this.ready;
    const result = await this.salesDb.update({ id }, { $set: { status } });
    return result > 0 ? this.getSaleById(id) : null;
  }

  async updateSalePayment(id, method) {
    await this.ready;
    const result = await this.salesDb.update({ id }, { $set: { status: 'paid', method: method || 'Cash' } });
    return result > 0 ? this.getSaleById(id) : null;
  }

  async updateSaleRefund(id, refundMeta) {
    await this.ready;
    const setObj = Object.assign({ status: 'refunded' }, refundMeta || {});
    const result = await this.salesDb.update({ id }, { $set: setObj });
    return result > 0 ? this.getSaleById(id) : null;
  }

  async getSalesSummary(from, to) {
    await this.ready;
    const rows = await this.salesDb.find({});
    const filtered = rows.filter(row => row.time >= from && row.time <= to);
    const summary = filtered.reduce((acc, row) => {
      acc.totalOrders += 1;
      acc.subtotal += Number(row.subtotal) || 0;
      acc.vat += Number(row.vat) || 0;
      acc.revenue += Number(row.total) || 0;
      acc.byStatus[row.status] = acc.byStatus[row.status] || { count: 0, revenue: 0 };
      acc.byStatus[row.status].count += 1;
      acc.byStatus[row.status].revenue += Number(row.total) || 0;
      return acc;
    }, { totalOrders: 0, subtotal: 0, vat: 0, revenue: 0, byStatus: {} });

    return {
      from,
      to,
      totalOrders: summary.totalOrders,
      subtotal: summary.subtotal,
      vat: summary.vat,
      revenue: summary.revenue,
      byStatus: Object.entries(summary.byStatus).map(([status, stats]) => ({ status, ...stats }))
    };
  }

  async getSalesByTable(from, to) {
    await this.ready;
    const rows = await this.salesDb.find({});
    const filtered = rows.filter(row => row.time >= from && row.time <= to);
    const grouped = filtered.reduce((acc, row) => {
      const table = row.table_name || row.table || 'Unknown';
      if (!acc[table]) {
        acc[table] = { table, totalOrders: 0, subtotal: 0, vat: 0, revenue: 0, averageOrder: 0 };
      }
      acc[table].totalOrders += 1;
      acc[table].subtotal += Number(row.subtotal) || 0;
      acc[table].vat += Number(row.vat) || 0;
      acc[table].revenue += Number(row.total) || 0;
      return acc;
    }, {});

    return Object.values(grouped).map(item => ({
      ...item,
      averageOrder: item.totalOrders > 0 ? Number((item.revenue / item.totalOrders).toFixed(2)) : 0
    }));
  }

  async getDailySales(from, to) {
    await this.ready;
    const rows = await this.salesDb.find({});
    const filtered = rows.filter(row => row.time >= from && row.time <= to);
    const grouped = filtered.reduce((acc, row) => {
      const date = new Date(row.time).toISOString().slice(0, 10);
      if (!acc[date]) {
        acc[date] = { date, totalOrders: 0, subtotal: 0, vat: 0, revenue: 0 };
      }
      acc[date].totalOrders += 1;
      acc[date].subtotal += Number(row.subtotal) || 0;
      acc[date].vat += Number(row.vat) || 0;
      acc[date].revenue += Number(row.total) || 0;
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }

  async clearSales() {
    await this.ready;
    await this.salesDb.remove({}, { multi: true });
    await this.pendingDb.remove({}, { multi: true });
    return true;
  }

  async getPending() {
    await this.ready;
    const rows = await this.pendingDb.find({}).sort({ time: -1 });
    return rows.map(row => this.parseOrderRow(row));
  }

  async addPending(pendingOrder) {
    await this.ready;
    const order = Object.assign({}, pendingOrder);
    if (!order.id) {
      order.id = `PND-${Date.now()}`;
    }
    // Ensure pending orders default to 'pending' (was 'sent' which hides approve controls)
    order.status = order.status || 'pending';
    order.time = order.time || new Date().toISOString();
    const row = this.prepareOrderRow(order);
    await this.pendingDb.update({ id: order.id }, row, { upsert: true });
    return this.getPending().then(list => list.find(item => item.id === order.id));
  }

  async removePending(id) {
    await this.ready;
    const result = await this.pendingDb.remove({ id }, {});
    return result > 0;
  }

  async updatePendingStatus(id, status) {
    await this.ready;
    const result = await this.pendingDb.update({ id }, { $set: { status } });
    return result > 0 ? this.getPending().then(list => list.find(item => item.id === id)) : null;
  }

  async getNextMenuId() {
    await this.ready;
    const rows = await this.menuDb.find({}).sort({ id: -1 }).limit(1);
    const maxId = rows[0] ? Number(rows[0].id) : 0;
    return maxId + 1;
  }

  async getNextOrderId() {
    await this.ready;
    const rows = await this.salesDb.find({});
    const maxId = rows.reduce((max, row) => {
      const match = String(row.id).match(/^ORD-(\d+)$/);
      const num = match ? Number(match[1]) : 0;
      return Math.max(max, num);
    }, 0);
    return `ORD-${String(maxId + 1).padStart(4, '0')}`;
  }
}

module.exports = new DatabaseService();

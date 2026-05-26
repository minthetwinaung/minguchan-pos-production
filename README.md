# Min Gu Chan POS

A local restaurant point-of-sale system built with Node.js, Express, Socket.IO, and NeDB. Supports cashier sales, kitchen staging, QR-based customer self-ordering, live local network sync, and automated local backups.

## Technology Stack

- Node.js
- Express
- Socket.IO
- NeDB (via `nedb-promises`)
- Multer for image uploads
- CORS for API access
- Plain HTML/CSS/JavaScript frontend

## Features

- Local POS order creation
- `Send to Kitchen` workflow with `sent` status
- Automated backup to `data/backups/`
- Live local network real-time sync for pending orders and sales updates
- Customer QR self-order interface
- Sales listing with filters for `all`, `paid`, `sent`, and `void`
- Manual backup trigger from settings
- Configuration editor for shop details and VAT
- Export sales data as CSV

## Installation

### Requirements

- Node.js 18+ or compatible version
- npm

### Setup

1. Open a terminal in the project folder:
   ```powershell
   cd c:\Users\70131259\.gemini\antigravity-ide\scratch\minguchan-pos-production
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Start the server:
   ```powershell
   npm start
   ```
4. Open the app in a browser:
   - Cashier / staff view: `http://localhost:3000`
   - Customer self-ordering: use the local IP printed in the terminal, for example `http://192.168.1.100:3000`

## Project Structure

- `server.js` - Main backend server and Socket.IO setup
- `database-service.js` - NeDB persistence layer and backup scheduling
- `database.json` - Seed data for initial menu and sales
- `data/` - Local DB files and generated backups
- `public/` - Frontend static files
- `public/js/app.js` - Client-side application logic
- `public/index.html` - Main POS interface
- `public/customer.html` - Customer QR ordering interface

## Usage Guide

### Starting the App

1. Run `npm start`
2. The server console shows the local address and local network address.
3. Open the POS UI in a browser on the same machine.

### Cashier / Staff Flow

1. Choose table and menu items.
2. Use `Send to Kitchen` to create a `sent` order.
3. Confirm or reject pending customer orders under the QR interface.
4. Use `Cash` or `Card` to settle paid orders.
5. Select sales entries to view details, reprint, void, or refund.

### Pending Kitchen and Refunds

- `sent` orders appear under the `Pending Kitchen` filter.
- Select `Refund` for a `sent` kitchen order to cancel it and mark it void.
- `paid` orders can be voided separately.

### Customer QR Ordering

- Customers scan the local network table QR link.
- Orders appear in the pending list in real time.
- Staff can approve or reject pending orders.

### Backups

- Automatic backup runs daily at `02:00` local server time.
- Backups are stored in `data/backups/backup-YYYY-MM-DDTHH-MM-SS-xxx/`
- Manual backup can be triggered from the Settings page by clicking `Backup Now`.

## API Endpoints

### Configuration
- `GET /api/config` - Get shop configuration
- `POST /api/config` - Update shop configuration

### Menu
- `GET /api/menu` - Get all menu items
- `POST /api/menu` - Add new menu item
- `DELETE /api/menu/:id` - Delete menu item
- `POST /api/menu/reset` - Reset menu to default prototype

### Sales
- `GET /api/sales` - Get all sales records
- `GET /api/sales/:id` - Get specific sale by ID
- `POST /api/sales` - Create new sale
- `POST /api/sales/:id/pay` - Mark a sale as paid using `Cash` or `Card`
- `POST /api/sales/:id/void` - Void a sale
- `POST /api/sales/:id/refund` - Refund a sale with metadata
- `POST /api/sales/clear` - Clear all sales and pending orders (admin)

### Reports
- `GET /api/reports/summary?from=ISO_DATE&to=ISO_DATE` - Sales summary by date range
- `GET /api/reports/sales-by-table?from=ISO_DATE&to=ISO_DATE` - Sales grouped by table
- `GET /api/reports/daily?from=ISO_DATE&to=ISO_DATE` - Daily sales breakdown

### Pending Orders
- `GET /api/pending` - Get all pending orders
- `POST /api/pending` - Create a new customer self-order
- `POST /api/pending/:id/confirm` - Confirm pending order and convert it to a kitchen sale
- `POST /api/pending/:id/reject` - Reject pending order

### Backups
- `GET /api/backup/status` - Get backup status and recent backups
- `POST /api/backup/run` - Trigger manual backup immediately
- `POST /api/backup/prune` - Manually prune old backups

### Image Upload
- `POST /api/upload` - Upload menu item image

## Backup & Pruning System

The application includes an automated backup system with intelligent pruning:

### How Backups Work
1. **Automatic Schedule**: First backup runs on server startup, then daily at 02:00 AM server time
2. **Backup Location**: `data/backups/backup-YYYY-MM-DDTHH-MM-SS-mmmZ/`
3. **Files Backed Up**:
   - `config.db` - Shop configuration
   - `menu.db` - Menu items and images
   - `sales.db` - All completed sales
   - `pending.db` - Pending customer orders

### Backup Pruning
1. **BACKUP_KEEP Setting**: Keep the 7 most recent backups (default)
   - Override with `BACKUP_KEEP` environment variable
   - Example: `set BACKUP_KEEP=14` to keep 14 backups

2. **Prune Logic**:
   - After each backup, old backups are automatically pruned
   - Sorts backups by timestamp (newest first)
   - Removes backups older than the BACKUP_KEEP threshold
   - Uses recursive directory removal with fallback for compatibility

3. **Manual Pruning**:
   - Trigger via UI: Settings → Backup Now (includes automatic prune)
   - API: `POST /api/backup/prune`

### Storage Impact
- Each backup folder contains ~4 database files (small, typically <50KB each)
- 7 backups = ~280KB to 1.4MB depending on data size
- Automatic pruning prevents disk space from growing unbounded

## Environment Variables

Configure the app behavior with these environment variables:

```powershell
# Number of backups to retain (default: 7)
$env:BACKUP_KEEP = "14"

# Server port (default: 3000)
$env:PORT = "3000"

# Node environment (development/production)
$env:NODE_ENV = "production"
```

Example: Start with custom backup retention
```powershell
$env:BACKUP_KEEP = "21"
npm start
```

## Database Schema

### config.db
Stores shop-wide settings as key-value pairs:
```json
{
  "key": "shopName",
  "value": "{\"en\":\"Min Gu Chan\",\"mm\":\"မင်းဂူ\"}"
}
```

### menu.db
Stores menu items with multilingual support:
```json
{
  "id": 1,
  "cat": "Salads",
  "emoji": "🥗",
  "name": "ယံတံ",
  "en": "Som Tam",
  "desc": "Green papaya salad",
  "price": 89,
  "spice": 2,
  "tags": "[\"popular\"]",
  "photo": "url_or_path",
  "available": 1
}
```

### sales.db
Completed sales records:
```json
{
  "id": "unique_timestamp",
  "table_name": "Table 5",
  "note": "Extra sauce",
  "subtotal": 500,
  "vat": 50,
  "total": 550,
  "method": "cash",
  "status": "paid",
  "time": "2026-05-25T10:30:00Z",
  "items": "[{\"id\":1,\"qty\":2}]",
  "refundReason": null,
  "refundedBy": null,
  "refundedAt": null
}
```

### pending.db
Customer self-orders awaiting confirmation:
```json
{
  "id": "unique_id",
  "table_name": "Table 3",
  "note": "No onions",
  "subtotal": 300,
  "vat": 30,
  "total": 330,
  "method": null,
  "status": "pending",
  "time": "2026-05-25T10:45:00Z",
  "items": "[{\"id\":2,\"qty\":1}]"
}
```

## Recommended Production Setup

For a single-store local installation:

- Use a dedicated POS machine or mini PC with at least 2GB RAM
- Keep the app running with a startup script or Windows service
- Use a UPS to protect against power loss
- Regularly copy `data/backups/` to a safe location (external HDD, USB, network share)
- Set `BACKUP_KEEP` to 14-21 for longer retention (2-3 weeks)
- Monitor disk space monthly; backups consume minimal space

## Notes and Limitations

- This app uses a local file-based database (`NeDB`).
- It is designed for single-store, same-machine or same-local-network use.
- It is not a cloud or multi-location POS solution.
- For heavy traffic or multi-terminal production, migrate to a real database like PostgreSQL or MongoDB.
- Backup files are stored locally; for offsite protection, manually copy to external storage or cloud.

## Troubleshooting

### API Connection Failed

- Ensure `npm start` is running.
- Check the terminal for the server address.
- Confirm the browser is on the same machine or network.
- Verify firewall allows access to port 3000.
- On mobile: use the machine's local IP (not `localhost`).

### Backup Not Working

- Verify the `data/backups/` folder exists and is writable.
- Confirm the server has write permission to the `data/` directory.
- Check the server console for backup error logs.
- Ensure disk space is available (backups fail if drive is full).
- Manually trigger: Settings → Backup Now, and check for errors.

### Database Files Corrupted

- If `.db` files in `data/` are corrupted, restore from backups:
  ```powershell
  Copy-Item "data\backups\backup-YYYY-MM-DDTHH-MM-SS-xxx\*" -Destination "data\" -Force
  ```
- If no backups exist, you may lose recent data. Restart with `npm start` to reinitialize.

### Slow Performance or Freezing

- Check if `data/backups/` has many folders (hundreds); manually prune old ones.
- Monitor CPU/RAM: kill other processes consuming resources.
- Consider migrating to a larger machine or cloud database if POS is heavily used.

### Network Sync Not Working

- Confirm all devices (terminals, phones) are on the same Wi-Fi network.
- Disable Windows Firewall or allow `node.exe` through the firewall.
- Restart the server and client browsers.

### Customer QR Orders Not Appearing

- Ensure customer phone is on the same Wi-Fi as the POS server.
- Test: Visit `http://<server-ip>:3000` on the phone (not `localhost`).
- Check browser console (F12) for JavaScript errors.
- Confirm Socket.IO is connected (look for green indicator in UI).

## Useful Commands

- Start server: `npm start`
- Run development server: `npm run dev`
- Test server syntax: `node -c server.js`
- Test client syntax: `node -c public/js/app.js`

## Contact

For further customization or enhancements, update the appropriate files in `server.js`, `database-service.js`, and `public/js/app.js`.

## Go-live Checklist (Quick)

Follow these steps before opening the POS for production use:

1. Install and start the app:

```powershell
cd C:\Users\70131259\.gemini\antigravity-ide\scratch\minguchan-pos-production
npm install
npm start
```

2. Verify APIs respond (run on the POS machine):

```powershell
Invoke-RestMethod http://localhost:3000/api/config | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/api/menu | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/api/sales | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/api/pending | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/api/backup/status | ConvertTo-Json -Depth 3
```

3. Do a manual end-to-end test in the UI:
   - Create a test order → Send to Kitchen → mark paid (Cash) → verify appears in `Sales` and `Reports`.
   - From a phone on the same Wi‑Fi, open the Mobile Self-Ordering URL and place a QR order; confirm it appears in `Pending`.

4. Run a manual backup (Settings → Backup Now) and confirm `data/backups/` contains a new folder.

5. Configure auto-start and backup retention:
   - Add a Windows Scheduled Task or service to run `npm start` on boot.
   - Keep an offsite copy of `data/backups/` (external HDD or cloud).

If all checks pass, the POS is ready for single-location production use.

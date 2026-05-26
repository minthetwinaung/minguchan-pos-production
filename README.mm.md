# Min Gu Chan POS — အသုံးပြုနည်း (မြန်မာ)

Min Gu Chan POS သည် Node.js, Express, Socket.IO နှင့် NeDB ကိုအသုံးပြု၍ တည်ဆောက်ထားသည့် တိုက်ရိုက်ဆိုင်အသုံး POS စနစ်တစ်ခုဖြစ်သည်။
ဤ README တွင် 설치, အသုံးပြုနည်း၊ backup နှင့် local network sync များကို မြန်မာဘာသာဖြင့် ရှင်းလင်းဖော်ပြထားပါသည်။

**နည်းပညာများ**
- Node.js
- Express
- Socket.IO
- NeDB (nedb-promises)
- Multer (image upload)
- CORS
- Frontend: HTML/CSS/JavaScript

**အင်္ဂါရပ်များ**
- စာရင်းတွင် Order ထည့်ခြင်း (Send to Kitchen)
- Pending Kitchen list (QR မှာတင်သွင်းထားသော order များ)
- Live sync: တစ်ဆိုင်လုံး terminal များအကြား order sync
- Automated local backup (data/backups/)
- Settings မှ manual backup ဖွင့်နိုင်ခြင်း
- Sales CSV export, report view

## စက်ထည့်သွင်းနည်း

### လိုအပ်ချက်များ
- Node.js (v18+ အကြံပြု)
- npm

### Install လုပ်ခြင်း
1. project folder ကို terminal ဖြင့် ဖွင့်ပါ

```powershell
cd C:\Users\70131259\.gemini\antigravity-ide\scratch\minguchan-pos-production
```

2. dependency များ install လုပ်ပါ

```powershell
npm install
```

3. server ကို run ပါ

```powershell
npm start
```

4. Browser မှာ ဖွင့်ကြည့်ပါ
- Cashier / staff view: `http://localhost:3000`
- Mobile customer ordering: သင့် machine ရဲ့ local IP ကို terminal မှာဖော်ပြမည် (ဥပမာ `http://192.168.1.100:3000`)

## အသုံးပြုနည်း

### Cashier / Staff
1. Table ရွေးပြီး menu item များထည့်ပါ
2. `Send to Kitchen` ကိုနှိပ်ပြီး order ကို kitchen သို့ ပို့ပါ (status = `sent`)
3. Customers က QR link မှတဆင့် မိမိ order များ တင်နိုင်သည်။ Pending list တွင် ပြပါမည်။
4. Pending order ကို Approve (Confirm) သို့မဟုတ် Reject လုပ်နိုင်သည်
5. ရှေ့ဆိုင်မှာ `Cash` သို့မဟုတ် `Card` ဖြင့် ပေးချေမှု ပြုပါ
6. Sales list ထဲမှ order တစ်ခုရွေး၍ `Reprint`, `Void`, `Refund` လုပ်နိုင်သည်

### Pending Kitchen နှင့် Refund
- `sent` အခြေနှင့်ရှိသည့် order များသည် `Pending Kitchen` filter တွင် တွေ့ရမည်။
- `sent` order တစ်ခုကို Cancel လုပ်လိုလျှင် Sales အသေးစိတ် panel မှာ `Refund` ခလုတ်ကိုနှိပ်ပါ။
- `paid` အခြေနှင့်ရှိသည့် order များကို `Void` လုပ်နိုင်သည် (အမြင့်အကင်းလမ်းကြောင်းကိုမူတည်၍)

### Customer (QR) Ordering
- Customers များသည် table-specific URL (QR) ကို scan ပြီး အွန်လိုင်းမှာအော်ဒါပို့နိုင်သည်။
- Pending order များကို cashier dashboard တွင် real-time ကြည့်နိုင်၊ Approve/Reject လုပ်နိုင်သည်။

### Backup
- Automated backup သည် default အနေဖြင့် နေ့စဥ် `02:00` local server time တွင် run ဖြစ်မည်။
- Backup file များသည် `data/backups/backup-YYYY-MM-DDTHH-MM-SS-xxx/` တို့အောက်တွင် သိမ်းဆည်းမည်
- Settings ဘက်မှ manual backup နှိပ်၍လည်း backup ရပါမည်

## API Endpoints (ကွန်ပျူတာတွေ အကြား အချက်အလက်ရယူခြင်း)

### Configuration (အဆင့်သတ်မှတ်ချက်များ)
- `GET /api/config` - ဆိုင်အချက်အလက် ရယူခြင်း
- `POST /api/config` - အချက်အလက် အဆင့်သတ်မှတ်ခြင်း

### Menu (စားသောက်ကုန်များ)
- `GET /api/menu` - menu အားလုံး ရယူခြင်း
- `POST /api/menu` - menu အသစ် ထည့်သွင်းခြင်း
- `DELETE /api/menu/:id` - menu ဖျက်ခြင်း
- `POST /api/menu/reset` - menu အဟောင်းသို့ ပြန်ရွေးခြင်း

### Sales (အရောင်းများ)
- `GET /api/sales` - အရောင်းများ အားလုံး ရယူခြင်း
- `POST /api/sales` - အရောင်းအသစ် ထည့်သွင်းခြင်း
- `POST /api/sales/:id/pay` - `Cash` သို့ `Card` ဖြင့် အရောင်း ပေးချေခြင်း
- `POST /api/sales/:id/void` - အရောင်း ဖျက်ရန်
- `POST /api/sales/:id/refund` - အရောင်း ပြန်ပေးရန်
- `POST /api/sales/clear` - အရောင်းနှင့် pending order များအားလုံး ဖျက်ရန် (admin)

### Reports (အစီရင်ခံစာများ)
- `GET /api/reports/summary` - အရောင်း အချုပ်ချုပ်
- `GET /api/reports/sales-by-table` - စားပွဲအလိုက် အရောင်းအချက်အလက်
- `GET /api/reports/daily` - နေ့စဉ် အရောင်းများ

### Pending Orders (စောင့်ဆိုင်းမှုများ)
- `GET /api/pending` - pending order အားလုံး ရယူခြင်း
- `POST /api/pending` - မိမိ order ကို pending အနေနှင့် တင်သွင်းခြင်း
- `POST /api/pending/:id/confirm` - pending order ကို အတည်ပြုခြင်း
- `POST /api/pending/:id/reject` - pending order ကို ပယ်ချခြင်း

### Backups (backup)
- `GET /api/backup/status` - backup အခြေအနေ ကြည့်ခြင်း
- `POST /api/backup/run` - backup ကိုသူလက်သတ် ချိန်ဆတ်လိုက်ရန်
- `POST /api/backup/prune` - အဟောင်း backup များ ဖျက်ရန်

### Image Upload
- `POST /api/upload` - Menu အတွက် image upload ဖိုင်တင်ရန်

## Backup & Pruning စနစ်

### Backup မည်သို့ အလုပ်လုပ်သည်နည်း?
1. **အလိုအလျောက် အချိန်ဆုံးမှု**: server စတင်ချိန်တွင် ပထမဆုံး backup run ဖြင့် စတင်ပြီး ထို့နောက် နေ့စဉ် မနက် ၂း00 AM တွင် run ဖြစ်သည်
2. **သိမ်းဆည်းရာ**: `data/backups/backup-YYYY-MM-DDTHH-MM-SS-mmmZ/`
3. **သိမ်းဆည်းသည့် Files**:
   - `config.db` - ဆိုင်အချက်အလက်
   - `menu.db` - စားသောက်ကုန်များ
   - `sales.db` - အရောင်းများ အားလုံး
   - `pending.db` - စောင့်ဆိုင်းမှု order များ

### Prune ပြုလုပ်ခြင်း (အဟောင်း backup ဖျက်ခြင်း)
1. **BACKUP_KEEP**: အဟောင်းဆုံး ၇ ခု (default) ကိုလည်း ထိန်းသိမ်းသည်
   - `set BACKUP_KEEP=14` - ၁၄ ခု ထိန်းသိမ်းရန်

2. **Prune လုပ်ပုံ**:
   - Backup အားလုံး ရယူပြီး အသစ်တွေကို အရှေ့မှာ စဥ်သင်းသည်
   - BACKUP_KEEP အကျယ်အဝန်း ကျန်သည့် အဟောင်း backup များ ဖျက်သည်
   - recursive ဖျက်ခြင်း ခိုင်လုံရန် fallback ဖြင့် ကောင်းက�်သည်

3. **အခြိုက်အချင်း Prune**:
   - UI မှ: Settings → Backup Now
   - API: `POST /api/backup/prune`

## Environment Variables (ကွန်ပျူတာသတ်မှတ်ချက်များ)

```powershell
# Backup ထိန်းသိမ်းရန် အရေအတွက် (default: 7)
$env:BACKUP_KEEP = "14"

# Server port (default: 3000)
$env:PORT = "3000"

# Node environment
$env:NODE_ENV = "production"
```

ဥပမာ:
```powershell
$env:BACKUP_KEEP = "21"
npm start
```

## Configuration
- Shop name, address, phone, VAT % များကို Settings မှပြင်နိုင်သည်
- `data/` ဖိုလ်ဒါကို regular backup ပြုလုပ်ပါ (USB, external HDD, network share)

## အမှားများကို ကြည့်ရှုရန် (Troubleshooting)

### API Connection မလည်ပါက
- `npm start` ပြီးဆုံးပါသည်ကို စစ်ပါ
- Terminal မှ server address ကြည့်ပါ
- Firewall အရင်းအမြစ်စစ်ပါ

### Backup မလုပ်ပါက
- `data/backups/` folder write permission ရှိမရှိ စစ်ပါ
- Terminal error log ကြည့်ပါ
- Disk space ရှိမရှိ စစ်ပါ

### Database Files ပျက်နေပါက
Backup ထံမှ restore ပြုလုပ်ပါ:
```powershell
Copy-Item "data\backups\backup-YYYY-MM-DDTHH-MM-SS-xxx\*" -Destination "data\" -Force
```

### Network Sync မလည်ပါက
- တစ်ခွင်ခွင့် Wi-Fi တွင် ရှိနေသည်ကို ည'ယ်သည်ကို စစ်ပါ
- Windows Firewall မှ `node.exe` အတည်ပြုပါ
- Server နှင့် browser restart ပြုပါ

### Customer QR Orders မပြပါက
- Customer phone တစ်ခွင်ခွင့် Wi-Fi တွင်ရှိသည်ကို ည'ယ်သည်ကို စစ်ပါ
- `http://<server-ip>:3000` (localhost မဟုတ်) မှ စမ်းသပ်ပါ
- Browser console (F12) error ကြည့်ပါ

## Production အကြံပြုချက်
- Single-store/local use အတွက် အဆင်ပြေသည်
- အချမှတ် power cutoff မဖြစ်စေရန် UPS အသုံးပြုပါ
- app ကို system startup တွင် auto-run ပြုလုပ်ရန် service/shortcut ထည့်ပါ
- BACKUP_KEEP ကို ၁၄-၂၁ သတ်မှတ်ပါ (၂-၃ လ သိမ်းဆည်းခြင်း)
- အလုံလုံ month မှာ disk space ကြည့်ပါ (backup တွေ အလွန် နည်းသည်)
- များသော terminal များ / multiple-location support လိုလျှင် Managed DB (Postgres, MongoDB) သို့ပြောင်းပါ

## အသုံးချရန် commands

```powershell
npm install
npm start
# (syntax check)
node -c server.js
node -c public/js/app.js
```

---

ကျေးဇူးတင်ပါတယ် — အကူအညီ တစ်ခုခုလိုပါက ပြောပါ။

## Go-live စစ်ဆေး Checklist (တိုချုံး)

POS ကို production အဖြစ် အသုံးပြုရန်မတိုင်မီ အောက်ပါအဆင့်များ သေချာစစ်ပါ။

1) Installation နှင့် server အစပြုခြင်း

```powershell
cd C:\Users\70131259\.gemini\antigravity-ide\scratch\minguchan-pos-production
npm install
npm start
```

2) API တုံ့ပြန်မှု စစ်ဆေးခြင်း (POS machine တွင်)

```powershell
Invoke-RestMethod http://localhost:3000/api/config | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/api/menu | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/api/sales | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/api/pending | ConvertTo-Json -Depth 3
Invoke-RestMethod http://localhost:3000/api/backup/status | ConvertTo-Json -Depth 3
```

3) UI မှတဆင့် end-to-end စမ်းသပ်မှု
	- Test order တစ်ခု ဖန်တီးပါ → Send to Kitchen → Cash ဖြင့်ပေးချေပါ → Sales နှင့် Reports တွင် ထင်မြင်/ထည့်သွင်းနေကြောင်း စစ်ပါ။
	- အိမ်လက်ဖုန်းတစ်လုံးမှ Mobile Self-Ordering link ကိုဖွင့်ပြီး QR order တင်၍ Pending တွင်ထင်မြင်နေသည်ကို စစ်ပါ။

4) Backup စစ်ဆေးခြင်း
	- Settings မှ Backup Now ကိုနှိပ်ပြီး `data/backups/` ထဲတွင် folder အသစ်တစ်ခုဖန်တီးပါက အောင်မြင်သည်။

5) Auto-start & Power
	- Windows Scheduled Task သို့မဟုတ် service အဖြစ် `npm start` ကို autostart အဖြစ် သတ်မှတ်ပါ။
	- UPS အသုံးပြု၍ power outage ကနေ data corruption ကာကွယ်ပါ။

အထက်ပါ စစ်ဆေးချက် အားလုံး အောင်မြင်ပါက single-location production အဖြစ် အသုံးပြုနိုင်ပါသည်။
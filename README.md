# 🏦 UPI Payment Flow - ₹1 Payment Demo

A simple UPI payment demo: **Pay ₹1 to jewelat50@oksbi** with SMS confirmation and screenshot upload fallback.

**Fixed Payment:** ₹1 to `jewelat50@oksbi`

## ✨ What It Does

### For Users:
1. Fill name, email, phone
2. Click "Pay ₹1 via UPI"
3. Complete payment in UPI app
4. Either:
   - **Paste SMS** → Auto-verify instantly ✅
   - **Wait 90 seconds** → Upload screenshot → Manual review within 24h

### Features:
- **Mobile-First**: Desktop shows QR code, mobile opens UPI app
- **90-Second Timer**: Screenshot upload appears after 1.5 minutes
- **SMS Auto-Verify**: Paste payment SMS for instant confirmation
- **Screenshot Backup**: Upload proof if SMS doesn't come
- **Cloud Storage**: MongoDB for data + Cloudinary for images

## 📁 Files

```
Backend/
├── index.js          # Express server
├── db.js             # MongoDB connection
├── models/
│   └── Submission.js # Payment data schema
├── smsService.js     # Twilio SMS
└── .env             # Configuration

Frontend/src/
├── App.tsx          # Main UI
└── ...
```

## 🚀 Quick Start

### Terminal 1 - Backend:
```powershell
cd "C:\My\UPI Payment Flow\Backend"
npm install
npm run dev
```
Should show: `✓ Backend listening on http://localhost:4000`

### Terminal 2 - Frontend:
```powershell
cd "C:\My\UPI Payment Flow\Frontend"
npm install
npm run dev
```
Should show: `➜ Local: http://localhost:5173/`

### Open Browser:
Visit: **http://localhost:5173**

## 💳 How It Works

### Desktop:
1. Enter details → QR code generates → **Timer starts (90s)**
2. Scan QR on mobile → Pay ₹1
3. Option A: Paste SMS → Auto-confirm ✅
4. Option B: Wait 90s → Upload screenshot

### Mobile:
1. Enter details → Click "Pay ₹1" → **Timer starts (90s)**
2. UPI app opens → Complete payment
3. Return to browser → Paste SMS OR wait for upload option

### SMS Verification (Fastest ⚡):
- After payment, copy bank SMS
- Paste in blue SMS box
- Click "Verify via SMS"
- **Instant auto-confirmation!**

## 🧩 API Endpoints

```
POST /api/upi-link            # Create payment link
POST /api/submit-details      # Save user details
POST /api/upload-screenshot   # Upload image & save to DB
POST /api/sms-verify          # Auto-verify from SMS
POST /api/sms-forward         # Auto-confirm forwarded SMS
GET  /api/health              # Health + CORS diagnostics
GET  /api/test-db            # Test MongoDB connection
```

## ⚙️ Configuration (.env)

```env
# Server
PORT=4000
NODE_ENV=production

# MongoDB Atlas
MONGODB_URI=mongodb+srv://your_user:your_password@cluster0.xxx.mongodb.net/Anna

# Cloudinary (Image Storage)
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_SECRET_KEY=your_secret

# Twilio SMS (Optional)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number

# CORS (comma-separated, no trailing slashes)
CORS_ORIGIN=http://localhost:5173, https://upi-payment-system-kappa.vercel.app, https://upi-payment-system.vercel.app

# SMS Forwarder security (Optional)
FORWARDER_SECRET=replace-with-strong-secret
```

### Get Credentials:
- **MongoDB**: https://cloud.mongodb.com (free tier)
- **Cloudinary**: https://cloudinary.com (free tier)
- **Twilio**: https://twilio.com (optional, for SMS)

## 💾 Database

**MongoDB Atlas:**
- Database: `Payment`
- Collection: `submissions`

**Data Stored:**
- Transaction ID
- Name, Email, Phone
- Message (optional)
- Screenshot URL (Cloudinary)
- SMS content (if pasted)
- Status (pending_review/verified/confirmed)
- Timestamps

**Test Connection:**
```
http://localhost:4000/api/test-db
```
**Timer not starting:**
- Timer starts when QR generates (desktop) or Pay button clicked (mobile)

**CORS blocked:**
- Ensure `CORS_ORIGIN` includes your frontend origin(s) without trailing slashes. Use `/api/health` to verify.

## 🔒 Important Notes

1. **Fixed Payment**: Always ₹1 to jewelat50@oksbi (hardcoded)
2. **Desktop Blocked**: Payment only works on mobile (desktop shows QR)
3. **Timer**: 90 seconds before screenshot upload appears
4. **Collections**: Data saves to `submissions` NOT `Payment`
5. **SMS Optional**: Works with or without Twilio credentials
6. **Auto-Confirm**: Use `/api/sms-forward` with `x-forwarder-secret` for server-side SMS forwarding.

## 🛠 Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express
- **Database**: MongoDB Atlas
- **Storage**: Cloudinary (images)
- **SMS**: Twilio (optional)

## 📲 SMS-Forward Auto-Confirm (Implementation)

Automatic confirmation can be achieved by forwarding the bank SMS to your backend:

1) Configure backend env:
```
FORWARDER_SECRET=replace-with-strong-secret
```

2) Forwarder (Android app or SMS provider webhook) calls:
```
POST /api/sms-forward
Headers: { "Content-Type": "application/json", "x-forwarder-secret": "<secret>" }
Body: { "phone": "+919061336064", "smsContent": "Txn XXXX of Rs1.00 ... UPI Ref ABC123 ..." }
```

3) Backend behavior:
- Finds the latest transaction for the phone
- Parses UPI ref/amount/VPA, validates constraints
- Marks the order as `confirmed`


## 💡 Better than Deep Links: Stronger Options

- PSP Webhooks (Razorpay/Cashfree/PhonePe/Paytm for Business):
   - Create order/collect; receive webhooks on success; map to `transactionId` and update status.
   - Strongest and most reliable for production.

- Android SMS-Forwarder App:
   - On-device BroadcastReceiver forwards payment SMS to `/api/sms-forward` with `x-forwarder-secret`.
   - Near real-time auto-confirm; requires one-time user permission.

- Inbound SMS Provider (Twilio/MSG91/Sinch):
   - If bank SMS can be routed to your service number, configure provider webhook → `/api/sms-forward`.

- Email Receipt Parsing:
   - Parse payment receipt emails via inbox parser (SES/SendGrid inbound) and map to transactions.

- Batch Statement Reconciliation:
   - Periodically fetch PSP/bank statements and reconcile by time+amount+ref → update statuses.

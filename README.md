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
   - **Enter UTR manually** → Click confirm

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

## � API Endpoints

```
POST /api/upi-link            # Create payment link
POST /api/submit-details      # Save user details
POST /api/upload-screenshot   # Upload image & save to DB
POST /api/sms-verify          # Auto-verify from SMS
POST /api/sms-forward         # Auto-confirm forwarded SMS
GET  /api/test-db            # Test MongoDB connection
```

## ⚙️ Configuration (.env)

```env
# Server
PORT=4000

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
```

### Get Credentials:
- **MongoDB**: https://cloud.mongodb.com (free tier)
- **Cloudinary**: https://cloudinary.com (free tier)
- **Twilio**: https://twilio.com (optional, for SMS)

## 💾 Database

**MongoDB Atlas:**
- Database: `Anna`
- Collection: `submissions`

**Data Stored:**
- Transaction ID
- Name, Email, Phone
- UTR/Ref code
- Message (optional)
- Screenshot URL (Cloudinary)
- SMS content (if pasted)
- Status (pending_review/verified/confirmed)
- Timestamps

**Test Connection:**
```
http://localhost:4000/api/test-db
```

## 🐛 Troubleshooting

**Port already in use:**
```powershell
Get-Process | Where-Object {$_.Name -like "*node*"} | Stop-Process -Force
```

**No data in MongoDB:**
- Check you're viewing `submissions` collection (not "Payment")
- Visit: http://localhost:4000/api/test-db
- Check backend terminal for "✅ Saved to MongoDB with ID: ..."

**Frontend can't connect:**
- Backend must run on port 4000
- Frontend must run on port 5173

**Timer not starting:**
- Timer starts when QR generates (desktop) or Pay button clicked (mobile)

## � Important Notes

1. **Fixed Payment**: Always ₹1 to jewelat50@oksbi (hardcoded)
2. **Desktop Blocked**: Payment only works on mobile (desktop shows QR)
3. **Timer**: 90 seconds before screenshot upload appears
4. **Collections**: Data saves to `submissions` NOT `Payment`
5. **SMS Optional**: Works with or without Twilio credentials

## 🛠 Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express
- **Database**: MongoDB Atlas
- **Storage**: Cloudinary (images)
- **SMS**: Twilio (optional)

---

**Simple. Clean. Works. 🚀**

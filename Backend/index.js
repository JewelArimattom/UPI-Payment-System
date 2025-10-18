const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
require('dotenv').config(); // Load environment variables

const app = express();
const port = process.env.PORT || 4000;
const nodeEnv = process.env.NODE_ENV || 'development';
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_VERSION ||
  process.env.LAMBDA_TASK_ROOT
);

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', corsOrigin);
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Optional DB and uploads
const { connectToMongo } = require('./db');
let Submission = null;
connectToMongo().then((conn) => {
  if (conn) {
    Submission = require('./models/Submission');
  }
});

// Lazy connector in case cold start didn't connect or env was missing
async function ensureDb() {
  if (Submission) return Submission;
  const conn = await connectToMongo();
  if (conn) {
    Submission = require('./models/Submission');
    return Submission;
  }
  return null;
}
// Configure upload strategy based on environment
let uploadsDir = null;
let upload = null;

// Cloudinary config (optional)
if (process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_SECRET_KEY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_SECRET_KEY,
  });
  console.log('✓ Cloudinary configured');
  // In serverless or when Cloudinary is available, use memory storage
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
} else {
  console.log('Cloudinary not configured');
  if (isServerless) {
    // On Vercel (read-only FS), local disk is not available
    console.warn('⚠️ Running in serverless environment without Cloudinary. Local uploads are disabled.');
    upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  } else {
    // Local/dev: allow disk storage
    uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    app.use('/uploads', express.static(uploadsDir));
    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, uploadsDir);
      },
      filename: function (req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '.png');
        cb(null, `ss-${unique}${ext}`);
      },
    });
    upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
    console.log('✓ Local disk uploads enabled at /uploads');
  }
}

// In-memory store for demo (use DB in production)
const orders = {};

// Helper: Generate unique transaction ID
function generateTransactionId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `TXN-${timestamp}-${random}`.toUpperCase();
}

// Helper: Generate UPI reference with transaction ID
function buildUpiLink({ pa, pn, tn, am, cu = 'INR', tr }) {
  const params = { pa, pn, tn, am, cu };
  if (tr) params.tr = tr; // Transaction reference
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `upi://pay?${q}`;
}

const { sendPaymentConfirmationSms } = require('./smsService');

// Helper: Parse UPI details from SMS
function parseUpiFromSms(sms) {
  if (!sms) return {};
  const s = String(sms);
  const refMatch = s.match(/(?:Txn(?:\s+|:)|Ref(?:\s+|:)|UPI\s*Ref(?:\s+|:)|UTR(?:\s+|:))\s*([A-Za-z0-9\-]{6,30})/i);
  const amountMatch = s.match(/(?:INR|Rs\.?|Rs)\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  const vpaMatch = s.match(/([a-z0-9_.-]+@[a-z]+)\b/i);
  return {
    ref: refMatch ? refMatch[1] : null,
    amount: amountMatch ? Number(amountMatch[1]) : null,
    vpa: vpaMatch ? vpaMatch[1].toLowerCase() : null,
  };
}

// Helper: find latest order for a phone
function findLatestOrderByPhone(phone) {
  if (!phone) return null;
  const entries = Object.entries(orders)
    .filter(([, o]) => o.phone && String(o.phone).trim() === String(phone).trim())
    .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt));
  return entries.length ? { transactionId: entries[0][0], order: entries[0][1] } : null;
}

// POST /api/upi-link - Generate dynamic UPI deep link with unique transaction ID
app.post('/api/upi-link', (req, res) => {
  const { order: _clientOrder, phone } = req.body; // we accept phone for SMS confirmation

  // Generate unique transaction ID for this payment attempt
  const transactionId = generateTransactionId();

  // Store order with transaction tracking
  const fixedOrder = {
    id: 'Order123',
    amount: 1.0,
    merchantVPA: 'jewelat50@oksbi',
    merchantName: 'Jewel',
    note: 'Order123',
  };

  orders[transactionId] = {
    orderId: fixedOrder.id,
    amount: fixedOrder.amount,
    merchantVPA: fixedOrder.merchantVPA,
    merchantName: fixedOrder.merchantName,
    phone: phone || null,
    createdAt: new Date().toISOString(),
    status: 'initiated', // initiated, pending_verification, verified, confirmed
    upiRefNumber: null,
  };

  const link = buildUpiLink({
    pa: fixedOrder.merchantVPA,
    pn: fixedOrder.merchantName,
    tn: fixedOrder.note || `Order ${fixedOrder.id}`,
    am: Number(fixedOrder.amount).toFixed(2),
    cu: 'INR',
    tr: transactionId, // Include transaction reference in UPI link
  });

  res.json({
    upiLink: link,
    transactionId,
    status: orders[transactionId].status,
  });
});

// Save user details and optional UTR/message/SMS text
app.post('/api/submit-details', async (req, res) => {
  const { transactionId, name, email, phone, utr, message, smsContent } = req.body || {};
  console.log('📝 /api/submit-details called with:', { transactionId, name, email, phone, utr, message });
  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'name, email, phone are required' });
  }
  const payload = { transactionId: transactionId || null, name, email, phone, utr: utr || null, message: message || null, smsContent: smsContent || null, status: 'submitted' };
  try {
    const Model = await ensureDb();
    if (Model) {
      const doc = await Model.create(payload);
      console.log('✅ Saved to MongoDB with ID:', doc._id);
      return res.json({ ok: true, id: doc._id });
    }
    console.warn('⚠️ MongoDB not available, skipping save');
    return res.json({ ok: true });
  } catch (e) {
    console.error('❌ Error saving to MongoDB:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Upload screenshot fallback
app.post('/api/upload-screenshot', upload.single('screenshot'), async (req, res) => {
  try {
    const { transactionId, name, email, phone, utr, message } = req.body || {};
    console.log('📸 /api/upload-screenshot called with:', { transactionId, name, email, phone, utr });
    
    if (!name || !email || !phone) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ ok: false, error: 'Name, email, and phone are required' });
    }
    
    let screenshotUrl = null;
    if (req.file) {
      console.log('📁 File received:', req.file.originalname, req.file.size, 'bytes');
      const hasCloudinary = Boolean(process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_SECRET_KEY);
      if (hasCloudinary && req.file.buffer) {
        // Upload from memory buffer using upload_stream
        console.log('☁️ Uploading to Cloudinary (buffer)...');
        const uploaded = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({ folder: 'upi_screenshots' }, (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
          stream.end(req.file.buffer);
        });
        screenshotUrl = uploaded.secure_url;
        console.log('✅ Cloudinary upload successful:', screenshotUrl);
      } else if (!hasCloudinary && uploadsDir && req.file.path) {
        // Local/dev disk storage
        screenshotUrl = `/uploads/${req.file.filename}`;
      } else if (isServerless && !hasCloudinary) {
        console.error('❌ Cloudinary not configured and local disk not available on serverless.');
        return res.status(500).json({ ok: false, error: 'Cloudinary not configured. Enable Cloudinary env vars on Vercel to support uploads.' });
      } else if (req.file.path) {
        // Fallback: try path-based upload if available
        try {
          console.log('☁️ Uploading to Cloudinary (path fallback)...');
          const uploaded = await cloudinary.uploader.upload(req.file.path, { folder: 'upi_screenshots' });
          screenshotUrl = uploaded.secure_url;
          fs.unlink(req.file.path, () => {});
        } catch (e) {
          console.warn('⚠️ Upload fallback failed:', e.message);
          screenshotUrl = null;
        }
      }
    } else {
      console.error('❌ No file uploaded');
      return res.status(400).json({ ok: false, error: 'No screenshot file provided' });
    }

    const Model = await ensureDb();
    if (Model) {
      const doc = await Model.create({ 
        transactionId, 
        name, 
        email, 
        phone, 
        utr, 
        message, 
        screenshotPath: screenshotUrl,
        screenshotUrl: screenshotUrl, // Full Cloudinary URL
        status: 'pending_review' 
      });
      console.log('✅ Screenshot submission saved to MongoDB with ID:', doc._id);
      console.log('🖼️  Image URL:', screenshotUrl);
    } else {
      console.warn('⚠️ MongoDB not available, skipping save');
    }
    
    console.log('📤 Sending success response');
    return res.status(200).json({ ok: true, screenshot: screenshotUrl });
  } catch (e) {
    console.error('❌ Error in upload-screenshot:', e.message);
    console.error('❌ Stack:', e.stack);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/upload-upi-ref - User uploads their UPI transaction reference
app.post('/api/upload-upi-ref', (req, res) => {
  const { transactionId, upiRefNumber } = req.body;
  if (!transactionId || !upiRefNumber) {
    return res.status(400).json({ error: 'transactionId and upiRefNumber required' });
  }

  const order = orders[transactionId];
  if (!order) return res.status(404).json({ error: 'Transaction not found' });

  // Store the UPI reference provided by user
  order.upiRefNumber = upiRefNumber;
  order.status = 'pending_verification';
  order.verificationAttemptAt = new Date().toISOString();

  res.json({
    ok: true,
    transactionId,
    message: 'UPI reference received. Verifying payment...',
    status: order.status,
  });
});

// POST /api/verify-payment - Manual verification or webhook callback
app.post('/api/verify-payment', (req, res) => {
  const { transactionId, verificationCode } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId required' });
  }

  const order = orders[transactionId];
  if (!order) return res.status(404).json({ error: 'Transaction not found' });

  // Simple verification: check if reference is provided
  if (!order.upiRefNumber) {
    return res.status(400).json({ error: 'No UPI reference provided yet' });
  }

  // Enforce fixed order constraints for demo
  if (Number(order.amount) !== 1) {
    return res.status(400).json({ error: 'Invalid amount. Must be ₹1.00' });
  }
  if (order.merchantVPA !== 'jewelat50@oksbi') {
    return res.status(400).json({ error: 'Invalid merchant VPA' });
  }

  // Basic UPI reference sanity check (alphanumeric 8-20)
  if (!/^[A-Za-z0-9]{6,20}$/.test(order.upiRefNumber)) {
    // allow simple hyphenated or mixed formats too
    if (!/^[A-Za-z0-9\-]{6,30}$/.test(order.upiRefNumber)) {
      return res.status(400).json({ error: 'Invalid UPI reference format' });
    }
  }

  // For demo, mark as verified after checks
  order.status = 'verified';
  order.verifiedAt = new Date().toISOString();

  res.json({
    ok: true,
    transactionId,
    orderId: order.orderId,
    amount: order.amount,
    status: order.status,
    message: 'Payment verified successfully!',
  });
});

// POST /api/confirm-payment - Finalize payment (after verification)
app.post('/api/confirm-payment', async (req, res) => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId required' });
  }

  const order = orders[transactionId];
  if (!order) return res.status(404).json({ error: 'Transaction not found' });

  if (order.status !== 'verified') {
    return res.status(400).json({
      error: 'Payment must be verified before confirmation',
      currentStatus: order.status,
    });
  }

  // Re-assert constraints
  if (Number(order.amount) !== 1 || order.merchantVPA !== 'jewelat50@oksbi') {
    return res.status(400).json({ error: 'Order details mismatch' });
  }

  order.status = 'confirmed';
  order.confirmedAt = new Date().toISOString();

  // Optionally send confirmation SMS
  let sms = null;
  if (order.phone) {
    try {
      sms = await sendPaymentConfirmationSms(order.phone, {
        transactionId,
        orderId: order.orderId,
        amount: order.amount,
        merchantName: order.merchantName,
        upiRefNumber: order.upiRefNumber,
        status: order.status,
      });
      order.smsResult = sms;
    } catch (e) {
      order.smsResult = { success: false, error: e.message };
    }
  }

  res.json({
    ok: true,
    transactionId,
    orderId: order.orderId,
    status: order.status,
    message: 'Payment confirmed!',
    sms,
  });
});

// POST /api/send-confirmation-email - Send payment confirmation email

// GET /api/transaction/:transactionId - Get transaction status
app.get('/api/transaction/:transactionId', (req, res) => {
  const { transactionId } = req.params;
  const order = orders[transactionId];

  if (!order) return res.status(404).json({ error: 'Transaction not found' });

  res.json({
    transactionId,
    ...order,
  });
});

// POST /api/sms-verify - SMS-based verification (PWA/Mobile)
// This is a skeleton endpoint. Real implementation requires SMS reading permissions.
app.post('/api/sms-verify', async (req, res) => {
  const { transactionId, smsContent } = req.body;
  if (!transactionId || !smsContent) {
    return res.status(400).json({ error: 'transactionId and smsContent required' });
  }

  const order = orders[transactionId];
  if (!order) return res.status(404).json({ error: 'Transaction not found' });

  // Parse SMS for UPI transaction ID/reference
  // UPI SMS format typically: "Txn <ref> of Rs<amount> done. Bal: <bal>"
  const parsed = parseUpiFromSms(smsContent);
  if (!parsed.ref) {
    return res.status(400).json({ error: 'Could not extract UPI reference from SMS' });
  }

  // Record extracted ref
  order.upiRefNumber = parsed.ref;

  // Validate simple constraints
  if (Number(order.amount) !== 1) {
    return res.status(400).json({ error: 'Invalid amount. Must be ₹1.00' });
  }
  if (order.merchantVPA !== 'jewelat50@oksbi') {
    return res.status(400).json({ error: 'Invalid merchant VPA' });
  }
  // If amount present in SMS, ensure it matches 1.00
  if (parsed.amount != null && Number(parsed.amount) !== 1) {
    return res.status(400).json({ error: 'SMS amount does not match ₹1.00' });
  }

  // Mark verified
  order.status = 'verified';
  order.verifiedAt = new Date().toISOString();
  order.verificationMethod = 'sms';

  // Auto-confirm
  order.status = 'confirmed';
  order.confirmedAt = new Date().toISOString();

  // Optionally send confirmation SMS
  let sms = null;
  if (order.phone) {
    try {
      sms = await sendPaymentConfirmationSms(order.phone, {
        transactionId,
        orderId: order.orderId,
        amount: order.amount,
        merchantName: order.merchantName,
        upiRefNumber: order.upiRefNumber,
        status: order.status,
      });
      order.smsResult = sms;
    } catch (e) {
      order.smsResult = { success: false, error: e.message };
    }
  }

  return res.json({
    ok: true,
    transactionId,
    extracted: order.upiRefNumber,
    status: order.status,
    message: 'Payment verified and confirmed via SMS!',
    sms,
  });
});

// New: Auto-confirm from forwarded SMS based on phone number
// Use this if you can forward the bank SMS to your server/app.
app.post('/api/sms-forward', async (req, res) => {
  const { phone, smsContent } = req.body;
  if (!phone || !smsContent) {
    return res.status(400).json({ error: 'phone and smsContent required' });
  }

  const found = findLatestOrderByPhone(phone);
  if (!found) return res.status(404).json({ error: 'No recent transaction found for this phone' });

  const { transactionId } = found;
  const order = found.order;

  if (order.status === 'confirmed') {
    return res.json({ ok: true, transactionId, status: order.status, message: 'Already confirmed' });
  }

  const parsed = parseUpiFromSms(smsContent);
  if (!parsed.ref) {
    return res.status(400).json({ error: 'Could not extract UPI reference from SMS' });
  }

  // Store and validate
  order.upiRefNumber = parsed.ref;
  if (Number(order.amount) !== 1 || order.merchantVPA !== 'jewelat50@oksbi') {
    return res.status(400).json({ error: 'Order details mismatch' });
  }
  if (parsed.amount != null && Number(parsed.amount) !== 1) {
    return res.status(400).json({ error: 'SMS amount does not match ₹1.00' });
  }

  // Mark verified and confirm
  order.status = 'verified';
  order.verifiedAt = new Date().toISOString();
  order.verificationMethod = 'sms-forward';
  order.status = 'confirmed';
  order.confirmedAt = new Date().toISOString();

  let sms = null;
  if (order.phone) {
    try {
      sms = await sendPaymentConfirmationSms(order.phone, {
        transactionId,
        orderId: order.orderId,
        amount: order.amount,
        merchantName: order.merchantName,
        upiRefNumber: order.upiRefNumber,
        status: order.status,
      });
      order.smsResult = sms;
    } catch (e) {
      order.smsResult = { success: false, error: e.message };
    }
  }

  return res.json({ ok: true, transactionId, status: order.status, message: 'Auto-confirmed from SMS', sms });
});

// Test endpoint to verify MongoDB connection and collection
app.get('/api/test-db', async (req, res) => {
  try {
    const model = await ensureDb();
    if (!model) {
      return res.json({
        ok: false,
        mongodb: 'Not connected',
        haveUri: Boolean(process.env.MONGODB_URI || process.env.MONGO_URI),
        error: 'Submission model not loaded',
      });
    }
    const count = await model.countDocuments();
    const collectionName = model.collection.name;
    const dbName = model.db.name;
    return res.json({
      ok: true,
      mongodb: 'Connected',
      database: dbName,
      collection: collectionName,
      totalRecords: count,
      message: `Check MongoDB Atlas -> ${dbName} database -> ${collectionName} collection`,
    });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

app.listen(port, () => {
  console.log(`✓ Backend listening on http://localhost:${port}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/upi-link - Generate UPI link with transaction ID`);
  console.log(`  POST /api/upload-upi-ref - Upload UPI reference`);
  console.log(`  POST /api/verify-payment - Verify payment`);
  console.log(`  POST /api/confirm-payment - Confirm payment`);
  console.log(`  GET /api/transaction/:transactionId - Get transaction status`);
  console.log(`  POST /api/sms-verify - SMS-based verification (PWA skeleton)`);
  console.log(`  GET /api/test-db - Test MongoDB connection and show collection info\n`);
});

// Quietly handle favicon to avoid noisy 404/500 logs
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/favicon.png', (_req, res) => res.status(204).end());


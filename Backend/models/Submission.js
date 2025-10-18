const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema(
  {
    transactionId: { type: String },
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    utr: { type: String },
    message: { type: String },
    smsContent: { type: String },
    screenshotPath: { type: String },
    screenshotUrl: { type: String }, // Cloudinary full URL
    verified: { type: Boolean, default: false },
    confirmed: { type: Boolean, default: false },
    status: { type: String, default: 'submitted' }, // submitted|pending_review|verified|confirmed
  },
  { timestamps: true }
);

module.exports = mongoose.model('Submission', SubmissionSchema);

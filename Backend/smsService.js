/**
 * SMS Service - Twilio
 * Sends payment confirmation SMS messages.
 */

let twilioClient = null;

function initializeSmsService() {
  if (process.env.SMS_PROVIDER !== 'twilio') {
    console.log('SMS: provider not set to twilio; SMS disabled');
    return null;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    console.warn('SMS: Twilio credentials missing; SMS disabled');
    return null;
  }

  try {
    // Lazy require to avoid dependency when not used
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
    console.log('✓ SMS service initialized (Twilio)');
  } catch (e) {
    console.warn('SMS: Twilio SDK not installed; run `npm install twilio`');
    twilioClient = null;
  }
  return twilioClient;
}

function toE164(input) {
  if (!input) return null;
  let p = String(input).trim();
  // Basic normalization for Indian numbers
  if (p.startsWith('+')) return p;
  if (p.startsWith('91') && p.length >= 12) return `+${p}`;
  if (p.startsWith('0') && p.length >= 11) return `+91${p.substring(1)}`;
  if (/^[6-9][0-9]{9}$/.test(p)) return `+91${p}`; // 10-digit Indian mobile
  return p; // fallback
}

async function sendPaymentConfirmationSms(phone, data) {
  const enable = String(process.env.ENABLE_SMS_CONFIRMATION || 'false').toLowerCase() === 'true';
  if (!enable) {
    return { success: false, error: 'SMS confirmation disabled' };
  }

  if (!twilioClient) initializeSmsService();
  if (!twilioClient) {
    return { success: false, error: 'SMS service not available' };
  }

  const {
    transactionId, orderId, amount, merchantName, upiRefNumber, status,
  } = data;

  const to = toE164(phone);
  const from = process.env.TWILIO_FROM;
  const amt = Number(amount).toFixed(2);

  const body = `Payment successful: ₹${amt} to ${merchantName}. Order ${orderId}. Txn ${transactionId}${upiRefNumber ? ` Ref ${upiRefNumber}` : ''}. Thank you.`;

  try {
    const resp = await twilioClient.messages.create({ to, from, body });
    return { success: true, sid: resp.sid };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  initializeSmsService,
  sendPaymentConfirmationSms,
};

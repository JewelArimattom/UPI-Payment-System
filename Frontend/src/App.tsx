import React from "react";
import "./animations.css";
import { detectDevice } from "./deviceUtils";
import { generateQRDataUrl } from "./qrCodeUtils";

type Order = {
  id: string;
  item: string;
  amount: number; // INR
  merchantName: string;
  merchantVPA: string; // pa
  note?: string; // tn
};

const sampleOrder: Order = {
  id: "Order123",
  item: "Test Payment",
  amount: 1.0,
  merchantName: "Jewel",
  merchantVPA: "jewelat50@oksbi",
  note: "Order123",
};

const App: React.FC = () => {
  const order = sampleOrder;
  
  // Device and payment state
  const [deviceInfo] = React.useState(detectDevice());
  const [upiLink, setUpiLink] = React.useState<string | null>(null);
  const [transactionId, setTransactionId] = React.useState<string | null>(null);
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  
  // UI state
  const [loading, setLoading] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [verified, setVerified] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [smsContent, setSmsContent] = React.useState("");
  const [verifyingSms, setVerifyingSms] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [timer, setTimer] = React.useState(0); // seconds
  const [showScreenshotUpload, setShowScreenshotUpload] = React.useState(false);
  const [screenshotFile, setScreenshotFile] = React.useState<File | null>(null);
  
  // Transaction reference upload
  const [upiRefInput, setUpiRefInput] = React.useState("");
  const [, setUploadingRef] = React.useState(false);

  // Email collection removed for simplified SMS-first flow

  const isValidPhone = (p: string) => {
    const s = (p || '').trim();
    return s.startsWith('+91') && s.length >= 13
      || /^([6-9][0-9]{9})$/.test(s)
      || (s.startsWith('0') && s.length === 11);
  };

  const createUpiLink = async (): Promise<{ link: string; txnId: string } | null> => {
    if (!isValidPhone(phone)) {
      alert('Enter a valid mobile number to receive SMS confirmation (e.g., 9876543210 or +919876543210)');
      return null;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/upi-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, phone }),
      });
      const data = await resp.json();
      if (data.upiLink && data.transactionId) {
        setUpiLink(data.upiLink);
        setTransactionId(data.transactionId);

        if (deviceInfo.isDesktop) {
          const qr = await generateQRDataUrl(data.upiLink);
          setQrUrl(qr);
          // Start 90s timer when QR is generated for desktop
          startTimer();
        }

        return { link: data.upiLink, txnId: data.transactionId };
      }
      console.error('No upiLink in response', data);
      return null;
    } catch (err) {
      console.error('Error creating UPI link:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const startTimer = () => {
    setTimer(90); // 1.30 minutes = 90 seconds
    setShowScreenshotUpload(false);
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(interval);
          setShowScreenshotUpload(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  // On desktop, auto-generate UPI link and QR so the user can scan
  React.useEffect(() => {
    if (deviceInfo.isDesktop && !upiLink && !loading && isValidPhone(phone)) {
      createUpiLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceInfo.isDesktop, phone]);

  const uploadTransactionRef = async (upiRef: string): Promise<boolean> => {
    if (!transactionId || !upiRef.trim()) return false;
    
    setUploadingRef(true);
    try {
      const resp = await fetch('/api/upload-upi-ref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, upiRefNumber: upiRef }),
      });
      const data = await resp.json();
      if (data.ok) {
        setUpiRefInput("");
        return true;
      }
      console.error('Upload failed:', data);
      return false;
    } catch (err) {
      console.error('Error uploading ref:', err);
      return false;
    } finally {
      setUploadingRef(false);
    }
  };

  const handlePayClick = async () => {
    let link = upiLink;
    if (!link) {
      const result = await createUpiLink();
      link = result?.link || null;
    }

    if (link) {
      // Start 90s timer when Pay button is clicked (mobile)
      startTimer();
      // On mobile, navigating to the upi:// URL will open the UPI app.
      window.location.href = link;
    }
  };

  const verifyViaSms = async () => {
    if (!transactionId) {
      alert('Tap Pay first to start the payment.');
      return;
    }
    if (!smsContent.trim()) {
      alert('Paste the SMS content first');
      return;
    }
    setVerifyingSms(true);
    try {
      const resp = await fetch('/api/sms-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, smsContent }),
      });
      const data = await resp.json();
      if (data.ok) {
        setVerified(true);
        // Backend now auto-confirms on SMS verify
        if (data.status === 'confirmed') {
          setConfirmed(true);
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
        }
      } else {
        alert('Could not verify from SMS: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('SMS verify error', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setVerifyingSms(false);
    }
  };

  const submitDetails = async () => {
    try {
      if (!name || !email || !phone) return; // skip if incomplete
      const resp = await fetch('/api/submit-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, name, email, phone, utr: upiRefInput, message: note, smsContent }),
      });
      // ignore response handling; non-blocking
      await resp.json().catch(() => null);
    } catch {
      // non-blocking
    }
  };

  const handleConfirm = async () => {
    if (!transactionId) {
      alert('Tap Pay first to start the payment.');
      return;
    }

    setConfirming(true);
    try {
      // Save details (non-blocking) so we have user info in DB
      submitDetails();

      // If not verified yet, require UTR/ref and perform upload + verify
      if (!verified) {
        const ref = upiRefInput.trim();
        if (!ref) {
          alert('Enter the UPI UTR/Ref code from your payment.');
          setConfirming(false);
          return;
        }
        const uploaded = await uploadTransactionRef(ref);
        if (!uploaded) {
          alert('Could not submit the reference. Please try again.');
          setConfirming(false);
          return;
        }
        const vResp = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId }),
        });
        const vData = await vResp.json();
        if (!vResp.ok || !vData.ok) {
          alert('Verification failed. Please check the code and try again.');
          setConfirming(false);
          return;
        }
        setVerified(true);
      }

      // Confirm
      const resp = await fetch('/api/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      });
      const data = await resp.json();
      if (data.ok) {
        setConfirmed(true);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        console.error('Confirm failed', data);
        alert(data.error || 'Could not confirm payment.');
      }
    } catch (err) {
      console.error(err);
      alert('Something went wrong. Please try again.');
    } finally {
      setConfirming(false);
    }
  };


  return (
    <div style={{ width: "100%", maxWidth: 700 }}>
      {/* Device Info Badge */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 16,
          fontSize: 11,
          color: "#9ca3af",
          opacity: 0.7,
        }}
      >
        {deviceInfo.isDesktop && "📱 Desktop Mode: Scan QR code on mobile"}
        {deviceInfo.isMobile && "📲 Mobile Mode: Direct UPI payment"}
        {deviceInfo.isTablet && "💻 Tablet Mode: Use QR code or direct payment"}
      </div>

      {/* Email form removed for simplified flow */}

      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: "center", animation: "fadeIn 0.6s ease-out" }}>
        <h1 style={{ marginBottom: 8, fontSize: 32 }}>Order Summary</h1>
        <p style={{ color: "#9ca3af", fontSize: 14 }}>Complete your payment securely</p>
      </div>

  {/* Mobile-first banner */}
      <div
        style={{
          background: deviceInfo.isDesktop ? '#fffbeb' : '#ecfeff',
          border: deviceInfo.isDesktop ? '1px solid #fef3c7' : '1px solid #a5f3fc',
          color: deviceInfo.isDesktop ? '#92400e' : '#155e75',
          borderRadius: 12,
          padding: 14,
          margin: '0 auto 16px',
          maxWidth: 600,
          fontSize: 13,
          animation: 'fadeIn 0.6s ease-out',
        }}
      >
        {deviceInfo.isDesktop
          ? 'For the best experience, open this page on your mobile device to pay via UPI. You can also scan the QR code below.'
      : 'You are on mobile. Enter your phone to receive SMS confirmation, then tap pay.'}
      </div>

      {/* Steps guide (simplified) */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, fontSize: 12, color: '#6b7280' }}>
        <div>1) Tap Pay</div>
        <div>•</div>
        <div>2) Enter UTR/Ref code</div>
        <div>•</div>
        <div>3) Confirm</div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            animation: "fadeIn 0.3s ease-out",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 16,
              padding: 40,
              textAlign: "center",
              maxWidth: 400,
              animation: "scaleIn 0.4s ease-out",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                animation: "scaleIn 0.5s ease-out 0.2s both",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2 style={{ color: "#1f2937", marginBottom: 8 }}>Payment Confirmed!</h2>
            <p style={{ color: "#6b7280", marginBottom: 20 }}>
              Your payment has been successfully processed.
            </p>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0ea5a4" }}>
              ₹{order.amount.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 32,
          maxWidth: 600,
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)",
          margin: "0 auto",
          animation: "slideUp 0.6s ease-out",
        }}
      >
        {/* Item Info */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#1f2937", marginBottom: 4 }}>
              {order.item}
            </div>
            <div style={{ color: "#9ca3af", fontSize: 13 }}>
              by {order.merchantName}
            </div>
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 28,
              background: "linear-gradient(135deg, #0ea5a4 0%, #0d9488 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textAlign: "right",
            }}
          >
            ₹{order.amount.toFixed(2)}
          </div>
        </div>

        <hr
          style={{
            margin: "24px 0",
            border: 0,
            borderTop: "1px solid #e5e7eb",
          }}
        />

        {/* Order Details */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Order ID</div>
          <div style={{ fontWeight: 600, color: "#1f2937" }}>{order.id}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Pay to (VPA)</div>
          <div style={{ fontWeight: 600, color: "#1f2937", fontFamily: "monospace" }}>
            {order.merchantVPA}
          </div>
        </div>

        {/* Phone input for SMS confirmation */}
          {/* User details */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6, fontWeight: 600 }}>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6, fontWeight: 600 }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }} />
              </div>
            </div>
          </div>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6, fontWeight: 600 }}>
            Mobile number for SMS confirmation (India)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="tel"
              placeholder="e.g., 9876543210 or +919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
            />
            {!deviceInfo.isMobile && (
              <button
                onClick={() => { if (isValidPhone(phone)) createUpiLink(); else alert('Enter a valid phone first'); }}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #0ea5a4', background: 'white', color: '#0ea5a4', fontWeight: 700 }}
              >
                Generate QR
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            We’ll send a confirmation SMS when your ₹1 payment is confirmed.
          </div>
        </div>

        {/* Desktop: QR Code */}
        {deviceInfo.isDesktop && qrUrl && (
          <div
            style={{
              background: "#f9fafb",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
              textAlign: "center",
              border: "1px solid #e5e7eb",
              animation: "slideUp 0.5s ease-out",
            }}
          >
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12, fontWeight: 600 }}>
              📱 Scan with mobile to pay
            </p>
            <img
              src={qrUrl}
              alt="UPI QR Code"
              style={{
                width: 200,
                height: 200,
                borderRadius: 8,
                border: "2px solid #0ea5a4",
              }}
            />
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 12 }}>
              or use deep link below on your mobile browser
            </p>
          </div>
        )}

        {/* Pay Button / Mobile Button */}
        <button
          onClick={() => {
            if (deviceInfo.isDesktop) {
              alert('Please open this page on your mobile to pay via UPI. You can also scan the QR code.');
              return;
            }
            if (!isValidPhone(phone)) {
              alert('Enter a valid mobile number to receive SMS confirmation');
              return;
            }
            handlePayClick();
          }}
          disabled={loading || deviceInfo.isDesktop}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: loading
              ? "#0d9488"
              : "linear-gradient(135deg, #0ea5a4 0%, #0d9488 100%)",
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: loading ? "default" : "pointer",
            fontWeight: 600,
            fontSize: 16,
            opacity: loading ? 0.8 : 1,
            letterSpacing: "-0.3px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            transition: "all 0.3s ease",
            boxShadow: "0 4px 12px rgba(14, 165, 164, 0.3)",
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              (e.target as HTMLButtonElement).style.transform = "translateY(-2px)";
              (e.target as HTMLButtonElement).style.boxShadow = "0 8px 20px rgba(14, 165, 164, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.transform = "translateY(0)";
            (e.target as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(14, 165, 164, 0.3)";
          }}
        >
          {loading && <span className="spinner" style={{ marginRight: 8 }}></span>}
          {loading ? "Preparing Payment..." : deviceInfo.isDesktop ? "Open on Mobile to Pay" : "Pay ₹1 via UPI"}
        </button>

        {/* Fallback Link */}
        {upiLink && deviceInfo.isMobile && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #dcfce7",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              animation: "slideUp 0.5s ease-out",
            }}
          >
            <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 8 }}>
              <strong>Manual Link:</strong> If the button didn't open your UPI app, tap below:
            </p>
            <a
              href={upiLink}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                wordBreak: "break-all",
                fontSize: 11,
                padding: 8,
                background: "white",
                borderRadius: 6,
                border: "1px solid #dcfce7",
                color: "#0ea5a4",
              }}
            >
              {upiLink.substring(0, 50)}...
            </a>
          </div>
        )}

        {/* Transaction ID Display */}
        {transactionId && (
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              animation: "slideUp 0.5s ease-out",
            }}
          >
            <p style={{ fontSize: 11, color: "#1e40af", fontFamily: "monospace" }}>
              Txn ID: {transactionId}
            </p>
          </div>
        )}

        {/* SMS Verification with Timer */}
        {transactionId && (
          <div
            style={{
              background: '#eef2ff',
              border: '1px solid #c7d2fe',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              animation: 'slideUp 0.5s ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#3730a3', margin: 0 }}>
                📩 Paste UPI SMS text to auto-verify (fastest)
              </p>
              {timer > 0 && (
                <div style={{ 
                  background: '#fef3c7', 
                  border: '1px solid #fcd34d',
                  borderRadius: 20, 
                  padding: '4px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#92400e',
                  fontFamily: 'monospace'
                }}>
                  ⏱️ {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}
                </div>
              )}
            </div>
            <textarea
              value={smsContent}
              onChange={(e) => setSmsContent(e.target.value)}
              placeholder="Paste the bank/UPI SMS here"
              style={{
                width: '100%',
                minHeight: 70,
                borderRadius: 8,
                border: '1px solid #c7d2fe',
                padding: 8,
                fontSize: 12,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={verifyViaSms}
                disabled={verifyingSms || !smsContent.trim()}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#6366f1',
                  color: 'white',
                  fontWeight: 600,
                  cursor: verifyingSms || !smsContent.trim() ? 'default' : 'pointer',
                  opacity: verifyingSms || !smsContent.trim() ? 0.6 : 1,
                }}
              >
                {verifyingSms ? 'Verifying...' : 'Verify via SMS'}
              </button>
            </div>
          </div>
        )}

        {/* Screenshot Upload - Show after 1 minute timer expires */}
        {transactionId && showScreenshotUpload && !confirmed && (
          <div
            style={{
              background: '#fff7ed',
              border: '2px solid #fb923c',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              animation: 'slideUp 0.5s ease-out',
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 12 }}>
              ⏱️ No SMS after 1.5 minutes? Upload payment screenshot
            </p>
            <div style={{ 
              background: 'white', 
              border: '2px dashed #fdba74',
              borderRadius: 8,
              padding: 16,
              marginBottom: 12,
              textAlign: 'center'
            }}>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                style={{
                  display: 'block',
                  margin: '0 auto',
                  padding: '8px',
                  fontSize: 13
                }}
              />
              <div style={{ marginTop: 8, fontSize: 11, color: '#78350f' }}>
                📸 Take a screenshot of your payment from UPI app
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={async () => {
                  if (!screenshotFile) { alert('Choose a screenshot first'); return; }
                  if (!name || !email || !phone) { alert('Please fill name, email, and phone first'); return; }
                  const form = new FormData();
                  if (transactionId) form.append('transactionId', transactionId);
                  form.append('name', name);
                  form.append('email', email);
                  form.append('phone', phone);
                  form.append('utr', upiRefInput);
                  form.append('message', note);
                  form.append('screenshot', screenshotFile);
                  try {
                    const resp = await fetch('/api/upload-screenshot', { method: 'POST', body: form });
                    if (!resp.ok) {
                      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
                    }
                    const text = await resp.text();
                    const data = text ? JSON.parse(text) : {};
                    if (data.ok) {
                      alert('✅ Screenshot received! We will verify and confirm your payment within 24 hours. Check your email/SMS.');
                      setShowScreenshotUpload(false);
                    } else {
                      alert('Upload failed: ' + (data.error || 'unknown'));
                    }
                  } catch (e) {
                    alert('Upload error: ' + (e as any).message);
                  }
                }}
                style={{ 
                  padding: '10px 16px', 
                  borderRadius: 8, 
                  border: 'none', 
                  background: '#f59e0b', 
                  color: 'white', 
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                📤 Upload Screenshot
              </button>
            </div>
            <div style={{ marginTop: 10, padding: 10, background: '#fef3c7', borderRadius: 6, fontSize: 11, color: '#78350f' }}>
              ℹ️ After upload, our team will manually verify your payment and confirm within 24 hours.
            </div>
          </div>
        )}

        {/* Simple UTR/Ref entry */}
        {transactionId && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              animation: 'slideUp 0.5s ease-out',
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>
              📝 Or enter UPI UTR/Ref code (from your app):
            </p>
            <input
              type="text"
              placeholder="e.g., ABC123XYZ123"
              value={upiRefInput}
              onChange={(e) => setUpiRefInput(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 13,
                fontFamily: 'monospace',
                boxSizing: 'border-box',
              }}
            />
            <label style={{ display: 'block', fontSize: 12, color: '#475569', margin: '10px 0 6px', fontWeight: 600 }}>Message (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add any note or message here" style={{ width: '100%', minHeight: 60, borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
              Tip: Open your UPI app {'>'} recent transactions {'>'} copy the UTR/Ref code.
            </div>
          </div>
        )}

        {/* Confirmation Section */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            Enter your details and UTR/Ref, then press Confirm. If SMS arrives first and you verify via SMS, we auto-confirm.
          </p>

          <button
            onClick={handleConfirm}
            disabled={confirming || confirmed}
            style={{
              width: "100%",
              padding: '12px 16px',
              borderRadius: 10,
              border: confirmed ? "none" : "1.5px solid #e5e7eb",
              background: confirmed ? "#d1fae5" : "#ecfeff",
              cursor: confirming || confirmed ? 'default' : 'pointer',
              fontWeight: 600,
              fontSize: 14,
              color: confirmed ? "#059669" : "#0ea5a4",
              transition: "all 0.3s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              if (!confirming && !confirmed) {
                (e.target as HTMLButtonElement).style.background = "#f9fafb";
                (e.target as HTMLButtonElement).style.borderColor = "#0ea5a4";
              }
            }}
            onMouseLeave={(e) => {
              if (!confirming && !confirmed) {
                (e.target as HTMLButtonElement).style.background = "#ecfeff";
                (e.target as HTMLButtonElement).style.borderColor = "#e5e7eb";
              }
            }}
          >
            {confirmed && <span style={{ marginRight: 8 }}>✓</span>}
            {confirming && <span className="spinner"></span>}
            {confirmed ? 'Payment confirmed!' : confirming ? 'Confirming payment...' : 'Confirm Payment'}
          </button>

          {/* Save details helper (non-blocking) */}
          <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
            <button
              onClick={async () => {
                try {
                  const resp = await fetch('/api/submit-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transactionId, name, email, phone, utr: upiRefInput, message: note, smsContent }),
                  });
                  const data = await resp.json();
                  if (!data.ok) throw new Error(data.error || 'Failed to save');
                  alert('Details saved');
                } catch (e) {
                  alert('Could not save details: ' + (e as any).message);
                }
              }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', color: '#334155', fontWeight: 600 }}
            >
              Save my details (optional)
            </button>
          </div>
        </div>
      </div>

      {/* Security Footer */}
      <div
        style={{
          marginTop: 24,
          textAlign: "center",
          fontSize: 12,
          color: "#9ca3af",
          animation: "fadeIn 0.8s ease-out 0.4s both",
        }}
      >
        <p>🔒 Your payment information is encrypted and secure</p>
      </div>
    </div>
  );
};

export default App;

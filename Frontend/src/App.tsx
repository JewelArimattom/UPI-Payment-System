import React from "react";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
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
      toast.error('Enter a valid mobile number to receive SMS confirmation (e.g., 9876543210 or +919876543210)', {
        position: "top-center",
        autoClose: 4000,
      });
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
      toast.warning('⚠️ Tap Pay first to start the payment.');
      return;
    }
    if (!smsContent.trim()) {
      toast.warning('⚠️ Paste the SMS content first');
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
        toast.success('✅ SMS verified successfully!');
        // Backend now auto-confirms on SMS verify
        if (data.status === 'confirmed') {
          setConfirmed(true);
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
        }
      } else {
        toast.error('Could not verify from SMS: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('SMS verify error', err);
      toast.error('❌ Something went wrong. Please try again.');
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
      toast.warning('⚠️ Please tap Pay first to start the payment.');
      return;
    }

    // Validate all required fields
    if (!name.trim()) {
      toast.error('⚠️ Please enter your name');
      return;
    }
    if (!email.trim()) {
      toast.error('⚠️ Please enter your email');
      return;
    }
    if (!isValidPhone(phone)) {
      toast.error('⚠️ Please enter a valid phone number');
      return;
    }

    // Check if either SMS content or UTR/screenshot is provided
    const hasSms = smsContent.trim().length > 0;
    const hasUtr = upiRefInput.trim().length > 0;
    const hasScreenshot = screenshotFile !== null;

    if (!hasSms && !hasUtr && !hasScreenshot) {
      toast.warning('⚠️ Please provide payment proof:\n• Paste SMS, OR\n• Enter UTR/Ref code, OR\n• Upload screenshot', {
        autoClose: 5000,
      });
      return;
    }

    setConfirming(true);
    try {
      // Save details to MongoDB first
      await submitDetails();

      // If not verified yet, require UTR/ref and perform upload + verify
      if (!verified) {
        const ref = upiRefInput.trim();
        if (!ref) {
          toast.error('⚠️ Enter the UPI UTR/Ref code from your payment.');
          setConfirming(false);
          return;
        }
        const uploaded = await uploadTransactionRef(ref);
        if (!uploaded) {
          toast.error('❌ Could not submit the reference. Please try again.');
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
          toast.error('❌ Verification failed. Please check the code and try again.');
          setConfirming(false);
          return;
        }
        setVerified(true);
        toast.success('✅ Payment verified!');
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
        toast.success('🎉 Payment confirmed successfully!');
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        console.error('Confirm failed', data);
        toast.error(data.error || '❌ Could not confirm payment.');
      }
    } catch (err) {
      console.error(err);
      toast.error('❌ Something went wrong. Please try again.');
    } finally {
      setConfirming(false);
    }
  };


  return (
    <div className="premium-bg" style={{ minHeight: '100vh', padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="bg-grid" />
      <div style={{ width: "100%", maxWidth: 700 }}>
      {/* Device Info Badge */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 20,
          fontSize: 12,
          color: "rgba(255, 255, 255, 0.9)",
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          padding: '10px 20px',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        {deviceInfo.isDesktop && "📱 Desktop Mode: Scan QR code on mobile"}
        {deviceInfo.isMobile && "📲 Mobile Mode: Direct UPI payment"}
        {deviceInfo.isTablet && "💻 Tablet Mode: Use QR code or direct payment"}
      </div>

      {/* Email form removed for simplified flow */}

      {/* Header */}
      <div style={{ 
        marginBottom: 24, 
        textAlign: "center", 
        animation: "fadeIn 0.6s ease-out",
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 16,
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ 
          marginBottom: 8, 
          fontSize: 32, 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 700
        }}>Secure Payment</h1>
        <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Complete your ₹1 payment securely via UPI</p>
      </div>

  {/* Mobile-first banner */}
      <div
        style={{
          background: deviceInfo.isDesktop ? 'rgba(255, 251, 235, 0.95)' : 'rgba(236, 254, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          border: deviceInfo.isDesktop ? '1px solid rgba(254, 243, 199, 0.8)' : '1px solid rgba(165, 243, 252, 0.8)',
          color: deviceInfo.isDesktop ? '#92400e' : '#155e75',
          borderRadius: 12,
          padding: 14,
          margin: '0 auto 16px',
          maxWidth: 600,
          fontSize: 13,
          animation: 'fadeIn 0.6s ease-out',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        }}
      >
        {deviceInfo.isDesktop
          ? '💻 For the best experience, open this page on your mobile device to pay via UPI. You can also scan the QR code below.'
      : '📱 You are on mobile. Enter your phone to receive SMS confirmation, then tap pay.'}
      </div>

      {/* Steps guide (simplified) */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        justifyContent: 'center', 
        marginBottom: 20, 
        fontSize: 12, 
        color: 'rgba(255, 255, 255, 0.95)',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        padding: '12px 24px',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.2)',
        flexWrap: 'wrap'
      }}>
        <div style={{ fontWeight: 600 }}>1️⃣ Tap Pay</div>
        <div>→</div>
        <div style={{ fontWeight: 600 }}>2️⃣ Enter Details</div>
        <div>→</div>
        <div style={{ fontWeight: 600 }}>3️⃣ Confirm</div>
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
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: 'blur(8px)',
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
              borderRadius: 24,
              padding: 48,
              textAlign: "center",
              maxWidth: 420,
              animation: "scaleIn 0.4s ease-out",
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                animation: "scaleIn 0.5s ease-out 0.2s both",
                boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)',
              }}
            >
              <svg
                width="40"
                height="40"
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
            <h2 style={{ color: "#1f2937", marginBottom: 12, fontSize: 28, fontWeight: 700 }}>Payment Confirmed!</h2>
            <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 15 }}>
              Your payment has been successfully processed and verified.
            </p>
            <div style={{ 
              fontSize: 32, 
              fontWeight: 700, 
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              ₹{order.amount.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.98)",
          backdropFilter: 'blur(20px)',
          borderRadius: 20,
          padding: 32,
          maxWidth: 600,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3), 0 0 1px rgba(255, 255, 255, 0.5)",
          margin: "0 auto",
          animation: "slideUp 0.6s ease-out",
          border: '1px solid rgba(255, 255, 255, 0.5)',
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
                onClick={() => { if (isValidPhone(phone)) createUpiLink(); else toast.error('⚠️ Enter a valid phone first'); }}
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
              toast.info('📱 Please open this page on your mobile to pay via UPI. You can also scan the QR code.');
              return;
            }
            if (!isValidPhone(phone)) {
              toast.error('⚠️ Enter a valid mobile number to receive SMS confirmation');
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
                  if (!screenshotFile) { toast.error('⚠️ Choose a screenshot first'); return; }
                  if (!name || !email || !phone) { toast.error('⚠️ Please fill name, email, and phone first'); return; }
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
                      toast.success('✅ Screenshot received! We will verify and confirm your payment within 24 hours. Check your email/SMS.', {
                        autoClose: 6000,
                      });
                      setShowScreenshotUpload(false);
                    } else {
                      toast.error('❌ Upload failed: ' + (data.error || 'unknown'));
                    }
                  } catch (e) {
                    toast.error('❌ Upload error: ' + (e as any).message);
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
        <div style={{ borderTop: "2px solid #f3f4f6", paddingTop: 24, marginTop: 20 }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            border: '1px solid #fbbf24',
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
            fontSize: 13,
            color: '#78350f',
            fontWeight: 600
          }}>
            ⚠️ Required: Name, Email, Phone + (SMS OR UTR OR Screenshot)
          </div>

          <button
            onClick={handleConfirm}
            disabled={confirming || confirmed}
            style={{
              width: "100%",
              padding: '16px 20px',
              borderRadius: 12,
              border: 'none',
              background: confirmed 
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" 
                : confirming 
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              cursor: confirming || confirmed ? 'default' : 'pointer',
              fontWeight: 700,
              fontSize: 16,
              color: 'white',
              transition: "all 0.3s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: confirmed ? "0 4px 15px rgba(16, 185, 129, 0.4)" : "0 4px 15px rgba(102, 126, 234, 0.4)",
              transform: confirming ? 'scale(0.98)' : 'scale(1)',
            }}
            onMouseEnter={(e) => {
              if (!confirming && !confirmed) {
                (e.target as HTMLButtonElement).style.transform = "translateY(-2px) scale(1.02)";
                (e.target as HTMLButtonElement).style.boxShadow = "0 8px 25px rgba(102, 126, 234, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (!confirming && !confirmed) {
                (e.target as HTMLButtonElement).style.transform = "translateY(0) scale(1)";
                (e.target as HTMLButtonElement).style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
              }
            }}
          >
            {confirmed && <span style={{ marginRight: 8, fontSize: 20 }}>✓</span>}
            {confirming && <span className="spinner" style={{ marginRight: 8 }}></span>}
            {confirmed ? '✅ Payment Confirmed!' : confirming ? 'Processing...' : '🚀 Confirm Payment'}
          </button>
        </div>
      </div>

      {/* Security Footer */}
      <div
        style={{
          marginTop: 24,
          textAlign: "center",
          fontSize: 13,
          color: "rgba(255, 255, 255, 0.9)",
          animation: "fadeIn 0.8s ease-out 0.4s both",
        }}
      >
        <p style={{ margin: 0 }}>🔒 Your payment information is encrypted and secure</p>
      </div>
    </div>
    
    {/* Toast Notifications */}
    <ToastContainer
      position="top-center"
      autoClose={3000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="dark"
      style={{ zIndex: 9999 }}
    />
    </div>
  );
};

export default App;

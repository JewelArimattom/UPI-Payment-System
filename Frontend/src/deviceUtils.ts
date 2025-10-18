/**
 * Device and browser detection utilities
 */

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  userAgent: string;
  platform: string;
}

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const platform = navigator.platform;

  // Mobile detection
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  const isMobile = mobileRegex.test(ua.toLowerCase());

  // Tablet detection
  const tabletRegex = /ipad|android(?!.*mobile)|tablet/i;
  const isTablet = tabletRegex.test(ua.toLowerCase());

  // Refine mobile detection (exclude tablets)
  const actualMobile = isMobile && !isTablet;

  return {
    isMobile: actualMobile,
    isTablet,
    isDesktop: !actualMobile && !isTablet,
    userAgent: ua,
    platform,
  };
}

/**
 * SMS Reading permissions and parsing (PWA)
 * This requires OTP API or manual SMS access (Android)
 */
export interface SMSMessage {
  sender: string;
  content: string;
  timestamp: number;
}

export async function requestSmsPermission(): Promise<boolean> {
  try {
    // Check if WebOTP API is available
    if ('canReceiveSMS' in navigator) {
      // OTP API for mobile browsers
      return true;
    }
    return false;
  } catch (err) {
    console.warn('SMS permission not available:', err);
    return false;
  }
}

/**
 * Parse UPI transaction reference from SMS content
 * UPI SMS format: "Txn <ref> of Rs<amount> done. Bal: <bal>"
 */
export function parseUpiSmsRef(smsContent: string): string | null {
  // Pattern 1: "Txn ABC123XYZ"
  const pattern1 = /Txn\s+([A-Z0-9]+)/i;
  // Pattern 2: UPI Ref: ABC123XYZ
  const pattern2 = /UPI\s+Ref[:\s]+([A-Z0-9]+)/i;
  // Pattern 3: Reference number in message
  const pattern3 = /Ref\s*:?\s*([A-Z0-9]{10,20})/i;

  const match = smsContent.match(pattern1) || smsContent.match(pattern2) || smsContent.match(pattern3);
  return match ? match[1] : null;
}

/**
 * Check if SMS contains UPI success indicators
 */
export function isUpiSuccessSms(smsContent: string): boolean {
  const successPatterns = [
    /txn.*success/i,
    /payment.*success/i,
    /credited/i,
    /debit.*success/i,
    /of rs/i,
  ];
  return successPatterns.some((p) => p.test(smsContent));
}

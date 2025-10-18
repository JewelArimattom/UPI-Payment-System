/**
 * QR Code generation for UPI deep links
 * Uses qrcode library (to be installed via npm)
 */

/**
 * Generate QR code SVG string from UPI link
 * This is a lightweight base64 encoding approach
 */
export function generateQRDataUrl(text: string): Promise<string> {
  return new Promise((resolve) => {
    // Use a free QR API service (no installation needed)
    // Alternative: install 'qrcode' npm package for local generation
    const encodedText = encodeURIComponent(text);
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedText}`;
    resolve(qrApiUrl);
  });
}

/**
 * Alternative: If you want offline QR generation (requires npm install qrcode)
 * Uncomment and use this function instead after: npm install qrcode
 *
 * import QRCode from 'qrcode';
 *
 * export function generateQRDataUrlOffline(text: string): Promise<string> {
 *   return QRCode.toDataURL(text, {
 *     errorCorrectionLevel: 'H',
 *     type: 'image/png',
 *     width: 300,
 *     margin: 1,
 *     color: {
 *       dark: '#0ea5a4',
 *       light: '#ffffff',
 *     },
 *   });
 * }
 */

/**
 * Generate a simple, downloadable QR code for the UPI link
 */
export async function downloadQRCode(upiLink: string, fileName: string = 'upi-qr.png') {
  const qrUrl = await generateQRDataUrl(upiLink);

  // If it's a data URL, download directly
  if (qrUrl.startsWith('data:')) {
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = fileName;
    link.click();
  } else {
    // If it's an external URL, open in new tab
    window.open(qrUrl, '_blank');
  }
}

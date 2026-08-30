import nodemailer from 'nodemailer';

// ─── Types ─────────────────────────────────────────────────────────────────
interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

// ─── Transporter ───────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─── Shared Brand HTML ─────────────────────────────────────────────────────
const brandHeader = `
  <div style="background:#5a3e2b;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-family:Georgia,serif;font-size:22px;letter-spacing:0.5px;">
      NationMart
    </h1>
    <p style="color:#e8b872;margin:4px 0 0;font-size:13px;">Ghana&apos;s Premium Wood Marketplace</p>
  </div>
`;

const brandFooter = `
  <div style="background:#f5f0eb;padding:16px 32px;border-radius:0 0 8px 8px;border-top:1px solid #e0d4c4;">
    <p style="color:#888;font-size:12px;margin:0;">
      NationMart &bull; Accra, Ghana &bull;
      <a href="https://nationmart.gh" style="color:#a86220;">nationmart.gh</a>
    </p>
    <p style="color:#aaa;font-size:11px;margin:6px 0 0;">
      This email was sent by NationMart. Do not reply to this email.
    </p>
  </div>
`;

const wrapEmail = (content: string) => `
  <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    ${brandHeader}
    <div style="padding:32px;">
      ${content}
    </div>
    ${brandFooter}
  </div>
`;

// ─── Core Send ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: `"NationMart" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[EmailService] Sent "${subject}" → ${to}`);
    return true;
  } catch (err) {
    console.error('[EmailService] Failed to send email:', err);
    return false;
  }
}

// ─── 1. Welcome Email ──────────────────────────────────────────────────────
export async function sendWelcomeEmail(
  to: string,
  name: string,
  role: string
): Promise<boolean> {
  const isSeller = ['seller', 'manufacturer', 'reseller'].includes(role);
  const html = wrapEmail(`
    <h2 style="color:#3d2210;font-family:Georgia,serif;margin-top:0;">
      Welcome to NationMart, ${name}! 🎉
    </h2>
    <p style="color:#555;line-height:1.7;">
      Your account has been created successfully as a <strong>${role}</strong>.
    </p>
    ${isSeller ? `
      <div style="background:#fff8e1;border:1px solid #ffd54f;border-radius:8px;padding:16px;margin:16px 0;">
        <strong style="color:#7d481a;">⚠ Action Required:</strong>
        <p style="color:#555;margin:8px 0 0;">
          To start listing products, you must upload and have your licenses approved by our admin team.
          Log in to your dashboard to get started.
        </p>
      </div>
    ` : ''}
    <a href="${process.env.FRONTEND_URL}/dashboard"
       style="display:inline-block;background:#c97f28;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">
      Go to Dashboard →
    </a>
  `);

  return sendEmail({ to, subject: 'Welcome to NationMart 🌳', html });
}

// ─── 2. License Status Email ───────────────────────────────────────────────
export async function sendLicenseStatusEmail(
  to: string,
  sellerName: string,
  licenseType: string,
  status: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<boolean> {
  const approved = status === 'approved';
  const html = wrapEmail(`
    <h2 style="color:${approved ? '#1b5e20' : '#b71c1c'};font-family:Georgia,serif;margin-top:0;">
      License ${approved ? 'Approved ✅' : 'Rejected ❌'}
    </h2>
    <p style="color:#555;line-height:1.7;">
      Dear <strong>${sellerName}</strong>,<br/>
      Your <strong>${licenseType}</strong> has been <strong>${status}</strong> by the NationMart compliance team.
    </p>
    ${!approved && rejectionReason ? `
      <div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:8px;padding:16px;margin:16px 0;">
        <strong style="color:#c62828;">Reason:</strong>
        <p style="color:#555;margin:8px 0 0;">${rejectionReason}</p>
      </div>
      <p style="color:#555;">Please upload a valid document and resubmit for review.</p>
    ` : `
      <p style="color:#555;">You may now list products on the platform. Log in to your dashboard to add your inventory.</p>
    `}
    <a href="${process.env.FRONTEND_URL}/dashboard"
       style="display:inline-block;background:#c97f28;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">
      View Dashboard →
    </a>
  `);

  return sendEmail({
    to,
    subject: `License ${approved ? 'Approved' : 'Rejected'} - ${licenseType}`,
    html,
  });
}

// ─── 3. License Expiry Warning ─────────────────────────────────────────────
export async function sendLicenseExpiryWarning(
  to: string,
  sellerName: string,
  licenseType: string,
  expiryDate: Date,
  daysRemaining: number
): Promise<boolean> {
  const urgency = daysRemaining <= 7 ? 'URGENT: ' : '';
  const html = wrapEmail(`
    <h2 style="color:#e65100;font-family:Georgia,serif;margin-top:0;">
      ⚠ License Expiring in ${daysRemaining} Days
    </h2>
    <p style="color:#555;line-height:1.7;">
      Dear <strong>${sellerName}</strong>,<br/>
      Your <strong>${licenseType}</strong> is set to expire on
      <strong>${expiryDate.toLocaleDateString('en-GH', { dateStyle: 'long' })}</strong>.
    </p>
    <div style="background:#fff3e0;border:1px solid #ffcc02;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#555;margin:0;">
        <strong>Important:</strong> If your license expires, your product listings will be automatically
        suspended until you upload a renewed document and receive admin approval.
      </p>
    </div>
    <a href="${process.env.FRONTEND_URL}/dashboard"
       style="display:inline-block;background:#c97f28;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">
      Renew Now →
    </a>
  `);

  return sendEmail({
    to,
    subject: `${urgency}License Expiring Soon - ${licenseType}`,
    html,
  });
}

// ─── 4. Order Confirmation (Buyer) ─────────────────────────────────────────
export async function sendOrderConfirmation(
  to: string,
  buyerName: string,
  orderNumber: string,
  items: Array<{ name: string; quantity: number; unit: string; price: number }>,
  total: number,
  currency: string,
  destination?: string
): Promise<boolean> {
  const itemRows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0e8dc;">${i.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0e8dc;text-align:center;">${i.quantity} ${i.unit}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0e8dc;text-align:right;">${currency} ${i.price.toLocaleString()}</td>
      </tr>`
    )
    .join('');

  const html = wrapEmail(`
    <h2 style="color:#3d2210;font-family:Georgia,serif;margin-top:0;">
      Order Confirmed 📦
    </h2>
    <p style="color:#555;line-height:1.7;">
      Dear <strong>${buyerName}</strong>,<br/>
      Your order <strong style="font-family:monospace;">${orderNumber}</strong> has been placed successfully.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="border-bottom:2px solid #e8b872;">
          <th style="text-align:left;padding:8px 0;color:#7d481a;">Product</th>
          <th style="text-align:center;padding:8px 0;color:#7d481a;">Qty</th>
          <th style="text-align:right;padding:8px 0;color:#7d481a;">Price</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding:12px 0;font-weight:bold;color:#3d2210;">Total (incl. VAT)</td>
          <td style="padding:12px 0;font-weight:bold;color:#3d2210;text-align:right;">
            ${currency} ${total.toLocaleString()}
          </td>
        </tr>
      </tfoot>
    </table>
    ${destination ? `<p style="color:#555;font-size:13px;">Destination: <strong>${destination}</strong></p>` : ''}
    <a href="${process.env.FRONTEND_URL}/dashboard"
       style="display:inline-block;background:#c97f28;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">
      Track Your Order →
    </a>
  `);

  return sendEmail({
    to,
    subject: `Order Confirmed – ${orderNumber}`,
    html,
  });
}

// ─── 5. Order Status Update ────────────────────────────────────────────────
export async function sendOrderStatusUpdate(
  to: string,
  name: string,
  orderNumber: string,
  newStatus: string,
  message?: string
): Promise<boolean> {
  const statusEmoji: Record<string, string> = {
    confirmed: '✅',
    processing: '⚙️',
    quality_check: '🔍',
    ready_for_shipping: '📦',
    shipped: '🚢',
    customs_clearance: '🛃',
    delivered: '🎉',
    cancelled: '❌',
  };

  const emoji = statusEmoji[newStatus.toLowerCase()] || '📋';
  const html = wrapEmail(`
    <h2 style="color:#3d2210;font-family:Georgia,serif;margin-top:0;">
      Order Update ${emoji}
    </h2>
    <p style="color:#555;line-height:1.7;">
      Dear <strong>${name}</strong>,<br/>
      Your order <strong style="font-family:monospace;">${orderNumber}</strong> status has been updated to:
    </p>
    <div style="background:#fdf8f0;border:2px solid #e8b872;border-radius:8px;padding:20px;text-align:center;margin:16px 0;">
      <span style="font-size:28px;">${emoji}</span>
      <p style="font-size:20px;font-weight:bold;color:#5a3e2b;margin:8px 0 0;text-transform:capitalize;">
        ${newStatus.replace(/_/g, ' ')}
      </p>
    </div>
    ${message ? `<p style="color:#666;font-size:14px;background:#f5f0eb;padding:12px;border-radius:6px;">${message}</p>` : ''}
    <a href="${process.env.FRONTEND_URL}/dashboard"
       style="display:inline-block;background:#c97f28;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">
      View Order Details →
    </a>
  `);

  return sendEmail({
    to,
    subject: `Order Update – ${newStatus.replace(/_/g, ' ')} – ${orderNumber}`,
    html,
  });
}

// ─── 6. Admin Alert (New License or Flagged Product) ──────────────────────
export async function sendAdminAlert(
  subject: string,
  body: string
): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER || '';
  const html = wrapEmail(`
    <h2 style="color:#b71c1c;font-family:Georgia,serif;margin-top:0;">
      ⚠ Admin Alert
    </h2>
    <p style="color:#555;line-height:1.7;">${body}</p>
    <a href="${process.env.FRONTEND_URL}/admin"
       style="display:inline-block;background:#c97f28;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">
      Go to Admin Panel →
    </a>
  `);

  return sendEmail({ to: adminEmail, subject: `[NationMart Admin] ${subject}`, html });
}

export default {
  sendWelcomeEmail,
  sendLicenseStatusEmail,
  sendLicenseExpiryWarning,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendAdminAlert,
};

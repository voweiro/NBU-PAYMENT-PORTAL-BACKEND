const QRCode = require('qrcode');

function formatCurrency(amount) {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(Number(amount || 0));
  } catch {
    return `₦${Number(amount || 0).toLocaleString()}`;
  }
}

function formatDate(dt) {
  try {
    const date = dt instanceof Date ? dt : new Date(dt);
    return new Intl.DateTimeFormat('en-NG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return String(dt);
  }
}

async function buildReceiptEmail({ payment, fee, program, receiptDriveUrl, isBalanceSettlement = false }) {
  const university = 'Nigerian British University';
  const studentName = payment?.studentName || payment?.studentEmail || 'Student';
  const receiptNumber = payment?.reference || `NBU-${payment?.id ?? ''}`;
  const transactionId = payment?.reference || '-';
  const paymentDate = formatDate(payment?.createdAt);
  const paymentMethod = 'ONLINE PAYMENT';
  const items = Array.isArray(payment?.items) && payment.items.length > 0
    ? payment.items
    : [{ name: fee?.name || 'Fee', fee_category: fee?.name, amount: Number(fee?.amount || payment?.amount || 0) }];

  const totalPaid = Number(payment?.amount || 0);
  const verifyUrl = `${process.env.FRONTEND_URL}/payment/lookup?ref=${encodeURIComponent(payment?.reference || '')}`;

  let qrDataUrl;
  try {
    qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      color: { dark: '#1D4ED8', light: '#FFFFFF' },
    });
  } catch {
    qrDataUrl = null;
  }

  const subject = `Payment Receipt — ${university}`;

  const itemsRows = items
    .map(
      (it) => `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${it.name || it.feeName || it.fee_category || fee?.name || 'Fee'}</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;text-align:right;">${formatCurrency(it.amount)}</td>
        </tr>`
    )
    .join('');

  const html = `
  <div style="background:#f8fafc;padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#1D4ED8;color:#ffffff;padding:24px;">
          <div style="font-size:20px;font-weight:700;">Payment Receipt</div>
          <div style="font-size:13px;opacity:0.9;margin-top:4px;">${university}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 12px 0;font-size:14px;color:#0f172a;">Dear ${studentName},</p>
          <p style="margin:0 0 20px 0;font-size:14px;color:#334155;">Thank you for your payment. Your transaction has been processed successfully.${isBalanceSettlement ? ' The payment completes your outstanding balance.' : ''}</p>

          <div style="margin-bottom:16px;font-size:13px;color:#334155;">
            <strong style="color:#0f172a;">Program:</strong> ${program?.programName || program?.name || '-'}
            ${program?.programType ? `<span style="margin-left:8px;color:#2563eb;border:1px solid #bfdbfe;border-radius:999px;padding:2px 8px;font-size:11px;">${String(program.programType).toUpperCase()}</span>` : ''}
          </div>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:20px;">
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;width:50%;">Receipt Number</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${receiptNumber}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;width:50%;">Transaction ID</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${transactionId}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;width:50%;">Payment Date</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${paymentDate}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;width:50%;">Payment Method</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${paymentMethod}</td>
            </tr>
          </table>

          <div style="font-weight:600;color:#0f172a;margin-bottom:8px;">Fees Paid</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:16px;">
            <thead>
              <tr>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;background:#f1f5f9;color:#0f172a;font-size:12px;text-align:left;">Description</th>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;background:#f1f5f9;color:#0f172a;font-size:12px;text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px dashed #e5e7eb;padding-top:12px;margin-top:12px;">
            <div style="font-weight:600;color:#0f172a;">Total Amount Paid</div>
            <div style="font-weight:700;color:#1D4ED8;">${formatCurrency(totalPaid)}</div>
          </div>

          <div style="margin-top:20px;display:flex;gap:12px;align-items:center;">
            ${receiptDriveUrl ? `<a href="${receiptDriveUrl}" target="_blank" rel="noopener noreferrer" style="background:#1D4ED8;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">View Receipt PDF</a>` : ''}
            <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">Verify Payment</a>
            ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code" width="56" height="56" style="border:1px solid #e5e7eb;border-radius:8px;"/>` : ''}
          </div>

          <p style="margin:20px 0 0 0;font-size:12px;color:#64748b;">Please keep this receipt for your records. If you have any questions, please contact the bursary department.</p>
        </td>
      </tr>
    </table>

    <div style="max-width:640px;margin:12px auto 0 auto;text-align:center;color:#64748b;font-size:12px;">
      © ${new Date().getFullYear()} ${university}. All rights reserved.
    </div>
  </div>`;

  return { subject, html };
}

module.exports = { buildReceiptEmail };
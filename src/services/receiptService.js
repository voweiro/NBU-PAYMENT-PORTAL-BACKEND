const PDFDocument = require('pdfkit');
const { google } = require('googleapis');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const crypto = require('crypto');

function createOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return client;
}

// Generate security hash for anti-forgery
function generateSecurityHash(payment, fee) {
  const data = `${payment.payment_id}-${payment.transaction_ref}-${payment.amount_paid}-${fee.fee_id}-${payment.payment_date}`;
  return crypto.createHash('sha256').update(data + process.env.JWT_SECRET).digest('hex').substring(0, 16).toUpperCase();
}

// Generate QR code verification URL
async function generateQRCode(payment) {
  const verificationUrl = `${process.env.FRONTEND_URL}/payment/lookup?ref=${encodeURIComponent(payment.transaction_ref)}`;
  return await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    quality: 0.92,
    margin: 1,
    color: {
      dark: '#3498DB',
      light: '#FFFFFF'
    }
  });
}

async function generateReceiptPDFBuffer({ payment, fee, program, session, isBalanceSettlement = false }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // --- BRANDING COLORS ---
      const colors = {
        primary: '#1B3F8B',   // University Navy
        accent: '#D4AF37',    // Gold
        dark: '#1F2937',      // Dark Grayish Blue
        light: '#F3F4F6',     // Light Gray
        white: '#FFFFFF',
        success: '#059669',   // Green
        danger: '#DC2626'     // Red
      };

      // --- HELPER FUNCTIONS ---
      const drawLine = (y) => {
        doc.lineWidth(0.5).strokeColor('#E5E7EB').moveTo(40, y).lineTo(555, y).stroke();
      };

      // --- SECURITY FEATURES ---
      const securityHash = generateSecurityHash(payment, fee);
      const qrCodeDataUrl = await generateQRCode(payment);
      const qrCodeBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');

      // 1. Watermark (Subtle Background)
      doc.save();
      doc.fillColor(colors.primary).opacity(0.02);
      doc.fontSize(60).font('Helvetica-Bold');
      doc.text('NIGERIAN BRITISH UNIVERSITY', 0, 300, { align: 'center', rotate: 45 });
      doc.text('OFFICIAL RECEIPT', 0, 400, { align: 'center', rotate: 45 });
      doc.restore();

      // 2. Header Section
      let topY = 40;
      
      // Logo
      try {
        const logoPath = path.join(__dirname, '..', 'asserts', 'logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 40, topY, { width: 60, height: 60 });
        }
      } catch (e) { /* ignore */ }

      // University Text
      doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.primary)
         .text('NIGERIAN BRITISH UNIVERSITY', 0, topY + 10, { align: 'center' });
      
      doc.font('Helvetica').fontSize(9).fillColor(colors.dark)
         .text('KM 10, Port Harcourt - Aba Expressway, Abia State, Nigeria.', 0, topY + 35, { align: 'center' });
      doc.text('Website: www.nbu.edu.ng | Email: bursary@nbu.edu.ng', 0, topY + 48, { align: 'center' });

      // Title Box
      const titleY = topY + 80;
      doc.rect(40, titleY, 515, 30).fill(colors.primary);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.white)
         .text('OFFICIAL PAYMENT RECEIPT', 40, titleY + 9, { align: 'center', width: 515 });

      // 3. Receipt Meta Info (Date & Ref)
      const metaY = titleY + 45;
      doc.fillColor(colors.dark).fontSize(10);
      
      // Left: Date
      doc.font('Helvetica-Bold').text('Date Generated:', 40, metaY);
      doc.font('Helvetica').text(new Date().toLocaleDateString('en-GB'), 130, metaY);

      // Right: Receipt No
      doc.font('Helvetica-Bold').text('Transaction Ref:', 350, metaY);
      doc.font('Helvetica').fillColor(colors.danger).text(payment.transaction_ref, 440, metaY);

      drawLine(metaY + 20);

      // 4. Student Details Section
      const studentY = metaY + 40;
      doc.rect(40, studentY, 515, 110).fill(colors.light); // Background box
      doc.strokeColor(colors.primary).lineWidth(2).moveTo(40, studentY).lineTo(40, studentY + 110).stroke(); // Accent strip

      const fieldX = 60;
      const valueX = 180;
      let currentY = studentY + 15;
      const rowHeight = 20;

      // Row 1: Name & Matric
      doc.fillColor(colors.dark).fontSize(10);
      doc.font('Helvetica').text('Student Name:', fieldX, currentY);
      doc.font('Helvetica-Bold').text(payment.student_name || 'N/A', valueX, currentY);
      
      // Row 2: Program
      currentY += rowHeight;
      doc.font('Helvetica').text('Program of Study:', fieldX, currentY);
      doc.font('Helvetica-Bold').text(program.program_name, valueX, currentY);

      // Row 3: Session (NEW!)
      currentY += rowHeight;
      doc.font('Helvetica').text('Academic Session:', fieldX, currentY);
      doc.font('Helvetica-Bold').text(session ? session.session_name : 'N/A', valueX, currentY);

      // Row 4: Level & Semester
      currentY += rowHeight;
      doc.font('Helvetica').text('Level / Semester:', fieldX, currentY);
      const levelTxt = payment.level ? `${payment.level} Level` : 'N/A';
      const semTxt = fee.semester ? `${fee.semester} Semester` : '';
      doc.font('Helvetica-Bold').text(`${levelTxt} ${semTxt ? ` - ${semTxt}` : ''}`, valueX, currentY);

      // 5. Payment Details Section
      currentY = studentY + 130;
      
      doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.primary)
         .text('PAYMENT BREAKDOWN', 40, currentY);
      
      currentY += 20;

      // Table Header
      doc.rect(40, currentY, 515, 25).fill(colors.dark);
      doc.fillColor(colors.white).fontSize(9).font('Helvetica-Bold');
      doc.text('FEE DESCRIPTION', 50, currentY + 8);
      doc.text('AMOUNT (NGN)', 450, currentY + 8, { align: 'right' });
      
      currentY += 25;

      // Table Content
      const items = Array.isArray(payment.items) ? payment.items : null;
      const feeName = items && items.length > 0 
          ? items.map(i => i.fee_category).join(', ') 
          : (fee.fee_category || 'Tuition Fee');
      
      doc.fillColor(colors.dark).fontSize(10).font('Helvetica');
      const startY = currentY + 10;
      
      // Print Fee Name (wrapped)
      doc.text(feeName, 50, startY, { width: 350 });
      const textHeight = doc.heightOfString(feeName, { width: 350 });
      
      // Print Amount
      const fullAmount = items && items.length > 0
        ? items.reduce((sum, it) => sum + Number(it.amount || 0), 0)
        : Number(fee.amount || 0);

      doc.text(fullAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }), 450, startY, { align: 'right' });
      
      // Update Y based on content height
      currentY = startY + Math.max(textHeight, 15) + 10;
      drawLine(currentY);

      // 6. Summary Section (Compact & Aligned)
      currentY += 20;
      
      // Summary Box Background
      const summaryBoxHeight = isBalanceSettlement ? 130 : 110;
      // Calculate start of summary box to be right aligned or full width? 
      // Let's make it a compact right-aligned card for better visual hierarchy
      const summaryWidth = 280;
      const summaryX = 555 - summaryWidth;
      
      doc.roundedRect(summaryX, currentY, summaryWidth, summaryBoxHeight, 8).fill(colors.light);
      doc.strokeColor(colors.primary).lineWidth(0.5)
         .moveTo(summaryX, currentY).lineTo(summaryX + summaryWidth, currentY).stroke(); // Top border

      let sumY = currentY + 15;
      const labelX = summaryX + 15;
      const valX = 555 - 15;

      // Helper for summary rows
      const printSummaryRow = (label, value, isBold = false, color = colors.dark, size = 10) => {
        doc.fillColor(colors.dark).fontSize(size).font('Helvetica').text(label, labelX, sumY);
        doc.fillColor(color).fontSize(size + 1).font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .text(value, summaryX, sumY, { width: summaryWidth - 30, align: 'right' });
        sumY += 22;
      };

      printSummaryRow('Total Fees:', `NGN ${fullAmount.toLocaleString()}`, true);
      
      const amountPaid = Number(payment.amount_paid || 0);
      printSummaryRow('Amount Paid:', `NGN ${amountPaid.toLocaleString()}`, true, colors.success);
      
      const storedPct = Number(payment.percentage_paid ?? 0);
      const computedPct = fullAmount > 0 ? (amountPaid / fullAmount) * 100 : 0;
      const percentageDisplay = Math.round(Number.isFinite(storedPct) && storedPct > 0 ? storedPct : computedPct);
      printSummaryRow('Percentage:', `${percentageDisplay}%`, false);

      drawLine(sumY);
      sumY += 10;

      // Balance
      const balance = Math.max(0, fullAmount - amountPaid);
      if (balance > 0 && !isBalanceSettlement) {
         doc.fillColor(colors.dark).fontSize(11).font('Helvetica-Bold').text('Balance Due:', labelX, sumY);
         doc.fillColor(colors.danger).fontSize(14).font('Helvetica-Bold')
            .text(`NGN ${balance.toLocaleString()}`, summaryX, sumY - 2, { width: summaryWidth - 30, align: 'right' });
      } else {
         doc.fillColor(colors.success).fontSize(12).font('Helvetica-Bold')
            .text('FULLY PAID', summaryX, sumY, { width: summaryWidth - 30, align: 'right' });
      }

      // Balance Note
      if (isBalanceSettlement) {
         sumY += 25;
         doc.fontSize(8).font('Helvetica-Oblique').fillColor(colors.dark)
            .text('* Balance payment completed.', labelX, sumY, { width: summaryWidth - 30 });
      }

      // 7. Footer & Security (Dynamic Position)
      const footerY = Math.min(sumY + 60, 750);
      
      // Top border for footer
      doc.lineWidth(2).strokeColor(colors.primary).moveTo(40, footerY - 20).lineTo(555, footerY - 20).stroke();

      // QR Code
      doc.image(qrCodeBuffer, 40, footerY, { width: 60, height: 60 });
      
      // Footer Text Info
      const footerTextX = 120;
      doc.fillColor(colors.dark).fontSize(8).font('Helvetica-Bold')
         .text('SCAN TO VERIFY', 40, footerY + 65, { width: 60, align: 'center' });
      
      doc.fontSize(9).font('Helvetica-Bold')
         .text('OFFICIAL DOCUMENT - NIGERIAN BRITISH UNIVERSITY', footerTextX, footerY + 5);
      
      doc.fontSize(8).font('Helvetica').fillColor(colors.dark)
         .text('This receipt is automatically generated and serves as official proof of payment.', footerTextX, footerY + 20);
      doc.text('Verification of this document can be performed by scanning the QR code.', footerTextX, footerY + 32);
      
      // Hash Info
      doc.font('Helvetica-Bold').fillColor(colors.primary)
         .text(`DOC ID: ${securityHash}  |  REF: ${payment.transaction_ref}`, footerTextX, footerY + 48);
      
      // Generated Timestamp
      doc.font('Helvetica').fillColor('#9CA3AF')
         .text(`Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}`, 555 - 200, footerY + 65, { align: 'right', width: 200 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}



async function uploadToDrive(buffer, filename) {
  // Guard: ensure Drive credentials are configured
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    throw new Error('Google Drive credentials not configured');
  }
  const auth = createOAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType: 'application/pdf',
      parents: process.env.GOOGLE_DRIVE_PARENT_FOLDER ? [process.env.GOOGLE_DRIVE_PARENT_FOLDER] : undefined,
    },
    media: {
      mimeType: 'application/pdf',
      // googleapis expects a stream; convert Buffer to Readable to avoid
      // errors like: "part.body.pipe is not a function"
      body: Readable.from(buffer),
    },
    fields: 'id',
  });

  const fileId = res.data.id;
  // Make file readable via link
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch (e) {
    // ignore permission errors
  }
  const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;
  return { fileId, driveUrl };
}

async function generateAndUploadReceipt({ payment, fee, program, session, isBalanceSettlement = false }) {
  const buffer = await generateReceiptPDFBuffer({ payment, fee, program, session, isBalanceSettlement });
  const filename = `NBU-Receipt-${payment.transaction_ref}.pdf`;
  try {
    const { driveUrl } = await uploadToDrive(buffer, filename);
    return { driveUrl, buffer, filename };
  } catch (err) {
    console.error('❌ Receipt upload failed:', err?.message || err);
    // Fallback: still return buffer and filename so email can attach
    return { driveUrl: undefined, buffer, filename };
  }
}

async function verifyDriveConnection() {
  try {
    const auth = createOAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.list({ pageSize: 1, fields: 'files(id)' });
    console.log('✅ Connected to Google Drive');
    return true;
  } catch (err) {
    console.error('❌ Google Drive connection failed:', err.message);
    return false;
  }
}

module.exports = { generateAndUploadReceipt, verifyDriveConnection };
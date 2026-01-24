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

async function generateReceiptPDFBuffer({ payment, fee, program, isBalanceSettlement = false }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      const chunks = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // University colors and modern palette
      const primaryRed = '#E74C3C';
      const primaryBlue = '#3498DB';
      const darkBlue = '#2980B9';
      const white = '#FFFFFF';
      const darkGray = '#2C3E50';
      const lightGray = '#ECF0F1';
      const accentGold = '#F39C12';

      // Extract items (multi-fee) once and reuse
      const items = Array.isArray(payment.items) ? payment.items : undefined;

      // Generate security features
      const securityHash = generateSecurityHash(payment, fee);
      const qrCodeDataUrl = await generateQRCode(payment);
      const qrCodeBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');

      // Create gradient-like effect with multiple rectangles
      for (let i = 0; i < 5; i++) {
        const opacity = 0.1 - (i * 0.02);
        doc.save();
        doc.fillColor(primaryBlue).opacity(opacity);
        doc.rect(0, 0, doc.page.width, doc.page.height).fill();
        doc.restore();
      }

      // Security watermark pattern
      doc.save();
      for (let x = 0; x < doc.page.width; x += 100) {
        for (let y = 0; y < doc.page.height; y += 100) {
          doc.fillColor(primaryBlue)
             .opacity(0.03)
             .fontSize(8)
             .font('Helvetica')
             .text('NBU-OFFICIAL', x, y, { rotate: 45 });
        }
      }
      doc.restore();

      // Main "PAID" watermark
      doc.save();
      doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.fillColor(accentGold)
         .opacity(0.08)
         .fontSize(150)
         .font('Helvetica-Bold')
         .text('PAID', 0, doc.page.height / 2 - 75, {
           align: 'center',
           width: doc.page.width
         });
      doc.restore();

      // Modern header with gradient effect
      const headerHeight = 140;
      doc.rect(0, 0, doc.page.width, headerHeight).fill(darkGray);
      doc.rect(0, headerHeight - 20, doc.page.width, 20).fill(primaryBlue);

      // Security border pattern
      for (let i = 0; i < doc.page.width; i += 10) {
        doc.rect(i, 0, 5, 5).fill(i % 20 === 0 ? accentGold : primaryRed);
        doc.rect(i, doc.page.height - 5, 5, 5).fill(i % 20 === 0 ? accentGold : primaryRed);
      }

      // Logo - increased size
      let logoExists = false;
      try {
        const logoPath = path.join(__dirname, '..', 'asserts', 'logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 40, 20, { width: 100, height: 100 });
          logoExists = true;
        }
      } catch (logoError) {
        console.warn('Could not load university logo:', logoError.message);
      }

      // University header text - shifted much more to the right for better logo spacing
      const headerTextX = logoExists ? 180 : 50;
      
      doc.fillColor(white)
         .fontSize(20)
         .font('Helvetica-Bold')
         .text('NIGERIAN BRITISH UNIVERSITY', headerTextX, 30);
      
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor(lightGray)
         .text('OFFICIAL PAYMENT RECEIPT', headerTextX, 55);

      doc.fontSize(11)
         .fillColor(white)
         .text('KM10  PortHacourt Road/ Aba Expressway, Abia State, Nigeria', headerTextX, 75);

      // Security hash in header with better positioning
      doc.fontSize(9)
         .fillColor(accentGold)
         .font('Helvetica-Bold')
         .text(`Security Code: ${securityHash}`, headerTextX, 95);

      // Payment reference section with modern design
      const refY = 170;
      doc.roundedRect(40, refY, doc.page.width - 80, 70, 10).fill(lightGray);
      doc.roundedRect(50, refY + 10, 8, 50, 4).fill(primaryBlue);
      
      doc.fillColor(darkGray)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Payment Reference Number', 75, refY + 15);
      
      doc.fontSize(20)
         .fillColor(primaryRed)
         .text(`NBU-${payment.transaction_ref}`, 75, refY + 35);

      // Student information cards
      const cardY = 270;
      const cardHeight = 210; // extend card height to create more vertical space
      
      // Left card - Student Details
      doc.roundedRect(40, cardY, (doc.page.width - 100) / 2, cardHeight, 8).fill(white);
      doc.roundedRect(40, cardY, (doc.page.width - 100) / 2, 30, 8).fill(primaryBlue);
      
      doc.fillColor(white)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('STUDENT INFORMATION', 50, cardY + 8);

      let leftY = cardY + 45;
      const leftX = 50;
      
      // Student details
      doc.fillColor(darkGray).fontSize(10).font('Helvetica').text('Student Name:', leftX, leftY);
      doc.fontSize(12).font('Helvetica-Bold').text(payment.student_name || 'N/A', leftX, leftY + 12);
      leftY += 35;

      doc.fontSize(10).font('Helvetica').text('Program:', leftX, leftY);
      doc.fontSize(11).font('Helvetica-Bold').text(program.program_name, leftX, leftY + 12, { width: 180 });
      leftY += 35;

      doc.fontSize(10).font('Helvetica').text('Fee Category:', leftX, leftY);
      // Render fee names as responsive chips that wrap nicely
      const chipStartY = leftY + 8;
      let chipX = leftX;
      let chipY = chipStartY + 14;
      const chipPaddingX = 6;
      const chipPaddingY = 3;
      const chipGap = 4;
      const chipMaxWidth = ((doc.page.width - 100) / 2) - 40; // widen chip row width within card

      const feeNames = (items && items.length > 0)
        ? items.map((it) => String(it.fee_category || 'Fee')).filter(Boolean)
        : [String(fee.fee_category || 'N/A')];

      doc.fontSize(10).font('Helvetica-Bold');
      feeNames.forEach((name) => {
        const w = doc.widthOfString(name) + chipPaddingX * 2;
        const h = 14 + chipPaddingY;
        if (chipX + w > leftX + chipMaxWidth) {
          chipX = leftX;
          chipY += h + chipGap;
        }
        doc.roundedRect(chipX, chipY, w, h, 5).fill('#ECF0F1');
        doc.fillColor('#2C3E50').text(name, chipX + chipPaddingX, chipY + chipPaddingY - 1);
        doc.fillColor(darkGray); // reset
        chipX += w + chipGap;
      });
      leftY = chipY + 28; // push Payment Method further down below chips

      doc.fontSize(10).font('Helvetica').text('Payment Method:', leftX, leftY);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(primaryBlue).text('Online Payment', leftX, leftY + 12);

      // Right card - Payment Details
      const rightCardX = 40 + (doc.page.width - 100) / 2 + 20;
      doc.roundedRect(rightCardX, cardY, (doc.page.width - 100) / 2, cardHeight, 8).fill(white);
      doc.roundedRect(rightCardX, cardY, (doc.page.width - 100) / 2, 30, 8).fill(primaryRed);
      
      doc.fillColor(white)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('PAYMENT DETAILS', rightCardX + 10, cardY + 8);

      let rightY = cardY + 45;
      const rightX = rightCardX + 10;

      doc.fillColor(darkGray).fontSize(10).font('Helvetica').text('Payment Date:', rightX, rightY);
      doc.fontSize(12).font('Helvetica-Bold').text(new Date(payment.payment_date).toLocaleDateString('en-GB'), rightX, rightY + 12);
      rightY += 35;

      doc.fontSize(10).font('Helvetica').text('Transaction Reference:', rightX, rightY);
      doc.fontSize(11).font('Helvetica-Bold').text(payment.transaction_ref, rightX, rightY + 12, { width: 180 });
      rightY += 35;

      doc.fontSize(10).font('Helvetica').text('Payment Status:', rightX, rightY);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#27AE60').text('SUCCESSFUL', rightX, rightY + 12);
      rightY += 35;

      doc.fillColor(darkGray).fontSize(10).font('Helvetica').text('Generated:', rightX, rightY);
      doc.fontSize(11).font('Helvetica-Bold').text(new Date().toLocaleDateString('en-GB'), rightX, rightY + 12);

      // Remove fee breakdown table for a cleaner appearance.
      // Keep space consistent regardless of multi-fee to avoid layout shifts.
      let tableY = 440;

      // Amount section with modern styling
      // Lift summary section for better visual balance since table was removed
      // Position payment summary so its bottom edge meets the footer border
      const footerY = 660; // footer start line
      const summaryHeight = 110;
      const amountY = footerY - summaryHeight - 40; // Shifted up to create more breathing room from footer
      doc.roundedRect(40, amountY, doc.page.width - 80, 110, 12).fill(darkGray);
      
      const amountPaid = Number(payment.amount_paid || 0);
      // When multiple fees are present, full amount equals sum of items; otherwise fee.amount
      const fullAmount = items && items.length > 0
        ? items.reduce((sum, it) => sum + Number(it.amount || 0), 0)
        : Number(fee.amount || 0);
      // Accurate percentage; prefer stored percentage_paid if available
      const storedPct = typeof payment.percentage_paid === 'number' || typeof payment.percentage_paid === 'string'
        ? Number(payment.percentage_paid)
        : NaN;
      const computedPct = fullAmount > 0 ? (amountPaid / fullAmount) * 100 : 0;
      const percentageDisplay = Math.min(100, Math.max(0, Math.round(Number.isFinite(storedPct) ? storedPct : computedPct)));
      
      doc.fillColor(white)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('PAYMENT SUMMARY', 60, amountY + 20);

      // Balance payment notice when generating receipt after balance settlement
      if (isBalanceSettlement) {
        doc.fontSize(10).font('Helvetica').fillColor(white)
          .text('This is a balance payment. All fees are fully paid; no pending balance.', 60, amountY + 38, { width: doc.page.width - 120 });
      }

      const baseY = isBalanceSettlement ? amountY + 60 : amountY + 40;
      doc.fontSize(14)
         .font('Helvetica')
         .text('Total Fee Amount:', 60, baseY);
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor(accentGold)
         .text(`₦${fullAmount.toLocaleString()}`, doc.page.width - 200, baseY - 5);

      doc.fillColor(white)
         .fontSize(14)
         .font('Helvetica')
         .text('Amount Paid:', 60, baseY + 25);
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#27AE60')
         .text(`₦${amountPaid.toLocaleString()}`, doc.page.width - 200, baseY + 20);

      // Percentage paid
      doc.fillColor(white)
         .fontSize(14)
         .font('Helvetica')
         .text('Percentage Paid:', 60, baseY + 48);
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor(percentageDisplay === 100 ? '#27AE60' : '#F39C12')
         .text(`${percentageDisplay}%`, doc.page.width - 200, baseY + 43);

      // Security footer
      // footerY defined above to align summary to border
      doc.rect(0, footerY, doc.page.width, doc.page.height - footerY).fill(lightGray);
      
      // Security pattern in footer
      for (let i = 0; i < doc.page.width; i += 20) {
        doc.rect(i, footerY, 10, 5).fill(i % 40 === 0 ? primaryBlue : primaryRed);
      }

      // QR Code in bottom left of footer
      doc.image(qrCodeBuffer, 50, footerY + 15, { width: 60, height: 60 });
      doc.fontSize(8)
         .fillColor(darkGray)
         .font('Helvetica-Bold')
         .text('Scan to Verify', 50, footerY + 80, { width: 60, align: 'center' });

      doc.fillColor(darkGray)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('🔒 OFFICIAL DOCUMENT - NIGERIAN BRITISH UNIVERSITY', 130, footerY + 20, { align: 'left' });
      
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Generated: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}`, 130, footerY + 40, { align: 'left' });
      
      doc.text('This receipt is digitally secured and can be verified using the QR code', 130, footerY + 55, { align: 'left' });
      
      doc.fontSize(8)
         .fillColor(primaryBlue)
         .text(`Document ID: ${securityHash} | Verification: ${process.env.FRONTEND_URL}/verify`, 130, footerY + 75, { align: 'left' });

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

async function generateAndUploadReceipt({ payment, fee, program, isBalanceSettlement = false }) {
  const buffer = await generateReceiptPDFBuffer({ payment, fee, program, isBalanceSettlement });
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
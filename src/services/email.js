const nodemailer = require('nodemailer');

const useGmail =
  (process.env.EMAIL_SERVICE || '').toLowerCase() === 'gmail' ||
  (process.env.EMAIL_HOST || '').includes('gmail');

let transporter;
if (useGmail) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use an App Password when 2FA is enabled
    },
  });
  console.log('📧 Using Gmail as mail transport');
} else {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

// Verify the connection configuration once at startup
transporter
  .verify()
  .then(() => console.log(`✅ Mail transport ready${useGmail ? ' (Gmail)' : ''}`))
  .catch((err) => console.error('❌ Mail transport verification failed:', err.message));

async function sendMail({ to, subject, text, html, attachments }) {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const info = await transporter.sendMail({ from, to, subject, text, html, attachments });
  console.log(`✅ Email sent successfully to ${to} (messageId=${info.messageId})`);
  return info;
}

module.exports = { sendMail };
const nodemailer = require('nodemailer');
const axios = require('axios');

const useGmail =
  (process.env.EMAIL_SERVICE || '').toLowerCase() === 'gmail' ||
  (process.env.EMAIL_HOST || '').includes('gmail');
const useResend = Boolean(process.env.RESEND_API_KEY);

let transporter;
if (!useResend) {
  // Configure SMTP (Gmail or custom)
  const connectionTimeout = Number(process.env.EMAIL_CONNECTION_TIMEOUT || 8000);
  const greetingTimeout = Number(process.env.EMAIL_GREETING_TIMEOUT || 8000);
  const socketTimeout = Number(process.env.EMAIL_SOCKET_TIMEOUT || 10000);
  const pool = String(process.env.EMAIL_POOL || '').toLowerCase() === 'true';

  if (useGmail) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Use an App Password when 2FA is enabled
      },
      pool,
      connectionTimeout,
      greetingTimeout,
      socketTimeout,
    });
    console.log('📧 Using Gmail SMTP as mail transport');
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      pool,
      connectionTimeout,
      greetingTimeout,
      socketTimeout,
    });
    console.log('📧 Using SMTP mail transport');
  }
} else {
  console.log('📧 Using Resend HTTP mail transport');
}

// Verify SMTP connection configuration once at startup (skip when using Resend or when disabled)
const skipVerify = String(process.env.EMAIL_SKIP_VERIFY || '').toLowerCase() === 'true';
if (!useResend && transporter) {
  if (skipVerify) {
    console.log('⚠️  Skipping SMTP transport verification (EMAIL_SKIP_VERIFY=true)');
  } else {
    transporter
      .verify()
      .then(() => console.log(`✅ Mail transport ready${useGmail ? ' (Gmail)' : ''}`))
      .catch((err) => console.warn('❌ Mail transport verification failed:', err.message));
  }
}

async function sendMail({ to, subject, text, html, attachments }) {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@localhost';

  if (useResend) {
    // Use Resend HTTP API to avoid SMTP port restrictions on some hosts
    const apiKey = process.env.RESEND_API_KEY;
    const url = 'https://api.resend.com/emails';
    const payload = {
      from,
      to,
      subject,
      html,
      text,
      attachments: Array.isArray(attachments)
        ? attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content)
              ? a.content.toString('base64')
              : typeof a.content === 'string'
                ? Buffer.from(a.content).toString('base64')
                : a.content,
          }))
        : undefined,
    };
    try {
      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: Number(process.env.EMAIL_HTTP_TIMEOUT || 10000),
      });
      const id = res.data?.id || res.data?.data?.id;
      console.log(`✅ Email sent successfully to ${to} (id=${id || 'resend'})`);
      return { messageId: id || 'resend' };
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Resend email error';
      console.error('❌ Email send failed (Resend):', msg);
      throw new Error(msg);
    }
  }

  // Default SMTP path
  const info = await transporter.sendMail({ from, to, subject, text, html, attachments });
  console.log(`✅ Email sent successfully to ${to} (messageId=${info.messageId})`);
  return info;
}

module.exports = { sendMail };
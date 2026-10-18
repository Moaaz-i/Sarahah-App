import nodemailer from 'nodemailer';
import env from '../config/env.js';

/**
 * Minimal SMTP mailer.
 * - Uses a single shared transport (reuses the connection pool).
 * - When SMTP is not configured, sendMail resolves with { skipped:true } so
 *   callers can continue (useful in dev / tests) without any error.
 * - Never throws to the caller: send failures are logged and swallowed so a
 *   transient SMTP hiccup never breaks the API response.
 */

let transporter = null;

const getTransporter = () => {
  if (!env.smtp.enabled) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 20,
  });

  return transporter;
};

/**
 * Send an email. Returns { sent:boolean, skipped:boolean }.
 * Never throws.
 */
export const sendMail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();
  if (!transport) {
    return { sent: false, skipped: true, reason: 'SMTP not configured' };
  }

  try {
    await transport.sendMail({
      from: env.smtp.from,
      to,
      subject,
      html,
      text,
    });
    return { sent: true, skipped: false };
  } catch (err) {
    // Do not crash the request — log and move on.
    console.error('[mailer] sendMail failed:', err?.message || err);
    return { sent: false, skipped: false, reason: err?.message || 'send failed' };
  }
};

export default sendMail;

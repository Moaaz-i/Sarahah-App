/**
 * HTML email templates (Arabic, RTL).
 * Each returns { subject, html, text }.
 */

const WRAP = (title, bodyHtml) => `
<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0b141a;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b141a;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111b21;border-radius:16px;overflow:hidden;border:1px solid #222f36;">
        <tr><td style="background:#00a884;padding:24px 28px;">
          <div style="font-size:22px;font-weight:700;color:#ffffff;">صارحني</div>
        </td></tr>
        <tr><td style="padding:28px;color:#e9edef;font-size:15px;line-height:1.7;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #222f36;color:#667781;font-size:12px;">
          إذا لم تطلب هذه الرسالة، تجاهلها بأمان.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const codeBlock = (code) => `
  <div style="margin:20px 0;padding:20px;background:#1f2c34;border-radius:12px;text-align:center;">
    <div style="font-size:34px;font-weight:800;letter-spacing:12px;color:#00a884;font-family:monospace;">${code}</div>
    <div style="margin-top:8px;color:#8696a0;font-size:13px;">${code.length} أرقام</div>
  </div>`;

export const passwordResetTemplate = (name, code, ttlMinutes) => ({
  subject: 'استعادة كلمة المرور — صارحني',
  html: WRAP(
    'استعادة كلمة المرور',
    `
    <p>مرحبًا ${name || ''}،</p>
    <p>تلقينا طلبًا لاستعادة كلمة المرور لحسابك. استخدم الرمز التالي:</p>
    ${codeBlock(code)}
    <p>صالح لمدة <strong>${ttlMinutes} دقيقة</strong>.</p>
    <p>إذا لم تطلب هذا، يمكنك تجاهل هذه الرسالة — لن يتغير شيء.</p>
    `,
  ),
  text: `استعادة كلمة المرور — صارحني\nرمز التحقق: ${code}\nصالح لمدة ${ttlMinutes} دقيقة.`,
});

export const emailConfirmTemplate = (name, code, ttlMinutes) => ({
  subject: 'تأكيد البريد الإلكتروني — صارحني',
  html: WRAP(
    'تأكيد البريد الإلكتروني',
    `
    <p>مرحبًا ${name || ''}،</p>
    <p>أضفنا بريدك الإلكتروني إلى حسابك. استخدم الرمز التالي للتأكيد:</p>
    ${codeBlock(code)}
    <p>صالح لمدة <strong>${ttlMinutes} دقيقة</strong>.</p>
    <p>إذا لم تطلب هذا، تجاهل هذه الرسالة.</p>
    `,
  ),
  text: `تأكيد البريد الإلكتروني — صارحني\nرمز التحقق: ${code}\nصالح لمدة ${ttlMinutes} دقيقة.`,
});

export const twoFactorEnableTemplate = (name, code, ttlMinutes) => ({
  subject: 'تفعيل التحقق بخطوتين (2-Step Verification) — صارحني',
  html: WRAP(
    'تفعيل التحقق بخطوتين',
    `
    <p>مرحبًا ${name || ''}،</p>
    <p>تلقينا طلبًا لتفعيل ميزة التحقق بخطوتين لحسابك. استخدم رمز التأكيد التالي لإكمال التفعيل:</p>
    ${codeBlock(code)}
    <p>هذا الرمز صالح لمدة <strong>${ttlMinutes} دقيقة</strong>.</p>
    <p>إذا لم تطلب هذا الإجراء، يُرجى تغيير كلمة مرورك فورًا لحماية حسابك.</p>
    `,
  ),
  text: `تفعيل التحقق بخطوتين — صارحني\nرمز التأكيد: ${code}\nصالح لمدة ${ttlMinutes} دقيقة.`,
});

export const twoFactorLoginTemplate = (name, code, ttlMinutes) => ({
  subject: 'رمز تسجيل الدخول بالتحقق بخطوتين — صارحني',
  html: WRAP(
    'رمز تسجيل الدخول',
    `
    <p>مرحبًا ${name || ''}،</p>
    <p>محاولة تسجيل دخول جديدة لحسابك تتطلب التحقق بخطوتين. استخدم الرمز التالي لتأكيد الدخول:</p>
    ${codeBlock(code)}
    <p>صالح للاستخدام لمرة واحدة خلال <strong>${ttlMinutes} دقيقة</strong>.</p>
    <p>إذا لم تكن أنت من يحاول الدخول، فاحذر ولا تشارك هذا الرمز مع أي شخص.</p>
    `,
  ),
  text: `رمز تأكيد الدخول — صارحني\nرمز التحقق: ${code}\nصالح لمدة ${ttlMinutes} دقيقة.`,
});

export default {
  passwordResetTemplate,
  emailConfirmTemplate,
  twoFactorEnableTemplate,
  twoFactorLoginTemplate,
};

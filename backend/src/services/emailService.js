/**
 * Brevo Email Service
 * Sends transactional emails using the Brevo (Sendinblue) HTTP API v3.
 * No SDK dependency — uses native fetch().
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Send an OTP verification email.
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} otp - The plain 6-digit OTP
 */
export async function sendOtpEmail(recipientEmail, recipientName, otp) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'CloudVitta';

  if (!apiKey || !senderEmail) {
    console.error('[EmailService] BREVO_API_KEY or BREVO_SENDER_EMAIL is not configured');
    throw new Error('Email service is not configured. Please set BREVO_API_KEY and BREVO_SENDER_EMAIL.');
  }

  const digits = otp.split('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0e1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0e1a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #13182b 0%, #1a1f35 100%); border-radius: 16px; border: 1px solid rgba(99, 102, 241, 0.2); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); width: 48px; height: 48px; border-radius: 12px; line-height: 48px; font-size: 24px; margin-bottom: 16px;">⚡</div>
              <h1 style="color: #f1f5f9; font-size: 24px; margin: 0 0 8px;">Verify Your Email</h1>
              <p style="color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.5;">
                Hi ${recipientName}, welcome to CloudVitta!<br>
                Enter this code to activate your account.
              </p>
            </td>
          </tr>
          <!-- OTP Code -->
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  ${digits.map(d => `
                  <td style="padding: 0 4px;">
                    <div style="width: 48px; height: 56px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 10px; line-height: 56px; text-align: center; font-size: 28px; font-weight: 700; color: #818cf8; font-family: 'Courier New', monospace;">${d}</div>
                  </td>`).join('')}
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background: rgba(99, 102, 241, 0.15);"></div>
            </td>
          </tr>
          <!-- Footer info -->
          <tr>
            <td style="padding: 24px 32px 32px; text-align: center;">
              <p style="color: #64748b; font-size: 13px; margin: 0 0 6px; line-height: 1.5;">
                This code expires in <strong style="color: #94a3b8;">10 minutes</strong>.
              </p>
              <p style="color: #475569; font-size: 12px; margin: 0; line-height: 1.5;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
        <!-- Brand footer -->
        <p style="color: #334155; font-size: 11px; margin-top: 24px;">
          &copy; ${new Date().getFullYear()} CloudVitta &mdash; Cloud Object Storage
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: recipientEmail, name: recipientName }],
    subject: `${otp} is your CloudVitta verification code`,
    htmlContent,
  };

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[EmailService] Brevo API error:', response.status, errorData);
      throw new Error(`Failed to send email: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    console.log(`[EmailService] OTP email sent to ${recipientEmail} (messageId: ${result.messageId})`);
    return result;
  } catch (err) {
    if (err.message.startsWith('Failed to send email')) throw err;
    console.error('[EmailService] Network error:', err.message);
    throw new Error('Unable to send verification email. Please try again later.');
  }
}

/**
 * Send a password reset OTP email.
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} otp - The plain 6-digit OTP
 */
export async function sendPasswordResetEmail(recipientEmail, recipientName, otp) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'CloudVitta';

  if (!apiKey || !senderEmail) {
    console.error('[EmailService] BREVO_API_KEY or BREVO_SENDER_EMAIL is not configured');
    throw new Error('Email service is not configured. Please set BREVO_API_KEY and BREVO_SENDER_EMAIL.');
  }

  const digits = otp.split('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0e1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0e1a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #13182b 0%, #1a1f35 100%); border-radius: 16px; border: 1px solid rgba(99, 102, 241, 0.2); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); width: 48px; height: 48px; border-radius: 12px; line-height: 48px; font-size: 24px; margin-bottom: 16px;">🔑</div>
              <h1 style="color: #f1f5f9; font-size: 24px; margin: 0 0 8px;">Reset Your Password</h1>
              <p style="color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.5;">
                Hi ${recipientName},<br>
                Enter this code to reset your CloudVitta password.
              </p>
            </td>
          </tr>
          <!-- OTP Code -->
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  ${digits.map(d => `
                  <td style="padding: 0 4px;">
                    <div style="width: 48px; height: 56px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 10px; line-height: 56px; text-align: center; font-size: 28px; font-weight: 700; color: #818cf8; font-family: 'Courier New', monospace;">${d}</div>
                  </td>`).join('')}
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background: rgba(99, 102, 241, 0.15);"></div>
            </td>
          </tr>
          <!-- Footer info -->
          <tr>
            <td style="padding: 24px 32px 32px; text-align: center;">
              <p style="color: #64748b; font-size: 13px; margin: 0 0 6px; line-height: 1.5;">
                This code expires in <strong style="color: #94a3b8;">10 minutes</strong>.
              </p>
              <p style="color: #475569; font-size: 12px; margin: 0; line-height: 1.5;">
                If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
              </p>
            </td>
          </tr>
        </table>
        <!-- Brand footer -->
        <p style="color: #334155; font-size: 11px; margin-top: 24px;">
          &copy; ${new Date().getFullYear()} CloudVitta &mdash; Cloud Object Storage
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: recipientEmail, name: recipientName }],
    subject: `${otp} is your CloudVitta password reset code`,
    htmlContent,
  };

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[EmailService] Brevo API error:', response.status, errorData);
      throw new Error(`Failed to send email: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    console.log(`[EmailService] Password reset email sent to ${recipientEmail} (messageId: ${result.messageId})`);
    return result;
  } catch (err) {
    if (err.message.startsWith('Failed to send email')) throw err;
    console.error('[EmailService] Network error:', err.message);
    throw new Error('Unable to send password reset email. Please try again later.');
  }
}

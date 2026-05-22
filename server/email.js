const nodemailer = require('nodemailer');

// Email configuration - supports Gmail and custom SMTP
function createTransporter() {
  // For Gmail: Use an App Password (not your regular password)
  // 1. Enable 2FA on your Google account
  // 2. Generate App Password at https://myaccount.google.com/apppasswords
  // 3. Set EMAIL_USER and EMAIL_PASSWORD in .env

  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  if (!emailUser || !emailPassword) {
    console.warn('⚠️  Email notifications disabled: EMAIL_USER or EMAIL_PASSWORD not set in .env');
    console.warn('To enable email notifications:');
    console.warn('1. Add EMAIL_USER=your-email@gmail.com to .env');
    console.warn('2. Add EMAIL_PASSWORD=your-app-password to .env');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPassword
    }
  });
}

async function sendNotificationEmail(recipientEmail, clientName, remark, followupDateTime, minutesBefore) {
  try {
    const transporter = createTransporter();
    if (!transporter) return false;

    const subject = `CRM Reminder: Follow-up in ${minutesBefore} minutes`;

    const htmlBody = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #f1f5f9 0%, #e0e7ff 100%);">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">

          <h2 style="color: #1e293b; margin-bottom: 16px; font-size: 20px; font-weight: 700;">
            ⏰ Follow-up Reminder
          </h2>

          <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #2563eb; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #1e293b; font-weight: 600;">
              Follow-up in <span style="color: #dc2626; font-size: 18px;">${minutesBefore} minutes</span>
            </p>
            <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">
              ${followupDateTime}
            </p>
          </div>

          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
            <h3 style="color: #64748b; text-transform: uppercase; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 8px;">
              Client Details
            </h3>
            <p style="margin: 8px 0; color: #1e293b; font-weight: 600; font-size: 16px;">
              ${clientName}
            </p>
            <h3 style="color: #64748b; text-transform: uppercase; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; margin-top: 12px; margin-bottom: 8px;">
              Remark
            </h3>
            <p style="margin: 8px 0; color: #1e293b; line-height: 1.6;">
              ${remark || '(No remark added)'}
            </p>
          </div>

          <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 12px; border-radius: 8px; border-left: 4px solid #16a34a; margin-bottom: 20px;">
            <p style="margin: 0; color: #166534; font-size: 14px;">
              ✓ This is an automated reminder from your CRM Dashboard
            </p>
          </div>

          <p style="margin: 0; color: #64748b; font-size: 12px; text-align: center;">
            CRM Dashboard © 2026 | All Rights Reserved
          </p>

        </div>
      </div>
    `;

    const textBody = `
CRM Reminder: Follow-up in ${minutesBefore} minutes

Client: ${clientName}
Follow-up Date/Time: ${followupDateTime}
Remark: ${remark || '(No remark added)'}

This is an automated reminder from your CRM Dashboard.
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipientEmail,
      subject: subject,
      text: textBody,
      html: htmlBody
    });

    console.log(`[EMAIL] Sent ${minutesBefore}min reminder to ${recipientEmail} for ${clientName}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send email to ${recipientEmail}:`, error.message);
    return false;
  }
}

module.exports = {
  sendNotificationEmail
};

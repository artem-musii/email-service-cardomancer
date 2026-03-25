-- Update existing welcome template with rich HTML, subject, and fromName
UPDATE email_templates
SET
  subject = 'Welcome to Cardomancer',
  from_name = 'Cardomancer',
  html = '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Welcome to Cardomancer</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px;font-size:16px;color:#18181b;line-height:1.6;">Hi {{name}},</p>
          <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">Your account has been created and you''re all set to start exploring. We''re glad to have you on board.</p>
          <p style="margin:0 0 24px;font-size:16px;color:#3f3f46;line-height:1.6;">Your registered email is <strong style="color:#18181b;">{{email}}</strong>.</p>
          <p style="margin:0;font-size:14px;color:#71717a;line-height:1.5;">If you didn''t create this account, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:13px;color:#a1a1aa;">Cardomancer</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
  variables = ARRAY['name', 'email'],
  max_retries = 3,
  updated_at = NOW()
WHERE name = 'welcome';

-- Insert welcome if it doesn't exist yet (safety net)
INSERT INTO email_templates (name, subject, from_name, html, variables, max_retries)
SELECT 'welcome', 'Welcome to Cardomancer', 'Cardomancer',
'<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Welcome to Cardomancer</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px;font-size:16px;color:#18181b;line-height:1.6;">Hi {{name}},</p>
          <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">Your account has been created and you''re all set to start exploring. We''re glad to have you on board.</p>
          <p style="margin:0 0 24px;font-size:16px;color:#3f3f46;line-height:1.6;">Your registered email is <strong style="color:#18181b;">{{email}}</strong>.</p>
          <p style="margin:0;font-size:14px;color:#71717a;line-height:1.5;">If you didn''t create this account, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:13px;color:#a1a1aa;">Cardomancer</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
ARRAY['name', 'email'], 3
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'welcome');

-- Insert login-success template
INSERT INTO email_templates (name, subject, from_name, html, variables, max_retries)
VALUES ('login-success', 'New sign-in to your account', 'Cardomancer',
'<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">New Sign-In Detected</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px;font-size:16px;color:#18181b;line-height:1.6;">Hi {{name}},</p>
          <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">We noticed a new sign-in to your Cardomancer account (<strong style="color:#18181b;">{{email}}</strong>).</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f9fafb;border-radius:8px;border:1px solid #e4e4e7;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Signed in at</p>
              <p style="margin:0;font-size:15px;color:#18181b;font-weight:600;">{{loginTime}}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">For your security, all previous sessions have been automatically signed out. Only your current session is now active.</p>
          <p style="margin:0;font-size:14px;color:#71717a;line-height:1.5;">If this wasn''t you, please reset your password immediately to secure your account.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:13px;color:#a1a1aa;">Cardomancer</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
ARRAY['name', 'email', 'loginTime'], 2)
ON CONFLICT (name) DO NOTHING;

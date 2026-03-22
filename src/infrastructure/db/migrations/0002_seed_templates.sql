INSERT INTO email_templates (name, html, variables, max_retries)
VALUES
  ('otp-code', '<!DOCTYPE html>
<html>
<body>
  <h2>Your verification code</h2>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">{{code}}</p>
  <p>This code expires in 5 minutes.</p>
</body>
</html>', ARRAY['code'], 0),
  ('welcome', '<!DOCTYPE html>
<html>
<body>
  <h2>Welcome to {{app}}</h2>
  <p>Hi {{name}}, your account has been created.</p>
</body>
</html>', ARRAY['name', 'app'], 3)
ON CONFLICT (name) DO NOTHING;

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

// Explicitly load ../.env (optional; we’ll still prefer the file)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Use the existing 'admin' import already present earlier in this file
function initializeFirebaseAdmin() {
  let credential = null;
  let source = 'none';

  // Option A: FIREBASE_SERVICE_ACCOUNT (full JSON string in .env)
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svc) {
    try {
      const serviceAccount = JSON.parse(svc);
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      credential = admin.credential.cert(serviceAccount);
      source = 'FIREBASE_SERVICE_ACCOUNT';
    } catch (e) {
      console.error('Invalid FIREBASE_SERVICE_ACCOUNT JSON:', e);
    }
  }

  // Option B: Env trio (projectId, clientEmail, privateKey)
  if (!credential) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
    if (!privateKey && privateKeyBase64) {
      privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    }

    if (projectId && clientEmail && privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
      credential = admin.credential.cert({ projectId, clientEmail, privateKey });
      source = 'env trio';
    }
  }

  // Option C: serviceAccountKey.json at project root
  if (!credential) {
    try {
      const serviceAccount = require(path.resolve(__dirname, '../serviceAccountKey.json'));
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      credential = admin.credential.cert(serviceAccount);
      source = 'serviceAccountKey.json';
    } catch (e) {
      // ignore if file not present
    }
  }

  if (!credential) {
    console.error('Firebase Admin initialization failed: No credentials found.');
    process.exit(1);
  }

  if (!admin.apps.length) {
    const databaseURL = process.env.FIREBASE_DATABASE_URL;
    if (!databaseURL) {
      console.error('Firebase Admin initialization failed: FIREBASE_DATABASE_URL is required.');
      process.exit(1);
    }
    admin.initializeApp({ credential, databaseURL });
  }
  console.log(`Firebase Admin initialized (source: ${source})`);
}

initializeFirebaseAdmin();
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

const auth = admin.auth();
const db = admin.firestore();

function getPublicBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const protocol = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host') || '').toString().split(',')[0].trim();
  if (!host) return 'https://titantrades.org';
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

function getBrandLogoUrl(req) {
  return process.env.BRAND_LOGO_URL || `${getPublicBaseUrl(req)}/assets/images/IMG_9877.PNG`;
}

function buildEmailHtml({ req, title, intro, rows, outro }) {
  const logoUrl = getBrandLogoUrl(req);
  const safeTitle = title || 'TitanTrades';
  const safeIntro = intro || '';
  const safeOutro = outro || '';
  const list = (rows || [])
    .filter(Boolean)
    .map(({ label, value }) => `
      <tr>
        <td style="padding:10px 0;color:#64748b;font-size:13px;vertical-align:top;width:140px;">${label}</td>
        <td style="padding:10px 0;color:#0f172a;font-size:13px;font-weight:600;vertical-align:top;">${value}</td>
      </tr>
    `)
    .join('');

  return `
  <div style="background:#f8fafc;padding:24px 12px;font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
      <div style="padding:18px 20px;background:linear-gradient(135deg,rgba(139,92,246,0.12),rgba(59,130,246,0.06));border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;">
        <img src="${logoUrl}" alt="TitanTrades" style="width:38px;height:38px;border-radius:10px;display:block;object-fit:cover;">
        <div>
          <div style="font-size:14px;color:#475569;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">TitanTrades</div>
          <div style="font-size:18px;color:#0f172a;font-weight:800;margin-top:2px;">${safeTitle}</div>
        </div>
      </div>
      <div style="padding:20px;">
        <div style="color:#0f172a;font-size:14px;line-height:1.55;">${safeIntro}</div>
        <div style="margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;background:#ffffff;">
          <table style="width:100%;border-collapse:collapse;">
            ${list}
          </table>
        </div>
        <div style="margin-top:14px;color:#475569;font-size:13px;line-height:1.6;">${safeOutro}</div>
        <div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:14px;color:#94a3b8;font-size:12px;line-height:1.5;">
          This is an automated email from TitanTrades. If you did not request this action, please contact support.
        </div>
      </div>
    </div>
  </div>
  `;
}

function createMailerTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

async function sendBrandEmail({ to, subject, html }) {
  const transporter = createMailerTransport();
  if (!transporter) {
    const err = new Error('Email transport not configured (SMTP_HOST/SMTP_USER/SMTP_PASS)');
    err.code = 'email/not-configured';
    throw err;
  }

  const from = process.env.EMAIL_FROM || 'TitanTrades <noreply@titantrades.org>';
  return transporter.sendMail({ from, to, subject, html });
}

// Middleware to verify admin token
async function verifyAdminToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    // Check if user is admin (you can customize this logic)
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    
    if (!userData || userData.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

async function verifyUserToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

// API Routes

// Get all users
app.get('/api/users', verifyAdminToken, async (req, res) => {
  try {
    const listUsersResult = await auth.listUsers(1000);
    const users = listUsersResult.users.map(userRecord => ({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      emailVerified: userRecord.emailVerified,
      disabled: userRecord.disabled,
      creationTime: userRecord.metadata.creationTime,
      lastSignInTime: userRecord.metadata.lastSignInTime
    }));
    
    res.json({ users });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user password
app.put('/api/users/:userId/password', verifyAdminToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Update password in Firebase Auth
    await auth.updateUser(userId, {
      password: newPassword
    });

    // Log the password change
    await db.collection('admin_logs').add({
      action: 'password_changed',
      targetUserId: userId,
      adminId: req.user.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Disable/Enable user
app.put('/api/users/:userId/status', verifyAdminToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { disabled } = req.body;

    await auth.updateUser(userId, { disabled });

    res.json({ success: true, message: `User ${disabled ? 'disabled' : 'enabled'} successfully` });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Delete user
app.delete('/api/users/:userId', verifyAdminToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Revoke refresh tokens (force logout on all devices)
    await auth.revokeRefreshTokens(userId);
    
    // 2. Delete from Firebase Auth
    await auth.deleteUser(userId);
    
    // 3. Delete from Firestore
    await db.collection('users').doc(userId).delete();

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.post('/api/withdrawal-requests', verifyUserToken, async (req, res) => {
  try {
    const { amount, details, requestId } = req.body || {};
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const userRecord = await auth.getUser(req.user.uid);
    const email = userRecord.email;
    if (!email) {
      return res.status(400).json({ error: 'User email not found' });
    }

    const finalRequestId = requestId || `WD${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const payload = {
      userId: req.user.uid,
      userEmail: email,
      amount: parsedAmount,
      details: details || {},
      status: 'pending',
      requestDate: admin.firestore.FieldValue.serverTimestamp(),
      requestId: finalRequestId,
      emailProcessingSent: false
    };

    const docRef = await db.collection('withdrawal-requests').add(payload);

    try {
      await db.collection('users').doc(req.user.uid).collection('transactions').add({
        type: 'withdrawal_request',
        amount: parsedAmount,
        status: 'pending',
        method: (details && details.method) || null,
        details: details || {},
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        requestId: finalRequestId,
        withdrawalRequestId: docRef.id
      });
    } catch (e) {}

    const html = buildEmailHtml({
      req,
      title: 'Withdrawal request received',
      intro: `We received your withdrawal request and it is now being processed. You will receive another email once it has been confirmed.`,
      rows: [
        { label: 'Request ID', value: finalRequestId },
        { label: 'Amount', value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parsedAmount) },
        { label: 'Method', value: String(details?.method || '—').toUpperCase() }
      ],
      outro: `If you have questions, reply to this email or contact support.`
    });

    let emailSent = false;
    try {
      await sendBrandEmail({
        to: email,
        subject: `TitanTrades — Withdrawal request received (${finalRequestId})`,
        html
      });

      await db.collection('withdrawal-requests').doc(docRef.id).update({
        emailProcessingSent: true,
        emailProcessingSentAt: admin.firestore.FieldValue.serverTimestamp()
      });
      emailSent = true;
    } catch (e) {
      console.error('Failed to send withdrawal processing email:', e);
    }

    return res.json({ success: true, id: docRef.id, requestId: finalRequestId, emailSent });
  } catch (error) {
    console.error('Withdrawal request error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to create withdrawal request' });
  }
});

app.post('/api/withdrawal-requests/:id/send-approved-email', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.collection('withdrawal-requests').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Withdrawal request not found' });

    const data = snap.data() || {};
    if (data.status !== 'approved') {
      return res.status(400).json({ error: 'Withdrawal is not approved' });
    }

    if (data.emailApprovedSent) {
      return res.json({ success: true, skipped: true });
    }

    const email = data.userEmail;
    if (!email) return res.status(400).json({ error: 'User email not found' });

    const amount = Number(data.amount || 0);
    const requestId = data.requestId || id;
    const method = data.details?.method || data.method || '—';

    const html = buildEmailHtml({
      req,
      title: 'Withdrawal confirmed',
      intro: `Your withdrawal has been confirmed. If additional processing is required by your payment method, you will be updated accordingly.`,
      rows: [
        { label: 'Request ID', value: requestId },
        { label: 'Amount', value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount) },
        { label: 'Method', value: String(method).toUpperCase() },
        { label: 'Status', value: 'CONFIRMED' }
      ],
      outro: `Thank you for trading with TitanTrades.`
    });

    await sendBrandEmail({
      to: email,
      subject: `TitanTrades — Withdrawal confirmed (${requestId})`,
      html
    });

    await db.collection('withdrawal-requests').doc(id).update({
      emailApprovedSent: true,
      emailApprovedSentAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Send approved email error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to send email' });
  }
});

app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
});

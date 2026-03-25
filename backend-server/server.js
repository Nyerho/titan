const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

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

app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
});

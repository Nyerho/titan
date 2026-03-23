// Payment processing backend with secure API key handling
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Secret key from environment
const sgMail = require('@sendgrid/mail');
const admin = require('firebase-admin');

const router = express.Router();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Create Stripe Payment Intent
router.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency, user_id } = req.body;
        
        // Validate user authentication
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        const decodedToken = await admin.auth().verifyIdToken(authToken);
        
        if (decodedToken.uid !== user_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Create payment intent with Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            metadata: {
                user_id: user_id
            }
        });
        
        res.json({
            client_secret: paymentIntent.client_secret
        });
        
    } catch (error) {
        console.error('Payment intent creation failed:', error);
        res.status(500).json({ error: 'Payment processing failed' });
    }
});

// Process withdrawal
router.post('/process-withdrawal', async (req, res) => {
    try {
        const { amount, method, user_id } = req.body;
        
        // Validate user authentication
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        const decodedToken = await admin.auth().verifyIdToken(authToken);
        
        if (decodedToken.uid !== user_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Process withdrawal logic here
        // This would integrate with your chosen withdrawal method
        
        res.json({ success: true, transaction_id: 'txn_' + Date.now() });
        
    } catch (error) {
        console.error('Withdrawal processing failed:', error);
        res.status(500).json({ error: 'Withdrawal processing failed' });
    }
});

// Get transaction history
router.get('/transaction-history/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        
        // Validate user authentication
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        const decodedToken = await admin.auth().verifyIdToken(authToken);
        
        if (decodedToken.uid !== user_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Fetch transaction history from database
        const transactions = await getTransactionHistory(user_id);
        
        res.json({ transactions });
        
    } catch (error) {
        console.error('Failed to fetch transaction history:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// User profile management
router.post('/user/profile', async (req, res) => {
    try {
        const { user_id, profile_data } = req.body;
        
        // Validate user authentication
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        const decodedToken = await admin.auth().verifyIdToken(authToken);
        
        if (decodedToken.uid !== user_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Update user profile in database
        await updateUserProfile(user_id, profile_data);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Profile update failed:', error);
        res.status(500).json({ error: 'Profile update failed' });
    }
});

// Trading endpoints
router.post('/orders/create', async (req, res) => {
    try {
        const { user_id, symbol, type, amount, price } = req.body;
        
        // Validate user authentication
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        const decodedToken = await admin.auth().verifyIdToken(authToken);
        
        if (decodedToken.uid !== user_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Create trading order
        const order = await createTradingOrder({
            user_id,
            symbol,
            type,
            amount,
            price,
            timestamp: new Date()
        });
        
        res.json({ success: true, order_id: order.id });
        
    } catch (error) {
        console.error('Order creation failed:', error);
        res.status(500).json({ error: 'Order creation failed' });
    }
});

// Market data endpoints
router.get('/market/quotes/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        
        // Fetch real-time quote using your API keys
        const quote = await getMarketQuote(symbol);
        
        res.json({ quote });
        
    } catch (error) {
        console.error('Failed to fetch market quote:', error);
        res.status(500).json({ error: 'Failed to fetch quote' });
    }
});

// Add admin-protected DELETE /users/:userId route to support the admin UI
router.delete('/users/:userId', async (req, res) => {
    try {
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        if (!authToken) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Verify token
        const decodedToken = await admin.auth().verifyIdToken(authToken);

        // Check admin role from Firestore
        const adminDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        const adminData = adminDoc.data();
        if (!adminData || adminData.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { userId } = req.params;

        // 1) Revoke refresh tokens (forces logout)
        await admin.auth().revokeRefreshTokens(userId);

        // 2) Delete from Firebase Auth
        await admin.auth().deleteUser(userId);

        // 3) Delete Firestore user document
        await admin.firestore().collection('users').doc(userId).delete();

        return res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        return res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
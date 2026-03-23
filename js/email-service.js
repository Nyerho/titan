// Email Service for Registration Notifications
import { API_CONFIG } from './api-config.js';

class EmailService {
    constructor() {
        // Initialize EmailJS or your preferred email service
        this.emailServiceId = 'service_your_id'; // Replace with actual service ID
        this.templateId = 'template_your_id';     // Replace with actual template ID
        this.publicKey = 'your_public_key';       // Replace with actual public key
        this.isConfigured = this.checkConfiguration();
    }

    checkConfiguration() {
        return this.emailServiceId !== 'service_your_id' && 
               this.templateId !== 'template_your_id' && 
               this.publicKey !== 'your_public_key';
    }

    async sendVerificationEmail(emailData) {
        try {
            if (!this.isConfigured) {
                console.warn('EmailJS not configured properly');
                return { success: false, error: 'Email service not configured' };
            }

            // Check if EmailJS is loaded
            if (typeof emailjs === 'undefined') {
                console.warn('EmailJS library not loaded');
                return { success: false, error: 'EmailJS library not available' };
            }

            const response = await emailjs.send(
                this.emailServiceId,
                this.templateId,
                emailData,
                this.publicKey
            );
            return { success: true, response };
        } catch (error) {
            console.error('Email sending failed:', error);
            return { success: false, error: error.message };
        }
    }

    getVerificationEmailTemplate(userName, verificationUrl) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Account - TitanTrades</title>
            <style>
                body { 
                    font-family: 'Inter', Arial, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0;
                    background-color: #f8fafc;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    padding: 20px;
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 30px; 
                    text-align: center; 
                    border-radius: 8px 8px 0 0;
                }
                .logo {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                .content { 
                    background: #ffffff; 
                    padding: 30px; 
                    border-radius: 0 0 8px 8px;
                }
                .verify-button { 
                    display: inline-block; 
                    background: #667eea; 
                    color: white !important; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    margin: 25px 0;
                    font-weight: 600;
                    font-size: 16px;
                    text-align: center;
                }
                .security-notice {
                    background: #f0f9ff;
                    border-left: 4px solid #0ea5e9;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 0 6px 6px 0;
                }
                .footer { 
                    text-align: center; 
                    margin-top: 30px; 
                    color: #666; 
                    font-size: 14px;
                    padding: 20px;
                    border-top: 1px solid #e2e8f0;
                }
                .contact-info {
                    background: #f8fafc;
                    padding: 15px;
                    border-radius: 6px;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">TitanTrades</div>
                    <h1>Verify Your Email Address</h1>
                    <p>Welcome to professional trading</p>
                </div>
                <div class="content">
                    <h2>Hello ${userName},</h2>
                    <p>Thank you for registering with TitanTrades! To complete your account setup and ensure the security of your trading account, please verify your email address.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationUrl}" class="verify-button">Verify My Email Address</a>
                    </div>
                    
                    <div class="security-notice">
                        <strong>🔒 Security Notice:</strong> This verification link will expire in 24 hours for your security. If you didn't create this account, please ignore this email.
                    </div>
                    
                    <p><strong>What happens after verification?</strong></p>
                    <ul>
                        <li>✅ Full access to your trading dashboard</li>
                        <li>✅ Ability to deposit and withdraw funds</li>
                        <li>✅ Access to advanced trading tools</li>
                        <li>✅ Priority customer support</li>
                    </ul>
                    
                    <div class="contact-info">
                        <strong>Need Help?</strong><br>
                        If you're having trouble with the verification link, copy and paste this URL into your browser:<br>
                        <small style="word-break: break-all; color: #666;">${verificationUrl}</small>
                    </div>
                    
                    <p>Best regards,<br>
                    <strong>TitanTrades Support Team</strong><br>
                    support@titantrades.com</p>
                </div>
                <div class="footer">
                    <p>© 2026 TitanTrades. All rights reserved.</p>
                    <p>This email was sent from our secure server. Please do not reply to this automated message.</p>
                    <p>If you have questions, contact us at <strong>support@titantrades.com</strong></p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
}

export default EmailService;

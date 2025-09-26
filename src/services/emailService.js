const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail', // You can change this to other services like outlook, yahoo, etc.
            auth: {
                user: process.env.EMAIL_USER, // Your email
                pass: process.env.EMAIL_PASSWORD // Your email password or app password
            }
        });
    }

    async sendAdminPasswordResetEmail(adminEmail, adminName = 'Admin', resetLink = '#') {
        try {
            const mailOptions = {
                from: {
                    name: 'Health Hustle Admin',
                    address: process.env.EMAIL_USER
                },
                to: adminEmail,
                subject: 'Admin Password Reset Request - Health Hustle',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Admin Password Reset</title>
                    </head>
                    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 10px; margin-top: 20px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h1 style="color: #e74c3c; margin: 0; font-size: 28px;">Health Hustle Admin</h1>
                                <p style="color: #7f8c8d; margin: 5px 0 0 0; font-size: 14px;">Admin Panel Access</p>
                            </div>
                            
                            <div style="background-color: #ecf0f1; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                <h2 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 22px;">Admin Password Reset Request</h2>
                                <p style="color: #34495e; margin: 0; font-size: 16px; line-height: 1.5;">
                                    Hello ${adminName},
                                </p>
                                <p style="color: #34495e; margin: 15px 0; font-size: 16px; line-height: 1.5;">
                                    We received a request to reset your admin password for your Health Hustle admin account. If you made this request, please use the link below to reset your password.
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${resetLink}" style="background-color: #e74c3c; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">
                                    Reset Admin Password
                                </a>
                            </div>
                            
                            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
                                    <strong>Important:</strong> This link will expire in 24 hours for security reasons.
                                </p>
                                <p style="color: #856404; margin: 10px 0 0 0; font-size: 14px; line-height: 1.5;">
                                    Please also check your spam folder if you don't see this email in your inbox.
                                </p>
                            </div>
                            
                            <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <p style="color: #721c24; margin: 0; font-size: 14px; line-height: 1.5;">
                                    <strong>Security Notice:</strong> This is an admin account password reset. If you didn't request this, please contact your system administrator immediately.
                                </p>
                            </div>
                            
                            <div style="border-top: 1px solid #ecf0f1; padding-top: 20px; margin-top: 30px;">
                                <p style="color: #7f8c8d; margin: 0; font-size: 14px; line-height: 1.5;">
                                    If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
                                </p>
                                <p style="color: #7f8c8d; margin: 15px 0 0 0; font-size: 14px; line-height: 1.5;">
                                    If you're having trouble with the button above, you can copy and paste the following link into your browser:
                                </p>
                                <p style="color: #e74c3c; margin: 10px 0 0 0; font-size: 12px; word-break: break-all;">
                                    ${resetLink}
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
                                <p style="color: #95a5a6; margin: 0; font-size: 12px;">
                                    © 2025 Health Hustle Admin Panel. All rights reserved.
                                </p>
                                <p style="color: #95a5a6; margin: 5px 0 0 0; font-size: 12px;">
                                    This is an automated message, please do not reply to this email.
                                </p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
                    Health Hustle Admin - Password Reset Request
                    
                    Hello ${adminName},
                    
                    We received a request to reset your admin password for your Health Hustle admin account.
                    
                    We'll send you a password reset link to your email address. The link will expire in 24 hours.
                    
                    Please also check your spam folder if you don't see the email.
                    
                    SECURITY NOTICE: This is an admin account password reset. If you didn't request this, please contact your system administrator immediately.
                    
                    If you didn't request a password reset, you can safely ignore this email.
                    
                    Best regards,
                    Health Hustle Admin Team
                `
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('Admin password reset email sent successfully:', result.messageId);
            return {
                success: true,
                messageId: result.messageId
            };

        } catch (error) {
            console.error('Error sending admin password reset email:', error);
            throw new Error('Failed to send admin password reset email');
        }
    }

    // Test email configuration
    async testConnection() {
        try {
            await this.transporter.verify();
            console.log('Email service is ready to send emails');
            return true;
        } catch (error) {
            console.error('Email service configuration error:', error);
            return false;
        }
    }
}

module.exports = EmailService;

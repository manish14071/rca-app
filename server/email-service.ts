import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER!,
    pass: process.env.EMAIL_PASSWORD!,
  },
});
transporter.verify((error) => {
  if (error) console.error('SMTP Connection Error:', error);
  else console.log('SMTP Server Ready');
});
export async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = `${process.env.APP_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: 'Your App <noreply@yourapp.com>',
    to: email,
    subject: 'Verify Your Email Address',
    html: `
      <p>Click below to verify your email:</p>
      <a href="${verificationUrl}">Verify Email</a>
      <p>This link expires in 1 hour.</p>
    `
  });
}
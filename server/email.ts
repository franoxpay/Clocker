import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@cleryon.com';
const FROM_NAME = process.env.FROM_NAME || 'Cleryon';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  try {
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    });

    if (error) {
      console.error('Error sending email:', error);
      throw new Error(error.message);
    }

    console.log('Email sent successfully:', data?.id);
    return data;
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

export async function sendWelcomeEmail(email: string, name: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Bem-vindo ao Cleryon! 🎉</h1>
      <p>Olá ${name || 'usuário'},</p>
      <p>Sua conta foi criada com sucesso. Estamos felizes em tê-lo conosco!</p>
      <p>Comece a criar suas campanhas agora mesmo.</p>
      <br/>
      <p>Atenciosamente,</p>
      <p><strong>Equipe Cleryon</strong></p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Bem-vindo ao Cleryon!',
    html,
    text: `Bem-vindo ao Cleryon! Olá ${name || 'usuário'}, sua conta foi criada com sucesso.`,
  });
}

export async function sendSubscriptionConfirmationEmail(email: string, planName: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Assinatura Confirmada! ✅</h1>
      <p>Sua assinatura do plano <strong>${planName}</strong> foi ativada com sucesso.</p>
      <p>Agora você tem acesso a todos os recursos do seu plano.</p>
      <br/>
      <p>Atenciosamente,</p>
      <p><strong>Equipe Cleryon</strong></p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Assinatura ${planName} Confirmada - Cleryon`,
    html,
    text: `Sua assinatura do plano ${planName} foi ativada com sucesso no Cleryon.`,
  });
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Redefinição de Senha</h1>
      <p>Você solicitou a redefinição da sua senha.</p>
      <p>Clique no botão abaixo para criar uma nova senha:</p>
      <br/>
      <a href="${resetLink}" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
        Redefinir Senha
      </a>
      <br/><br/>
      <p style="color: #666; font-size: 12px;">Se você não solicitou esta redefinição, ignore este email.</p>
      <p style="color: #666; font-size: 12px;">Este link expira em 1 hora.</p>
      <br/>
      <p>Atenciosamente,</p>
      <p><strong>Equipe Cleryon</strong></p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Redefinição de Senha - Cleryon',
    html,
    text: `Você solicitou a redefinição da sua senha. Acesse: ${resetLink}`,
  });
}

export async function sendNotificationEmail(email: string, title: string, message: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">${title}</h1>
      <p>${message}</p>
      <br/>
      <p>Atenciosamente,</p>
      <p><strong>Equipe Cleryon</strong></p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `${title} - Cleryon`,
    html,
    text: `${title}: ${message}`,
  });
}

export { resend };

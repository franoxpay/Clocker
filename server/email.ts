import { Resend } from 'resend';
import { db } from './db';
import { emailLogs } from '@shared/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@cleryon.com';
const FROM_NAME = process.env.FROM_NAME || 'Cleryon';

function obfuscateDomain(domain: string): string {
  return domain.replace(/\./g, '[.]');
}

type EmailType = 'welcome' | 'subscription' | 'domain_inactive' | 'shared_domain_inactive' | 'plan_limit' | 'notification' | 'password_reset' | 'domain_removed' | 'domain_removed_policy' | 'domain_removed_inactive' | 'domain_removed_admin' | 'subscription_cancelled' | 'subscription_renewed' | 'payment_failed' | 'account_suspended';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  userId?: string;
  type: EmailType;
  metadata?: Record<string, any>;
}

async function logEmail(
  userId: string | undefined,
  toEmail: string,
  subject: string,
  type: EmailType,
  status: 'sent' | 'failed',
  resendId?: string,
  errorMessage?: string,
  metadata?: Record<string, any>
) {
  try {
    await db.insert(emailLogs).values({
      userId: userId || null,
      toEmail,
      subject,
      type,
      status,
      resendId: resendId || null,
      errorMessage: errorMessage || null,
      metadata: metadata || null,
    });
  } catch (err) {
    console.error('Failed to log email:', err);
  }
}

export async function sendEmail({ to, subject, html, text, userId, type, metadata }: SendEmailOptions) {
  const toEmails = Array.isArray(to) ? to : [to];
  let errorLogged = false;
  
  try {
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: toEmails,
      subject,
      html,
      text,
    });

    if (error) {
      console.error('Error sending email:', error);
      for (const email of toEmails) {
        await logEmail(userId, email, subject, type, 'failed', undefined, error.message, metadata);
      }
      errorLogged = true;
      throw new Error(error.message);
    }

    console.log('Email sent successfully:', data?.id);
    for (const email of toEmails) {
      await logEmail(userId, email, subject, type, 'sent', data?.id, undefined, metadata);
    }
    return data;
  } catch (error: any) {
    // Only log if we haven't already logged the error (prevents duplicate logs)
    if (!errorLogged) {
      console.error('Failed to send email:', error);
      for (const email of toEmails) {
        await logEmail(userId, email, subject, type, 'failed', undefined, error?.message, metadata);
      }
    }
    throw error;
  }
}

export async function sendWelcomeEmail(email: string, name: string, userId?: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
      </div>
      <h2 style="color: #333;">Bem-vindo ao Cleryon!</h2>
      <p style="color: #555; line-height: 1.6;">Olá ${name || 'usuário'},</p>
      <p style="color: #555; line-height: 1.6;">Sua conta foi criada com sucesso. Estamos felizes em tê-lo conosco!</p>
      <p style="color: #555; line-height: 1.6;">Comece a criar suas campanhas agora mesmo acessando seu painel.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://cleryon.com" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Acessar Painel
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Bem-vindo ao Cleryon!',
    html,
    text: `Bem-vindo ao Cleryon! Olá ${name || 'usuário'}, sua conta foi criada com sucesso.`,
    userId,
    type: 'welcome',
    metadata: { name },
  });
}

export async function sendSubscriptionConfirmationEmail(email: string, planName: string, userId?: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
      </div>
      <h2 style="color: #333;">Assinatura Confirmada!</h2>
      <p style="color: #555; line-height: 1.6;">Sua assinatura do plano <strong style="color: #6366f1;">${planName}</strong> foi ativada com sucesso.</p>
      <p style="color: #555; line-height: 1.6;">Agora você tem acesso a todos os recursos do seu plano. Aproveite!</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #333;"><strong>Plano:</strong> ${planName}</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://cleryon.com" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Acessar Painel
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Assinatura ${planName} Confirmada - Cleryon`,
    html,
    text: `Sua assinatura do plano ${planName} foi ativada com sucesso no Cleryon.`,
    userId,
    type: 'subscription',
    metadata: { planName },
  });
}

export async function sendDomainInactiveEmail(email: string, domainName: string, userId?: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
      </div>
      <h2 style="color: #ef4444;">Alerta: Domínio Inativo</h2>
      <p style="color: #555; line-height: 1.6;">Detectamos que seu domínio <strong>${domainName}</strong> está inativo ou com problemas de configuração.</p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b;">Suas campanhas neste domínio podem estar afetadas. Verifique as configurações de DNS.</p>
      </div>
      <p style="color: #555; line-height: 1.6;"><strong>O que fazer:</strong></p>
      <ul style="color: #555; line-height: 1.8;">
        <li>Verifique se os registros DNS estão configurados corretamente</li>
        <li>Confirme que o domínio não expirou</li>
        <li>Aguarde alguns minutos e tente novamente</li>
      </ul>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://cleryon.com/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Verificar Domínios
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Alerta: Domínio ${domainName} Inativo - Cleryon`,
    html,
    text: `Alerta: Seu domínio ${domainName} está inativo. Verifique as configurações de DNS.`,
    userId,
    type: 'domain_inactive',
    metadata: { domainName },
  });
}

export async function sendSharedDomainInactiveEmail(email: string, domainName: string, userId?: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
      </div>
      <h2 style="color: #f59e0b;">Aviso: Domínio Compartilhado Indisponível</h2>
      <p style="color: #555; line-height: 1.6;">O domínio compartilhado <strong>${domainName}</strong> que você está utilizando está temporariamente indisponível.</p>
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e;">Suas campanhas neste domínio podem estar afetadas temporariamente.</p>
      </div>
      <p style="color: #555; line-height: 1.6;">Nossa equipe já foi notificada e está trabalhando para resolver o problema. Você será notificado quando o domínio voltar ao normal.</p>
      <p style="color: #555; line-height: 1.6;"><strong>Alternativa:</strong> Você pode configurar um domínio próprio para evitar interrupções futuras.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://cleryon.com/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Gerenciar Domínios
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Aviso: Domínio Compartilhado ${domainName} Indisponível - Cleryon`,
    html,
    text: `Aviso: O domínio compartilhado ${domainName} está temporariamente indisponível.`,
    userId,
    type: 'shared_domain_inactive',
    metadata: { domainName },
  });
}

export async function sendDomainRemovedEmail(email: string, domainName: string, reason: string, firstName: string, userId?: string) {
  const safeDomainName = obfuscateDomain(domainName);
  
  const reasonMessages: Record<string, { pt: string; en: string }> = {
    phishing: {
      pt: 'removido devido a uma denúncia externa por violação de política',
      en: 'removed due to an external report for policy violation',
    },
    inactive: {
      pt: 'identificado como inativo durante verificações automáticas',
      en: 'identified as inactive during automatic checks',
    },
    admin_action: {
      pt: 'removido por decisão administrativa',
      en: 'removed by administrative decision',
    },
    user_deleted: {
      pt: 'removido da sua conta com sucesso',
      en: 'successfully removed from your account',
    },
  };

  const reasonText = reasonMessages[reason] || reasonMessages.admin_action;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
      </div>
      <h2 style="color: #ef4444;">Domínio Removido</h2>
      <p style="color: #555; line-height: 1.6;">Olá ${firstName},</p>
      <p style="color: #555; line-height: 1.6;">O domínio <code style="background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${safeDomainName}</code> foi ${reasonText.pt}.</p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b;">Suas ofertas vinculadas a este domínio foram desvinculadas e precisam de um novo domínio para continuar funcionando.</p>
      </div>
      <p style="color: #555; line-height: 1.6;">Acesse sua conta para configurar um novo domínio e restaurar suas campanhas.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://cleryon.com/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Configurar Novo Domínio
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Atualização sobre seu domínio - Cleryon`,
    html,
    text: `Olá ${firstName}, o domínio ${safeDomainName} foi ${reasonText.pt}. Acesse sua conta para configurar um novo domínio.`,
    userId,
    type: 'domain_removed',
    metadata: { domainName, reason },
  });
}

export async function sendPlanLimitEmail(email: string, limitType: 'clicks' | 'offers' | 'domains', currentValue: number, maxValue: number, planName: string, userId?: string) {
  const limitLabels = {
    clicks: 'cliques',
    offers: 'ofertas',
    domains: 'domínios',
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
      </div>
      <h2 style="color: #f59e0b;">Limite do Plano Atingido</h2>
      <p style="color: #555; line-height: 1.6;">Você atingiu o limite de <strong>${limitLabels[limitType]}</strong> do seu plano <strong>${planName}</strong>.</p>
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e;">
          <strong>Uso atual:</strong> ${currentValue.toLocaleString('pt-BR')} / ${maxValue.toLocaleString('pt-BR')} ${limitLabels[limitType]}
        </p>
      </div>
      <p style="color: #555; line-height: 1.6;">Para continuar usando todos os recursos da plataforma, considere fazer upgrade do seu plano.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://cleryon.com/subscription" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Ver Planos
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Limite de ${limitLabels[limitType]} atingido - Cleryon`,
    html,
    text: `Você atingiu o limite de ${limitLabels[limitType]} do seu plano ${planName}. Uso: ${currentValue}/${maxValue}.`,
    userId,
    type: 'plan_limit',
    metadata: { limitType, currentValue, maxValue, planName },
  });
}

export async function sendPasswordResetEmail(email: string, resetLink: string, userId?: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
      </div>
      <h2 style="color: #333;">Redefinição de Senha</h2>
      <p style="color: #555; line-height: 1.6;">Você solicitou a redefinição da sua senha.</p>
      <p style="color: #555; line-height: 1.6;">Clique no botão abaixo para criar uma nova senha:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Redefinir Senha
        </a>
      </div>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #666; font-size: 12px;">Se você não solicitou esta redefinição, ignore este email.</p>
        <p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">Este link expira em 1 hora.</p>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Redefinição de Senha - Cleryon',
    html,
    text: `Você solicitou a redefinição da sua senha. Acesse: ${resetLink}`,
    userId,
    type: 'password_reset',
  });
}

export async function sendNotificationEmail(email: string, title: string, message: string, userId?: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
      </div>
      <h2 style="color: #333;">${title}</h2>
      <p style="color: #555; line-height: 1.6;">${message}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://cleryon.com" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Acessar Painel
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `${title} - Cleryon`,
    html,
    text: `${title}: ${message}`,
    userId,
    type: 'notification',
    metadata: { title },
  });
}

export { resend };

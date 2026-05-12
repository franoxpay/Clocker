import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { isAdmin, isAuthenticated } from "../replitAuth";
import { requireAdmin, checkIsAdmin, getUserPermissions } from "../auth/permissions";
import { getStripeClient, isStripeConfigured } from "../stripeClient";
import { sendDomainRemovedEmail, sendEmail, sendTemplatedEmail } from "../email";
import { verifyDomainDNS } from "../domainUtils";
import { resetConsecutiveFailures } from "../domainMonitor";
import { toSafeUser, toSafeUsers } from "../lib/safeUser";

const DEFAULT_EMAIL_TEMPLATES = {
  welcome: {
    subjectPt: "Bem-vindo ao Cleryon!",
    subjectEn: "Welcome to Cleryon!",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">Bem-vindo ao Cleryon, {{firstName}}!</h1>
  <p>Estamos felizes em ter você conosco.</p>
  <p>Agora você pode começar a criar suas ofertas e domínios para suas campanhas de marketing.</p>
  <p>Se precisar de ajuda, não hesite em nos contatar.</p>
  <p>Atenciosamente,<br>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">Welcome to Cleryon, {{firstName}}!</h1>
  <p>We're happy to have you with us.</p>
  <p>Now you can start creating your offers and domains for your marketing campaigns.</p>
  <p>If you need any help, don't hesitate to contact us.</p>
  <p>Best regards,<br>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando um novo usuário se registra",
  },
  subscription: {
    subjectPt: "Assinatura Confirmada - {{planName}}",
    subjectEn: "Subscription Confirmed - {{planName}}",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">Assinatura Confirmada!</h1>
  <p>Olá {{firstName}},</p>
  <p>Sua assinatura do plano <strong>{{planName}}</strong> foi confirmada com sucesso.</p>
  <p>Você agora tem acesso a todos os recursos do seu plano.</p>
  <p>Atenciosamente,<br>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">Subscription Confirmed!</h1>
  <p>Hello {{firstName}},</p>
  <p>Your subscription to the <strong>{{planName}}</strong> plan has been successfully confirmed.</p>
  <p>You now have access to all features of your plan.</p>
  <p>Best regards,<br>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando uma assinatura é confirmada",
  },
  domain_inactive: {
    subjectPt: "Atenção: Seu domínio está inativo",
    subjectEn: "Attention: Your domain is inactive",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #ef4444;">Domínio Inativo</h1>
  <p>Olá {{firstName}},</p>
  <p>Detectamos que seu domínio <strong>{{domain}}</strong> está inativo ou com problemas de DNS.</p>
  <p>Por favor, verifique as configurações do seu domínio para que suas campanhas continuem funcionando.</p>
  <p>Atenciosamente,<br>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #ef4444;">Inactive Domain</h1>
  <p>Hello {{firstName}},</p>
  <p>We detected that your domain <strong>{{domain}}</strong> is inactive or has DNS issues.</p>
  <p>Please check your domain settings so your campaigns continue working.</p>
  <p>Best regards,<br>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando um domínio do usuário está inativo",
  },
  shared_domain_inactive: {
    subjectPt: "Atenção: Domínio compartilhado inativo",
    subjectEn: "Attention: Shared domain inactive",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #f59e0b;">Domínio Compartilhado Inativo</h1>
  <p>Olá {{firstName}},</p>
  <p>O domínio compartilhado <strong>{{domain}}</strong> que você utiliza está temporariamente inativo.</p>
  <p>Nossa equipe já está trabalhando para resolver o problema o mais rápido possível.</p>
  <p>Atenciosamente,<br>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #f59e0b;">Shared Domain Inactive</h1>
  <p>Hello {{firstName}},</p>
  <p>The shared domain <strong>{{domain}}</strong> that you use is temporarily inactive.</p>
  <p>Our team is already working to resolve the issue as quickly as possible.</p>
  <p>Best regards,<br>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando um domínio compartilhado está inativo",
  },
  plan_limit: {
    subjectPt: "Alerta: Limite do plano atingido",
    subjectEn: "Alert: Plan limit reached",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #f59e0b;">Limite Atingido</h1>
  <p>Olá {{firstName}},</p>
  <p>Você atingiu o limite de <strong>{{limitType}}</strong> do seu plano.</p>
  <p>Uso atual: {{currentUsage}} de {{limit}}</p>
  <p>Considere fazer upgrade do seu plano para continuar usando todos os recursos.</p>
  <p>Atenciosamente,<br>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #f59e0b;">Limit Reached</h1>
  <p>Hello {{firstName}},</p>
  <p>You have reached the <strong>{{limitType}}</strong> limit of your plan.</p>
  <p>Current usage: {{currentUsage}} of {{limit}}</p>
  <p>Consider upgrading your plan to continue using all features.</p>
  <p>Best regards,<br>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando o usuário atinge o limite do plano",
  },
  notification: {
    subjectPt: "Nova Notificação - Cleryon",
    subjectEn: "New Notification - Cleryon",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">Nova Notificação</h1>
  <p>Olá {{firstName}},</p>
  <p>Você tem uma nova notificação no Cleryon.</p>
  <p>Acesse sua conta para verificar.</p>
  <p>Atenciosamente,<br>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">New Notification</h1>
  <p>Hello {{firstName}},</p>
  <p>You have a new notification on Cleryon.</p>
  <p>Access your account to check it.</p>
  <p>Best regards,<br>Cleryon Team</p>
</body></html>`,
    description: "Email de notificação geral",
  },
  password_reset: {
    subjectPt: "Redefinição de Senha - Cleryon",
    subjectEn: "Password Reset - Cleryon",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">Redefinição de Senha</h1>
  <p>Olá {{firstName}},</p>
  <p>Recebemos uma solicitação para redefinir sua senha.</p>
  <p>Se você não fez esta solicitação, ignore este email.</p>
  <p>Atenciosamente,<br>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">Password Reset</h1>
  <p>Hello {{firstName}},</p>
  <p>We received a request to reset your password.</p>
  <p>If you did not make this request, please ignore this email.</p>
  <p>Best regards,<br>Cleryon Team</p>
</body></html>`,
    description: "Email de redefinição de senha",
  },
  domain_removed: {
    subjectPt: "Domínio Removido - {{domain}}",
    subjectEn: "Domain Removed - {{domain}}",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #ef4444;">Domínio Removido</h1>
  <p>Olá {{firstName}},</p>
  <p>O domínio <strong>{{domain}}</strong> foi removido da plataforma.</p>
  <p>Suas ofertas vinculadas a este domínio foram desvinculadas e precisam de um novo domínio para continuar funcionando.</p>
  <p>Acesse sua conta para configurar um novo domínio.</p>
  <p>Atenciosamente,<br>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #ef4444;">Domain Removed</h1>
  <p>Hello {{firstName}},</p>
  <p>The domain <strong>{{domain}}</strong> has been removed from the platform.</p>
  <p>Your offers linked to this domain have been unlinked and need a new domain to continue working.</p>
  <p>Please access your account to configure a new domain.</p>
  <p>Best regards,<br>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando um domínio é removido",
  },
  domain_removed_policy: {
    subjectPt: "Domínio Removido por Violação de Política - {{domain}}",
    subjectEn: "Domain Removed for Policy Violation - {{domain}}",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Domínio Removido</h2>
  <p style="color: #555; line-height: 1.6;">Olá {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">O domínio <strong>{{domain}}</strong> foi removido devido a uma denúncia externa por violação de política.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Suas ofertas vinculadas a este domínio foram desvinculadas e precisam de um novo domínio para continuar funcionando.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Acesse sua conta para configurar um novo domínio e restaurar suas campanhas.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Configurar Novo Domínio</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Domain Removed</h2>
  <p style="color: #555; line-height: 1.6;">Hello {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">The domain <strong>{{domain}}</strong> has been removed due to an external report for policy violation.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Your offers linked to this domain have been unlinked and need a new domain to continue working.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Please access your account to configure a new domain and restore your campaigns.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Configure New Domain</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Best regards,<br/>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando um domínio é removido por violação de política",
  },
  domain_removed_inactive: {
    subjectPt: "Domínio Removido por Inatividade - {{domain}}",
    subjectEn: "Domain Removed for Inactivity - {{domain}}",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #f59e0b;">Domínio Removido por Inatividade</h2>
  <p style="color: #555; line-height: 1.6;">Olá {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">O domínio <strong>{{domain}}</strong> foi identificado como inativo durante as verificações automáticas do sistema e foi removido.</p>
  <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #92400e;">Verifique suas ofertas para evitar erros de redirecionamento, loops ou tráfego inválido.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Acesse sua conta para configurar um novo domínio e restaurar suas campanhas.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Configurar Novo Domínio</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #f59e0b;">Domain Removed for Inactivity</h2>
  <p style="color: #555; line-height: 1.6;">Hello {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">The domain <strong>{{domain}}</strong> was identified as inactive during automatic system checks and has been removed.</p>
  <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #92400e;">Please check your offers to avoid redirection errors, loops, or invalid traffic.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Please access your account to configure a new domain and restore your campaigns.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Configure New Domain</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Best regards,<br/>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando um domínio é removido por inatividade",
  },
  domain_removed_admin: {
    subjectPt: "Domínio Removido por Decisão Administrativa - {{domain}}",
    subjectEn: "Domain Removed by Administrative Decision - {{domain}}",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Domínio Removido</h2>
  <p style="color: #555; line-height: 1.6;">Olá {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">O domínio <strong>{{domain}}</strong> foi removido da plataforma por decisão administrativa.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Suas ofertas vinculadas a este domínio foram desvinculadas e precisam de um novo domínio para continuar funcionando.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Acesse sua conta para configurar um novo domínio e restaurar suas campanhas.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Configurar Novo Domínio</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Domain Removed</h2>
  <p style="color: #555; line-height: 1.6;">Hello {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">The domain <strong>{{domain}}</strong> has been removed from the platform by administrative decision.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Your offers linked to this domain have been unlinked and need a new domain to continue working.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Please access your account to configure a new domain and restore your campaigns.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/domains" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Configure New Domain</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Best regards,<br/>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando um domínio é removido por decisão administrativa",
  },
  subscription_cancelled: {
    subjectPt: "Sua Assinatura Foi Cancelada - Cleryon",
    subjectEn: "Your Subscription Has Been Cancelled - Cleryon",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Assinatura Cancelada</h2>
  <p style="color: #555; line-height: 1.6;">Olá {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">Sua assinatura do plano <strong>{{planName}}</strong> foi cancelada.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Você ainda terá acesso aos recursos do seu plano até {{endDate}}.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Sentimos sua falta! Se mudar de ideia, você pode reativar sua assinatura a qualquer momento.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/subscription" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reativar Assinatura</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Subscription Cancelled</h2>
  <p style="color: #555; line-height: 1.6;">Hello {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">Your subscription to the <strong>{{planName}}</strong> plan has been cancelled.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">You will still have access to your plan features until {{endDate}}.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">We miss you! If you change your mind, you can reactivate your subscription at any time.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/subscription" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reactivate Subscription</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Best regards,<br/>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando a assinatura é cancelada",
  },
  subscription_renewed: {
    subjectPt: "Sua Assinatura Foi Renovada - Cleryon",
    subjectEn: "Your Subscription Has Been Renewed - Cleryon",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #10b981;">Assinatura Renovada</h2>
  <p style="color: #555; line-height: 1.6;">Olá {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">Sua assinatura do plano <strong>{{planName}}</strong> foi renovada com sucesso!</p>
  <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #065f46;">Próxima renovação: {{nextRenewalDate}}</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Obrigado por continuar conosco! Seu acesso a todos os recursos continua ativo.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/dashboard" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Acessar Dashboard</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #10b981;">Subscription Renewed</h2>
  <p style="color: #555; line-height: 1.6;">Hello {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">Your subscription to the <strong>{{planName}}</strong> plan has been successfully renewed!</p>
  <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #065f46;">Next renewal: {{nextRenewalDate}}</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Thank you for staying with us! Your access to all features remains active.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/dashboard" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Access Dashboard</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Best regards,<br/>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando a assinatura é renovada",
  },
  payment_failed: {
    subjectPt: "Falha no Pagamento - Ação Necessária",
    subjectEn: "Payment Failed - Action Required",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Falha no Pagamento</h2>
  <p style="color: #555; line-height: 1.6;">Olá {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">Não conseguimos processar o pagamento da sua assinatura do plano <strong>{{planName}}</strong>.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Por favor, atualize seus dados de pagamento para evitar a suspensão da sua conta.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Acesse sua conta para atualizar o método de pagamento.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/subscription" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Atualizar Pagamento</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Payment Failed</h2>
  <p style="color: #555; line-height: 1.6;">Hello {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">We were unable to process the payment for your <strong>{{planName}}</strong> plan subscription.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Please update your payment information to avoid suspension of your account.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Access your account to update your payment method.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://clerion.app/subscription" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Update Payment</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Best regards,<br/>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando um pagamento falha",
  },
  account_suspended: {
    subjectPt: "Sua Conta Foi Suspensa - Cleryon",
    subjectEn: "Your Account Has Been Suspended - Cleryon",
    htmlPt: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Conta Suspensa</h2>
  <p style="color: #555; line-height: 1.6;">Olá {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">Sua conta foi suspensa devido a: <strong>{{reason}}</strong></p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Suas ofertas e domínios foram temporariamente desativados.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">Se você acredita que isso foi um erro, entre em contato com nosso suporte.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="mailto:suporte@clerion.app" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Contatar Suporte</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Atenciosamente,<br/>Equipe Cleryon</p>
</body></html>`,
    htmlEn: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0;">Cleryon</h1>
  </div>
  <h2 style="color: #ef4444;">Account Suspended</h2>
  <p style="color: #555; line-height: 1.6;">Hello {{firstName}},</p>
  <p style="color: #555; line-height: 1.6;">Your account has been suspended due to: <strong>{{reason}}</strong></p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #991b1b;">Your offers and domains have been temporarily deactivated.</p>
  </div>
  <p style="color: #555; line-height: 1.6;">If you believe this was an error, please contact our support.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="mailto:suporte@clerion.app" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Contact Support</a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="color: #999; font-size: 12px;">Best regards,<br/>Cleryon Team</p>
</body></html>`,
    description: "Email enviado quando a conta é suspensa",
  },
};

export async function seedDefaultEmailTemplates(): Promise<void> {
  try {
    const existingTemplates = await storage.getEmailTemplates();
    if (existingTemplates.length === 0) {
      console.log("[EMAIL] Seeding default email templates...");
      for (const [type, template] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
        await storage.upsertEmailTemplate({ type, ...template });
      }
      console.log("[EMAIL] Default email templates created successfully");
    }
  } catch (error) {
    console.error("[EMAIL] Error seeding email templates:", error);
  }
}

export function registerAdminRoutes(app: Express, invalidateSettingsCache: () => void): void {
  // ==========================================
  // ADMIN USER MANAGEMENT
  // ==========================================

  app.get("/api/admin/users", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string | undefined;
      const result = await storage.getAllUsers(page, limit, search);
      
      const userIds = result.users.map(u => u.id);
      const clicksBreakdown = await storage.getClicksBreakdownByUserIds(userIds);
      
      const usersWithClicks = result.users.map(user => ({
        ...toSafeUser(user),
        clicksBreakdown: clicksBreakdown.get(user.id) || { today: 0, thisWeek: 0, thisMonth: 0, lifetime: 0 },
      }));
      
      res.json({ users: usersWithClicks, total: result.total, page, limit });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users/:id/details", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const [
        plan,
        domains,
        sharedDomains,
        offers,
        suspHistory,
        couponUsage,
        commissionsEarned,
        commissionsReferred,
        affiliateCoupons,
        clickHistory,
      ] = await Promise.all([
        user.planId ? storage.getPlan(user.planId) : Promise.resolve(null),
        storage.getDomainsByUserId(userId),
        storage.getUserSharedDomains(userId),
        storage.getOffersByUserId(userId),
        storage.getSuspensionHistory(userId, 20),
        storage.getCouponUsageByUserId(userId),
        storage.getCommissionsByAffiliateId(userId),
        storage.getCommissionsByReferredUserId(userId),
        storage.getCouponsByAffiliateId(userId),
        storage.getClickLogsByPeriod(userId, 30),
      ]);

      let couponUsedDetails = null;
      if (couponUsage) {
        const coupon = await storage.getCoupon(couponUsage.couponId);
        couponUsedDetails = { usage: couponUsage, coupon };
      }

      const lifetimeClicks = offers.reduce((sum, o) => sum + (o.totalClicks || 0), 0);
      const lifetimeBlack = offers.reduce((sum, o) => sum + (o.blackClicks || 0), 0);
      const lifetimeWhite = offers.reduce((sum, o) => sum + (o.whiteClicks || 0), 0);

      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      const isAdminUser = user.isAdmin === true || !!(adminEmail && user.email?.toLowerCase() === adminEmail);
      const isSubscriptionActive = ["active", "trialing"].includes(user.subscriptionStatus ?? "");
      const isTrialing = !!(user.trialEndsAt && new Date(user.trialEndsAt) > new Date());
      const isSuspended = user.suspendedAt !== null;

      const { password, ...safeUser } = user;

      res.json({
        profile: { ...safeUser, isAdminUser, isSubscriptionActive, isTrialing, isSuspended },
        plan,
        clickStats: {
          thisMonth: user.clicksUsedThisMonth,
          lifetime: lifetimeClicks,
          lifetimeBlack,
          lifetimeWhite,
        },
        clickHistory,
        domains,
        sharedDomains,
        offers,
        suspensionHistory: suspHistory,
        couponUsed: couponUsedDetails,
        commissionsEarned,
        commissionsReferred,
        affiliateCoupons,
      });
    } catch (error) {
      console.error("Error fetching user details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/suspend", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const adminId = (req.user as any).id;
      const { suspend, reason } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (suspend) {
        await storage.suspendUser(userId, reason || 'admin_action', adminId);
      } else {
        await storage.unsuspendUser(userId, adminId);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users/:id/suspension-history", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const history = await storage.getSuspensionHistory(userId, 100);
      res.json(history);
    } catch (error) {
      console.error("Error fetching suspension history:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/reset-clicks", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.resetUserMonthlyClicks(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting clicks:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/change-plan", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { planId } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const newPlan = await storage.getPlan(planId);
      if (!newPlan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      if (!newPlan.isActive && !newPlan.isFree) {
        return res.status(400).json({ message: `Plan "${newPlan.name}" is deprecated and cannot be assigned to users` });
      }
      
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 30);
      
      if (user.stripeSubscriptionId && newPlan.stripePriceId) {
        try {
          const stripe = await getStripeClient();
          const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
          
          if (subscription && subscription.items?.data?.length > 0) {
            const currentPriceId = subscription.items.data[0].price?.id;
            
            if (currentPriceId !== newPlan.stripePriceId) {
              const subscriptionItemId = subscription.items.data[0].id;
              
              await stripe.subscriptions.update(user.stripeSubscriptionId, {
                items: [{
                  id: subscriptionItemId,
                  price: newPlan.stripePriceId,
                }],
                proration_behavior: 'none',
              });
              
              console.log(`[ADMIN] Updated Stripe subscription for user ${userId} to plan ${newPlan.name} (no charge)`);
            }
          }
        } catch (stripeError: any) {
          console.error(`[ADMIN] Failed to update Stripe subscription:`, stripeError.message);
          return res.status(500).json({ message: "Failed to update Stripe subscription: " + stripeError.message });
        }
      } else if (!user.stripeSubscriptionId && newPlan.stripePriceId) {
        try {
          const stripe = await getStripeClient();
          
          let customerId = user.stripeCustomerId;
          if (!customerId) {
            const customer = await stripe.customers.create({
              email: user.email,
              name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
              metadata: { userId: user.id },
            });
            customerId = customer.id;
            await storage.updateUser(userId, { stripeCustomerId: customerId });
            console.log(`[ADMIN] Created Stripe customer ${customerId} for user ${userId}`);
          }
          
          const trialEnd = Math.floor(subscriptionEndDate.getTime() / 1000);
          const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: newPlan.stripePriceId }],
            trial_end: trialEnd,
          });
          
          await storage.updateUser(userId, { 
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionEndDate,
          });
          
          console.log(`[ADMIN] Created Stripe subscription ${subscription.id} for user ${userId} with 30-day trial (status: ${subscription.status})`);
        } catch (stripeError: any) {
          console.error(`[ADMIN] Failed to create Stripe subscription:`, stripeError.message);
          return res.status(500).json({ message: "Failed to create Stripe subscription: " + stripeError.message });
        }
      }
      
      const updateData: any = { 
        planId,
        suspendedAt: null,
        suspensionReason: null,
        gracePeriodEndsAt: null,
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date(),
      };
      
      if (!user.stripeSubscriptionId) {
        updateData.subscriptionEndDate = subscriptionEndDate;
      }
      
      await storage.updateUser(userId, updateData);
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/add-days", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { days } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const newEnd = new Date();
      newEnd.setDate(newEnd.getDate() + days);
      
      await storage.updateUser(userId, { subscriptionEndDate: newEnd });
      
      console.log(`[ADMIN] Set subscription end date for user ${userId} to ${newEnd.toISOString()} (${days} days from now)`);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting days:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/force-payment", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      await storage.updateUser(userId, {
        subscriptionStatus: "active",
        subscriptionEndDate: endDate,
        suspendedAt: null,
        suspensionReason: null,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error forcing payment:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/sync-stripe", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!user.stripeSubscriptionId) return res.status(400).json({ message: "User has no Stripe subscription" });

      const stripe = await getStripeClient();
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      const stripeStatus = sub.status;
      const periodEndTs = (sub as any).current_period_end;
      const endedAtTs = (sub as any).ended_at;
      const stripeEndDate = periodEndTs ? new Date(periodEndTs * 1000) : null;
      const stripeEndedAt = endedAtTs ? new Date(endedAtTs * 1000) : null;
      const isActive = stripeStatus === 'active' || stripeStatus === 'trialing';

      if (isActive && stripeEndDate) {
        await storage.updateUser(userId, {
          subscriptionStatus: stripeStatus,
          subscriptionEndDate: stripeEndDate,
        });
        console.log(`[Admin sync-stripe] User ${userId} is still active in Stripe, updated end date`);
        return res.json({ status: stripeStatus, subscriptionEndDate: stripeEndDate, action: 'updated' });
      } else {
        await storage.updateUser(userId, {
          subscriptionStatus: stripeStatus,
          subscriptionEndDate: stripeEndedAt ?? stripeEndDate ?? new Date(),
        });
        await storage.downgradeUserToFreePlan(userId);
        console.log(`[Admin sync-stripe] Downgraded user ${userId} to free plan — Stripe status: ${stripeStatus}`);
        return res.json({ status: stripeStatus, action: 'downgraded' });
      }
    } catch (error: any) {
      console.error("Error syncing Stripe subscription:", error);
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/change-password", isAdmin, async (req: Request, res: Response) => {
    try {
      if (req.session.impersonationToken) {
        return res.status(403).json({ message: "Cannot change passwords while impersonating a user. Exit impersonation first." });
      }
      const userId = req.params.id;
      const { password } = req.body;
      
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash(password, 12);
      await storage.updateUser(userId, { password: hashedPassword });
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      if (req.session.impersonationToken) {
        return res.status(403).json({ message: "Cannot delete users while impersonating. Exit impersonation first." });
      }
      const userId = req.params.id;
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.email?.toLowerCase() === adminEmail) {
        return res.status(400).json({ message: "Cannot delete admin user" });
      }
      
      await storage.deleteUserWithCascade(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/impersonate/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const adminId = (req.user as any).id;
      const targetUserId = req.params.id;

      if (adminId === targetUserId) {
        return res.status(400).json({ message: "Cannot impersonate yourself" });
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      if (adminEmail && targetUser.email?.toLowerCase() === adminEmail) {
        return res.status(400).json({ message: "Cannot impersonate an admin user" });
      }

      const existingToken = req.session.impersonationToken;
      if (existingToken) {
        await storage.deleteAdminImpersonation(existingToken);
      }

      const sessionToken = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await storage.createAdminImpersonation(adminId, targetUserId, sessionToken, expiresAt);
      req.session.impersonationToken = sessionToken;

      console.log(`[Impersonation] Admin ${adminId} started impersonating user ${targetUserId} (${targetUser.email})`);

      res.json({ success: true });
    } catch (error) {
      console.error("Error impersonating user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/impersonation/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const sessionToken = req.session.impersonationToken;
      if (!sessionToken) {
        return res.json({ isImpersonating: false });
      }
      const impersonation = await storage.getAdminImpersonation(sessionToken);
      if (!impersonation) {
        delete req.session.impersonationToken;
        return res.json({ isImpersonating: false });
      }
      const [targetUser, adminUser] = await Promise.all([
        storage.getUser(impersonation.targetUserId),
        storage.getUser(impersonation.adminId),
      ]);
      res.json({
        isImpersonating: true,
        targetUser: targetUser ? { id: targetUser.id, email: targetUser.email } : null,
        adminUser: adminUser ? { id: adminUser.id, email: adminUser.email } : null,
      });
    } catch (error) {
      console.error("Error checking impersonation status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/impersonation/exit", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const sessionToken = req.session.impersonationToken;
      if (sessionToken) {
        const impersonation = await storage.getAdminImpersonation(sessionToken);
        await storage.deleteAdminImpersonation(sessionToken);
        delete req.session.impersonationToken;
        console.log(`[Impersonation] Admin ${impersonation?.adminId} exited impersonation of ${impersonation?.targetUserId}`);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error exiting impersonation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/config", isAdmin, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAdminSettings();
      res.json({ 
        logoUrl: settings?.logoPath || null,
        supportWhatsapp: settings?.supportWhatsapp || null,
        tiktokFilterEnabled: settings?.tiktokFilterEnabled ?? true,
      });
    } catch (error) {
      console.error("Error fetching admin config:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/config", isAdmin, async (req: Request, res: Response) => {
    try {
      const { supportWhatsapp, tiktokFilterEnabled } = req.body;
      const updateData: Record<string, any> = {};
      if (supportWhatsapp !== undefined) updateData.supportWhatsapp = supportWhatsapp;
      if (tiktokFilterEnabled !== undefined) updateData.tiktokFilterEnabled = tiktokFilterEnabled;
      const settings = await storage.updateAdminSettings(updateData);
      invalidateSettingsCache();
      res.json({ 
        logoUrl: settings?.logoPath || null,
        supportWhatsapp: settings?.supportWhatsapp || null,
        tiktokFilterEnabled: settings?.tiktokFilterEnabled ?? true,
      });
    } catch (error) {
      console.error("Error updating admin config:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN METRICS & DASHBOARD
  // ==========================================

  app.get("/api/admin/system-metrics", isAdmin, async (req: Request, res: Response) => {
    try {
      const metrics = await storage.getSystemMetrics72h();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching system metrics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/dashboard", isAdmin, async (req: Request, res: Response) => {
    try {
      const platform = req.query.platform as string | undefined;
      const metrics = await storage.getAdminDashboardMetrics(platform);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching admin dashboard:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users-new", isAdmin, async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as '7d' | '30d' | '1y') || '7d';
      const data = await storage.getUsersNewByPeriod(period);
      res.json(data);
    } catch (error) {
      console.error("Error fetching new users:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users-ranking", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const period = (req.query.period as 'today' | '7d' | '30d') || 'today';
      const platform = req.query.platform as string | undefined;
      const data = await storage.getUsersRanking(page, limit, period, platform);
      res.json(data);
    } catch (error) {
      console.error("Error fetching users ranking:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN BILLING
  // ==========================================

  app.get("/api/admin/billing/metrics", isAdmin, async (req: Request, res: Response) => {
    try {
      const metrics = await storage.getBillingMetrics();
      
      // totalRevenue: ONLY livemode=true charges (real money)
      // testRevenue:  livemode=false charges (test/fictitious — shown separately)
      let totalRevenue = 0;
      let testRevenue = 0;
      const stripeConfigured = await isStripeConfigured();
      if (stripeConfigured) {
        try {
          const stripe = await getStripeClient();
          let hasMore = true;
          let startingAfter: string | undefined;
          
          while (hasMore) {
            const params: any = { limit: 100 };
            if (startingAfter) {
              params.starting_after = startingAfter;
            }
            const charges = await stripe.charges.list(params);
            const succeeded = charges.data.filter(c => c.status === 'succeeded');
            // Split by livemode
            totalRevenue += succeeded
              .filter(c => c.livemode === true)
              .reduce((sum, c) => sum + c.amount, 0) / 100;
            testRevenue += succeeded
              .filter(c => c.livemode === false)
              .reduce((sum, c) => sum + c.amount, 0) / 100;
            hasMore = charges.has_more;
            if (charges.data.length > 0) {
              startingAfter = charges.data[charges.data.length - 1].id;
            }
          }
        } catch (e) {
          console.error("Error fetching Stripe charges:", e);
        }
      }
      
      // Financial metrics use ONLY Stripe subscriptions as denominator
      const stripeCount = metrics.activeStripeSubscriptions;
      const avgTicket = stripeCount > 0 ? metrics.mrr / stripeCount : 0;
      const ltv = avgTicket * 12;
      const inadimplentes = metrics.gracePeriodCount;
      const inadimplenciaRate = stripeCount > 0 ? (inadimplentes / stripeCount) * 100 : 0;

      res.json({
        subscriptionsActive: metrics.subscriptionsActive,
        subscriptionsInactive: metrics.subscriptionsInactive,
        subscriptionsTrial: metrics.subscriptionsTrial,
        subscriptionsSuspended: metrics.subscriptionsSuspended,
        activeStripeSubscriptions: metrics.activeStripeSubscriptions,
        activeManualSubscriptions: metrics.activeManualSubscriptions,
        gracePeriodCount: metrics.gracePeriodCount,
        usersToday: metrics.usersToday,
        usersThisMonth: metrics.usersThisMonth,
        mrr: metrics.mrr,
        arr: metrics.arr,
        avgTicket,
        ltv,
        inadimplenciaRate,
        totalRevenue,
        testRevenue,
        manualUsersCount: metrics.manualUsersCount,
        manualPlansValue: metrics.manualPlansValue,
      });
    } catch (error) {
      console.error("Error fetching billing metrics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/billing/subscribers", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const planId = req.query.planId ? parseInt(req.query.planId as string) : undefined;
      const status = req.query.status as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const data = await storage.getSubscribersWithPagination(page, limit, { planId, status, startDate, endDate });
      res.json({ ...data, page, limit });
    } catch (error) {
      console.error("Error fetching subscribers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/billing/payments", isAdmin, async (req: Request, res: Response) => {
    try {
      const stripeConfigured = await isStripeConfigured();
      if (!stripeConfigured) {
        return res.json({ payments: [], total: 0 });
      }
      
      const stripe = await getStripeClient();
      const limit = parseInt(req.query.limit as string) || 25;
      const startingAfter = req.query.startingAfter as string | undefined;
      
      const params: any = { limit };
      if (startingAfter) {
        params.starting_after = startingAfter;
      }
      
      const charges = await stripe.charges.list(params);
      
      const payments = await Promise.all(
        charges.data.map(async (charge) => {
          let userEmail = null;
          if (charge.customer) {
            const user = await storage.getUserByStripeCustomerId(charge.customer as string);
            userEmail = user?.email || null;
          }
          return {
            id: charge.id,
            amount: charge.amount / 100,
            currency: charge.currency,
            status: charge.status,
            date: charge.created ? new Date(charge.created * 1000).toISOString() : null,
            userEmail,
            description: charge.description,
          };
        })
      );
      
      res.json({
        payments,
        hasMore: charges.has_more,
        lastId: charges.data.length > 0 ? charges.data[charges.data.length - 1].id : null,
      });
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/billing/subscriptions-chart", isAdmin, async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as '7d' | '30d' | '1y') || '30d';
      const data = await storage.getUsersNewByPeriod(period);
      res.json(data);
    } catch (error) {
      console.error("Error fetching subscriptions chart:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN PLANS
  // ==========================================

  app.get("/api/admin/plans", isAdmin, async (req: Request, res: Response) => {
    try {
      const allPlans = await storage.getAllPlans();
      res.json(allPlans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/plans", isAdmin, async (req: Request, res: Response) => {
    try {
      const plan = await storage.createPlan(req.body);
      res.json(plan);
    } catch (error: any) {
      console.error("Error creating plan:", error);
      if (error?.message?.includes("already exists") || error?.message?.includes("required") || error?.message?.includes("cannot be negative")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/plans/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      const updated = await storage.updatePlan(planId, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating plan:", error);
      if (error?.message?.includes("already exists") || error?.message?.includes("required") || error?.message?.includes("cannot be negative")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/plans/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      const plan = await storage.getPlan(planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.isFree || plan.isDefault) {
        return res.status(400).json({ message: "Cannot delete the free/default plan" });
      }
      await storage.deletePlan(planId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting plan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN SHARED DOMAINS
  // ==========================================

  app.get("/api/admin/shared-domains", isAdmin, async (req: Request, res: Response) => {
    try {
      const domains = await storage.getAllSharedDomains();
      res.json(domains);
    } catch (error) {
      console.error("Error fetching shared domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/shared-domains/inactive", isAdmin, async (req: Request, res: Response) => {
    try {
      const domains = await storage.getInactiveSharedDomains();
      res.json(domains);
    } catch (error) {
      console.error("Error fetching inactive shared domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/shared-domains", isAdmin, async (req: Request, res: Response) => {
    try {
      let { subdomain } = req.body;
      
      if (!subdomain || typeof subdomain !== "string") {
        return res.status(400).json({ message: "Subdomain is required" });
      }
      
      subdomain = subdomain
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")
        .replace(/^www\./, "")
        .trim();
      
      const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
      if (!domainRegex.test(subdomain)) {
        return res.status(400).json({ message: "Invalid domain format. Use format: subdomain.domain.com" });
      }
      
      const existingDomain = await storage.getDomainBySubdomain(subdomain);
      const existingShared = await storage.getSharedDomainBySubdomain(subdomain);
      
      if (existingDomain || existingShared) {
        return res.status(400).json({ message: "Domain already exists" });
      }
      
      let domain = await storage.createSharedDomain({
        subdomain,
        isActive: false,
        isVerified: false,
        sslStatus: "pending",
      });
      
      const { easypanelService } = await import("../easypanel");
      if (easypanelService.isConfigured()) {
        const result = await easypanelService.addDomain(subdomain);
        if (result.success && result.domainId) {
          domain = await storage.updateSharedDomain(domain.id, {
            easypanelDomainId: result.domainId
          }) || domain;
        } else {
          console.warn(`[SharedDomains] Failed to sync with EasyPanel for ${subdomain}: ${result.error}`);
        }
      }
      
      res.json(domain);
    } catch (error) {
      console.error("Error creating shared domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/shared-domains/:id/verify", isAdmin, async (req: Request, res: Response) => {
    try {
      const domainId = parseInt(req.params.id);
      const domain = await storage.getSharedDomain(domainId);
      
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }
      
      const dnsResult = await verifyDomainDNS(domain.subdomain, "admin_verify");

      const richPayload = {
        verified: dnsResult.verified,
        errorType: dnsResult.errorType,
        error: dnsResult.error || null,
        transient: dnsResult.allTransient,
        resolverResults: dnsResult.resolverResults,
        foundCnames: dnsResult.foundCnames,
        expectedCname: dnsResult.expectedCname,
        source: dnsResult.source,
        checkedAt: dnsResult.checkedAt,
        resolverUsed: dnsResult.resolverUsed,
      };

      if (dnsResult.verified) {
        console.log(JSON.stringify({
          event: "DOMAIN_STATE_CHANGE", changed: true,
          domain: domain.subdomain, domainId, domainType: "shared", source: "admin_verify",
          previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
          newState: { isActive: true, isVerified: true, sslStatus: "active" },
          OFFICIAL_CNAME_value: dnsResult.expectedCname, resolver: dnsResult.resolverUsed,
          processPid: process.pid, hostname: require("os").hostname(), timestamp: new Date().toISOString(),
        }));
        const updated = await storage.updateSharedDomain(domainId, {
          isVerified: true, isActive: true,
          lastCheckedAt: new Date(), lastVerificationError: null, sslStatus: "active",
        });
        resetConsecutiveFailures("shared", domainId);
        return res.json({ ...richPayload, domain: updated });
      }

      if (dnsResult.allTransient) {
        console.log(JSON.stringify({
          event: "MANUAL_VERIFY_TRANSIENT",
          domain: domain.subdomain, domainId, domainType: "shared", source: "admin_verify",
          error: dnsResult.error, resolverUsed: dnsResult.resolverUsed,
          note: "Transient DNS — state preserved",
          processPid: process.pid, hostname: require("os").hostname(), timestamp: new Date().toISOString(),
        }));
        await storage.updateSharedDomain(domainId, {
          lastCheckedAt: new Date(),
          lastVerificationError: `[DNS instável] ${dnsResult.error}`,
        });
        const current = await storage.getSharedDomain(domainId);
        return res.json({ ...richPayload, domain: current });
      }

      // Permanent / mismatch — mark isVerified=false but do NOT deactivate
      console.log(JSON.stringify({
        event: "DOMAIN_STATE_CHANGE", changed: domain.isVerified !== false,
        domain: domain.subdomain, domainId, domainType: "shared", source: "admin_verify",
        previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
        newState: { isActive: domain.isActive, isVerified: false },
        OFFICIAL_CNAME_value: dnsResult.expectedCname, resolver: dnsResult.resolverUsed,
        error: dnsResult.error, errorType: dnsResult.errorType,
        processPid: process.pid, hostname: require("os").hostname(), timestamp: new Date().toISOString(),
      }));
      const updated = await storage.updateSharedDomain(domainId, {
        isVerified: false,
        lastCheckedAt: new Date(),
        lastVerificationError: dnsResult.error || "DNS verification failed",
      });
      return res.json({ ...richPayload, domain: updated });
    } catch (error) {
      console.error("Error verifying shared domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/shared-domains/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const domainId = parseInt(req.params.id);
      const domain = await storage.getSharedDomain(domainId);
      
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }
      
      const { easypanelService } = await import("../easypanel");
      if (easypanelService.isConfigured() && domain.easypanelDomainId) {
        await easypanelService.removeDomain(domain.easypanelDomainId);
      }
      
      await storage.deleteSharedDomain(domainId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shared domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Shared domains - User route (get available shared domains)
  app.get("/api/shared-domains", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const domains = await storage.getActiveSharedDomains();
      res.json(domains);
    } catch (error) {
      console.error("Error fetching shared domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // User shared domains - Get user's activated shared domains
  app.get("/api/user/shared-domains", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const userSharedDomains = await storage.getUserSharedDomains(userId);
      res.json(userSharedDomains);
    } catch (error) {
      console.error("Error fetching user shared domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // User shared domains - Activate a shared domain
  app.post("/api/user/shared-domains/:sharedDomainId/activate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const sharedDomainId = parseInt(req.params.sharedDomainId);
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found", code: "USER_NOT_FOUND" });
      }
      if (user.suspendedAt) {
        return res.status(403).json({ message: "Account suspended", code: "USER_SUSPENDED" });
      }
      
      if (!user.planId || !["active", "trialing"].includes(user.subscriptionStatus || "")) {
        return res.status(403).json({ message: "No active plan", code: "NO_ACTIVE_PLAN" });
      }
      
      const plan = await storage.getPlan(user.planId);
      if (!plan) {
        return res.status(403).json({ message: "Plan not found", code: "NO_ACTIVE_PLAN" });
      }
      
      const totalDomainsCount = await storage.getUserTotalDomainsCount(userId);
      
      if (!plan.isUnlimited && totalDomainsCount >= plan.maxDomains) {
        return res.status(403).json({ 
          message: "Maximum number of domains reached", 
          code: "DOMAIN_LIMIT_REACHED" 
        });
      }
      
      const sharedDomain = await storage.getSharedDomain(sharedDomainId);
      if (!sharedDomain || !sharedDomain.isActive) {
        return res.status(404).json({ message: "Shared domain not found or inactive" });
      }
      
      const activation = await storage.activateSharedDomain(userId, sharedDomainId);
      res.json({ ...activation, sharedDomain });
    } catch (error) {
      console.error("Error activating shared domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // User shared domains - Deactivate a shared domain
  app.delete("/api/user/shared-domains/:sharedDomainId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const sharedDomainId = parseInt(req.params.sharedDomainId);
      
      await storage.deactivateUserSharedDomain(userId, sharedDomainId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deactivating shared domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user's total domain count (own + activated shared)
  app.get("/api/user/domains-count", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const count = await storage.getUserTotalDomainsCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching domain count:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN DOMAIN MANAGEMENT
  // ==========================================

  app.get("/api/admin/domains", isAdmin, async (req: Request, res: Response) => {
    try {
      const type = req.query.type as 'user' | 'shared' | undefined;
      const search = req.query.search as string | undefined;
      const status = req.query.status as 'active' | 'inactive' | undefined;

      const domains = await storage.getAllSystemDomains({ type, search, status });
      res.json(domains);
    } catch (error) {
      console.error("Error fetching all domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/domains/:id/verify", isAdmin, async (req: Request, res: Response) => {
    try {
      const domainId = parseInt(req.params.id);
      const domain = await storage.getDomain(domainId);
      
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }
      
      const dnsResult = await verifyDomainDNS(domain.subdomain, "admin_verify");

      const richPayload = {
        verified: dnsResult.verified,
        errorType: dnsResult.errorType,
        error: dnsResult.error || null,
        transient: dnsResult.allTransient,
        resolverResults: dnsResult.resolverResults,
        foundCnames: dnsResult.foundCnames,
        expectedCname: dnsResult.expectedCname,
        source: dnsResult.source,
        checkedAt: dnsResult.checkedAt,
        resolverUsed: dnsResult.resolverUsed,
      };

      if (dnsResult.verified) {
        console.log(JSON.stringify({
          event: "DOMAIN_STATE_CHANGE", changed: true,
          domain: domain.subdomain, domainId, domainType: "user", source: "admin_verify",
          previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
          newState: { isActive: true, isVerified: true, sslStatus: "active" },
          OFFICIAL_CNAME_value: dnsResult.expectedCname, resolver: dnsResult.resolverUsed,
          processPid: process.pid, hostname: require("os").hostname(), timestamp: new Date().toISOString(),
        }));
        const updated = await storage.updateDomain(domainId, {
          isVerified: true, isActive: true,
          lastCheckedAt: new Date(), lastVerificationError: null, sslStatus: "active",
        });
        resetConsecutiveFailures("user", domainId);
        return res.json({ ...richPayload, domain: updated });
      }

      if (dnsResult.allTransient) {
        console.log(JSON.stringify({
          event: "MANUAL_VERIFY_TRANSIENT",
          domain: domain.subdomain, domainId, domainType: "user", source: "admin_verify",
          error: dnsResult.error, resolverUsed: dnsResult.resolverUsed,
          note: "Transient DNS — state preserved",
          processPid: process.pid, hostname: require("os").hostname(), timestamp: new Date().toISOString(),
        }));
        await storage.updateDomain(domainId, {
          lastCheckedAt: new Date(),
          lastVerificationError: `[DNS instável] ${dnsResult.error}`,
        });
        const current = await storage.getDomain(domainId);
        return res.json({ ...richPayload, domain: current });
      }

      // Permanent / mismatch — mark isVerified=false but do NOT deactivate
      console.log(JSON.stringify({
        event: "DOMAIN_STATE_CHANGE", changed: domain.isVerified !== false,
        domain: domain.subdomain, domainId, domainType: "user", source: "admin_verify",
        previousState: { isActive: domain.isActive, isVerified: domain.isVerified },
        newState: { isActive: domain.isActive, isVerified: false },
        OFFICIAL_CNAME_value: dnsResult.expectedCname, resolver: dnsResult.resolverUsed,
        error: dnsResult.error, errorType: dnsResult.errorType,
        processPid: process.pid, hostname: require("os").hostname(), timestamp: new Date().toISOString(),
      }));
      const updated = await storage.updateDomain(domainId, {
        isVerified: false,
        lastCheckedAt: new Date(),
        lastVerificationError: dnsResult.error || "DNS verification failed",
      });
      return res.json({ ...richPayload, domain: updated });
    } catch (error) {
      console.error("Error verifying user domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/domains/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const domainId = parseInt(req.params.id);
      const domainType = req.query.type as 'user' | 'shared';
      const removalReason = (req.query.reason as string) || 'admin_action';
      const adminId = req.user!.id;

      if (!domainType || !['user', 'shared'].includes(domainType)) {
        return res.status(400).json({ message: "Invalid domain type. Must be 'user' or 'shared'" });
      }

      let usersWhoActivatedDomain: Array<{ userId: string; email: string; firstName: string | null }> = [];
      if (domainType === 'shared') {
        usersWhoActivatedDomain = await storage.getUsersWithActiveSharedDomain(domainId);
      }

      const result = await storage.removeDomainByAdmin(domainId, domainType, adminId, removalReason);

      const usersToNotify = new Map<string, { email: string; firstName: string; offers: string[] }>();

      for (const offer of result.affectedOffers) {
        if (!usersToNotify.has(offer.userId)) {
          const user = await storage.getUser(offer.userId);
          usersToNotify.set(offer.userId, {
            email: user?.email || '',
            firstName: user?.firstName || 'Usuário',
            offers: []
          });
        }
        usersToNotify.get(offer.userId)!.offers.push(offer.offerName);
      }

      for (const userActivation of usersWhoActivatedDomain) {
        if (!usersToNotify.has(userActivation.userId)) {
          usersToNotify.set(userActivation.userId, {
            email: userActivation.email,
            firstName: userActivation.firstName || 'Usuário',
            offers: []
          });
        }
      }

      if (domainType === 'user' && result.originalOwner && !usersToNotify.has(result.originalOwner.id)) {
        usersToNotify.set(result.originalOwner.id, {
          email: result.originalOwner.email,
          firstName: result.originalOwner.firstName || 'Usuário',
          offers: []
        });
      }

      for (const [userId, userData] of usersToNotify.entries()) {
        const firstName = userData.firstName;
        const titlePt = "Domínio Removido";
        const titleEn = "Domain Removed";
        
        let messagePt: string;
        let messageEn: string;
        const hasOffers = userData.offers.length > 0;
        const offerNames = userData.offers.join(", ");
        
        switch (removalReason) {
          case 'phishing':
            messagePt = hasOffers 
              ? `Olá ${firstName}, identificamos que o domínio ${result.subdomain} configurado em sua conta foi alvo de uma denúncia externa por violação de política. Por esse motivo, o domínio foi removido para evitar incidentes futuros. As ofertas afetadas: ${offerNames}. Acesse sua conta para configurar um novo domínio.`
              : `Olá ${firstName}, identificamos que o domínio ${result.subdomain} que você havia ativado foi alvo de uma denúncia externa por violação de política. Por esse motivo, o domínio foi removido da plataforma.`;
            messageEn = hasOffers 
              ? `Hello ${firstName}, we identified that the domain ${result.subdomain} configured in your account was the target of an external report for policy violation. For this reason, the domain was removed to prevent future incidents. Affected offers: ${offerNames}. Please access your account to configure a new domain.`
              : `Hello ${firstName}, we identified that the domain ${result.subdomain} you had activated was the target of an external report for policy violation. For this reason, the domain was removed from the platform.`;
            break;
          case 'inactive':
            messagePt = hasOffers
              ? `Olá ${firstName}, o domínio ${result.subdomain} configurado em sua conta foi identificado como inativo durante as verificações automáticas do sistema, verifique suas ofertas a fim de evitar erros de redirecionamento, loops ou tráfego inválido.`
              : `Olá ${firstName}, o domínio ${result.subdomain} que você havia ativado foi identificado como inativo e foi removido da plataforma.`;
            messageEn = hasOffers
              ? `Hello ${firstName}, the domain ${result.subdomain} configured in your account was identified as inactive during automatic system checks. Please check your offers to avoid redirection errors, loops, or invalid traffic.`
              : `Hello ${firstName}, the domain ${result.subdomain} you had activated was identified as inactive and has been removed from the platform.`;
            break;
          case 'admin_action':
          default:
            messagePt = hasOffers
              ? `Olá ${firstName}, o domínio ${result.subdomain} foi removido da plataforma por decisão administrativa. As ofertas afetadas: ${offerNames}. Acesse sua conta para configurar um novo domínio.`
              : `Olá ${firstName}, o domínio ${result.subdomain} que você havia ativado foi removido da plataforma por decisão administrativa.`;
            messageEn = hasOffers
              ? `Hello ${firstName}, the domain ${result.subdomain} was removed from the platform by administrative decision. Affected offers: ${offerNames}. Please access your account to configure a new domain.`
              : `Hello ${firstName}, the domain ${result.subdomain} you had activated was removed from the platform by administrative decision.`;
            break;
        }

        await storage.createNotification({
          userId,
          type: "domain_removed",
          titlePt,
          titleEn,
          messagePt,
          messageEn,
        });

        if (userData.email) {
          sendDomainRemovedEmail(userData.email, result.subdomain, removalReason, firstName, userId).catch(err => {
            console.error(`[ADMIN] Failed to send domain removed email to ${userData.email}:`, err);
          });
        }
      }

      if (result.easypanelDomainId) {
        const { easypanelService } = await import("../easypanel");
        if (easypanelService.isConfigured()) {
          easypanelService.removeDomain(result.easypanelDomainId).catch(err => {
            console.error(`[ADMIN] Failed to remove domain from EasyPanel: ${err.message}`);
          });
        }
      }

      res.json({
        success: true,
        subdomain: result.subdomain,
        affectedUsersCount: usersToNotify.size,
        affectedOffersCount: result.affectedOffers.length,
      });
    } catch (error) {
      console.error("Error removing domain:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/domains-bulk", isAdmin, async (req: Request, res: Response) => {
    try {
      const { domains: domainsToDelete, reason } = req.body as {
        domains: Array<{ id: number; type: 'user' | 'shared' }>;
        reason: string;
      };
      const adminId = req.user!.id;
      const removalReason = reason || 'admin_action';

      if (!Array.isArray(domainsToDelete) || domainsToDelete.length === 0) {
        return res.status(400).json({ message: "No domains provided" });
      }

      let totalAffectedOffers = 0;
      const allUsersToNotify = new Map<string, { email: string; firstName: string; offers: string[]; subdomains: string[] }>();

      for (const domainEntry of domainsToDelete) {
        const { id, type } = domainEntry;
        if (!['user', 'shared'].includes(type)) continue;

        let usersWhoActivatedDomain: Array<{ userId: string; email: string; firstName: string | null }> = [];
        if (type === 'shared') {
          usersWhoActivatedDomain = await storage.getUsersWithActiveSharedDomain(id);
        }

        const result = await storage.removeDomainByAdmin(id, type, adminId, removalReason);
        totalAffectedOffers += result.affectedOffers.length;

        if (result.easypanelDomainId) {
          const { easypanelService } = await import("../easypanel");
          if (easypanelService.isConfigured()) {
            easypanelService.removeDomain(result.easypanelDomainId).catch(err => {
              console.error(`[ADMIN BULK] Failed to remove domain ${result.subdomain} from EasyPanel: ${err.message}`);
            });
          }
        }

        for (const offer of result.affectedOffers) {
          if (!allUsersToNotify.has(offer.userId)) {
            const user = await storage.getUser(offer.userId);
            allUsersToNotify.set(offer.userId, {
              email: user?.email || '',
              firstName: user?.firstName || 'Usuário',
              offers: [],
              subdomains: [],
            });
          }
          const u = allUsersToNotify.get(offer.userId)!;
          u.offers.push(offer.offerName);
          if (!u.subdomains.includes(result.subdomain)) u.subdomains.push(result.subdomain);
        }

        for (const userActivation of usersWhoActivatedDomain) {
          if (!allUsersToNotify.has(userActivation.userId)) {
            allUsersToNotify.set(userActivation.userId, {
              email: userActivation.email,
              firstName: userActivation.firstName || 'Usuário',
              offers: [],
              subdomains: [],
            });
          }
          const u = allUsersToNotify.get(userActivation.userId)!;
          if (!u.subdomains.includes(result.subdomain)) u.subdomains.push(result.subdomain);
        }

        if (type === 'user' && result.originalOwner && !allUsersToNotify.has(result.originalOwner.id)) {
          allUsersToNotify.set(result.originalOwner.id, {
            email: result.originalOwner.email,
            firstName: result.originalOwner.firstName || 'Usuário',
            offers: [],
            subdomains: [result.subdomain],
          });
        }
      }

      for (const [userId, userData] of allUsersToNotify.entries()) {
        const firstName = userData.firstName;
        const subdomainList = userData.subdomains.join(", ");
        const offerNames = userData.offers.join(", ");
        const hasOffers = userData.offers.length > 0;

        let messagePt: string;
        let messageEn: string;

        switch (removalReason) {
          case 'phishing':
            messagePt = hasOffers
              ? `Olá ${firstName}, os domínios ${subdomainList} configurados em sua conta foram removidos por violação de política. Ofertas afetadas: ${offerNames}. Acesse sua conta para configurar novos domínios.`
              : `Olá ${firstName}, os domínios ${subdomainList} foram removidos por violação de política.`;
            messageEn = hasOffers
              ? `Hello ${firstName}, the domains ${subdomainList} configured in your account were removed for policy violation. Affected offers: ${offerNames}. Please access your account to configure new domains.`
              : `Hello ${firstName}, the domains ${subdomainList} were removed for policy violation.`;
            break;
          case 'inactive':
            messagePt = `Olá ${firstName}, os domínios ${subdomainList} foram identificados como inativos e removidos. ${hasOffers ? `Ofertas afetadas: ${offerNames}.` : ''} Verifique sua conta.`;
            messageEn = `Hello ${firstName}, the domains ${subdomainList} were identified as inactive and removed. ${hasOffers ? `Affected offers: ${offerNames}.` : ''} Please check your account.`;
            break;
          default:
            messagePt = hasOffers
              ? `Olá ${firstName}, os domínios ${subdomainList} foram removidos por decisão administrativa. Ofertas afetadas: ${offerNames}. Acesse sua conta para configurar novos domínios.`
              : `Olá ${firstName}, os domínios ${subdomainList} foram removidos por decisão administrativa.`;
            messageEn = hasOffers
              ? `Hello ${firstName}, the domains ${subdomainList} were removed by administrative decision. Affected offers: ${offerNames}. Please access your account to configure new domains.`
              : `Hello ${firstName}, the domains ${subdomainList} were removed by administrative decision.`;
            break;
        }

        await storage.createNotification({
          userId,
          type: "domain_removed",
          titlePt: "Domínios Removidos",
          titleEn: "Domains Removed",
          messagePt,
          messageEn,
        });

        if (userData.email) {
          for (const subdomain of userData.subdomains) {
            sendDomainRemovedEmail(userData.email, subdomain, removalReason, firstName, userId).catch(err => {
              console.error(`[ADMIN] Failed to send bulk domain removed email to ${userData.email}:`, err);
            });
          }
        }
      }

      res.json({
        success: true,
        deletedCount: domainsToDelete.length,
        affectedUsersCount: allUsersToNotify.size,
        affectedOffersCount: totalAffectedOffers,
      });
    } catch (error) {
      console.error("Error bulk removing domains:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/domains/history", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;

      const result = await storage.getRemovedDomainsHistory(page, limit);
      res.json(result);
    } catch (error) {
      console.error("Error fetching removed domains history:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN COUPON MANAGEMENT
  // ==========================================

  app.get("/api/admin/coupons", isAdmin, async (req: Request, res: Response) => {
    try {
      const coupons = await storage.getAllCoupons();
      res.json(coupons);
    } catch (error) {
      console.error("Error fetching coupons:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/coupons/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const coupon = await storage.getCoupon(id);
      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }
      res.json(coupon);
    } catch (error) {
      console.error("Error fetching coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/coupons", isAdmin, async (req: Request, res: Response) => {
    try {
      const {
        code,
        discountType,
        discountValue,
        discountDurationMonths,
        affiliateUserId,
        commissionType,
        commissionValue,
        commissionDurationMonths,
        validPlanIds,
        expiresAt,
        isActive,
      } = req.body;

      if (!code || !discountType || discountValue === undefined) {
        return res.status(400).json({ message: "Code, discountType, and discountValue are required" });
      }

      const existing = await storage.getCouponByCode(code);
      if (existing) {
        return res.status(400).json({ message: "Coupon code already exists" });
      }

      if (affiliateUserId) {
        const affiliate = await storage.getUser(affiliateUserId);
        if (!affiliate) {
          return res.status(400).json({ message: "Affiliate user not found" });
        }
      }

      const coupon = await storage.createCoupon({
        code,
        discountType,
        discountValue,
        discountDurationMonths: discountDurationMonths || null,
        affiliateUserId: affiliateUserId || null,
        commissionType: commissionType || null,
        commissionValue: commissionValue || null,
        commissionDurationMonths: commissionDurationMonths || 1,
        validPlanIds: validPlanIds || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive !== undefined ? isActive : true,
      });

      res.status(201).json(coupon);
    } catch (error) {
      console.error("Error creating coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/coupons/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const coupon = await storage.getCoupon(id);
      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }

      if (req.body.code && req.body.code.toUpperCase() !== coupon.code) {
        const existing = await storage.getCouponByCode(req.body.code);
        if (existing) {
          return res.status(400).json({ message: "Coupon code already exists" });
        }
      }

      if (req.body.affiliateUserId) {
        const affiliate = await storage.getUser(req.body.affiliateUserId);
        if (!affiliate) {
          return res.status(400).json({ message: "Affiliate user not found" });
        }
      }

      const updated = await storage.updateCoupon(id, {
        ...req.body,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : req.body.expiresAt,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/coupons/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const coupon = await storage.getCoupon(id);
      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }

      await storage.deleteCoupon(id);
      res.json({ message: "Coupon deleted" });
    } catch (error) {
      console.error("Error deleting coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/coupons/:id/usages", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const usages = await storage.getCouponUsagesByCouponId(id);
      res.json(usages);
    } catch (error) {
      console.error("Error fetching coupon usages:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/coupons/reports/summary", isAdmin, async (req: Request, res: Response) => {
    try {
      const reports = await storage.getCouponReports();
      res.json(reports);
    } catch (error) {
      console.error("Error fetching coupon reports:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN COMMISSION MANAGEMENT
  // ==========================================

  // Admin commission dashboard metrics
  app.get("/api/admin/commissions/dashboard", isAdmin, async (req: Request, res: Response) => {
    try {
      const dashboard = await storage.getAdminCommissionsDashboard();
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching commission dashboard:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export commissions as CSV
  app.get("/api/admin/commissions/export", isAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const type = req.query.type as string | undefined;
      const affiliateUserId = req.query.affiliateId as string | undefined;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

      const result = await storage.getAllCommissionsFiltered({
        page: 1, limit: 10000, status, type, affiliateUserId, dateFrom, dateTo,
      });

      const headers = [
        "ID", "Afiliado", "Indicado", "Cupom", "Invoice Stripe",
        "Subscription Stripe", "Tipo", "Status", "Valor (R$)",
        "Meses Comissão", "Data Criação", "Data Pagamento",
        "Data Estorno", "Motivo Estorno"
      ].join(",");

      const rows = result.commissions.map(c => [
        c.id,
        c.affiliateEmail || c.affiliateUserId,
        c.referredUserEmail || c.referredUserId,
        c.couponCode || c.couponId,
        c.stripeInvoiceId || "",
        c.stripeSubscriptionId || "",
        c.type || "",
        c.status,
        (c.amount / 100).toFixed(2),
        c.commissionDurationMonths || "",
        c.createdAt ? new Date(c.createdAt).toISOString() : "",
        c.paidAt ? new Date(c.paidAt).toISOString() : "",
        c.reversedAt ? new Date(c.reversedAt).toISOString() : "",
        c.reversedReason || "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

      const csv = [headers, ...rows].join("\n");
      const filename = `commissions-${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send("\ufeff" + csv); // BOM for Excel UTF-8
    } catch (error) {
      console.error("Error exporting commissions:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/commissions", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const status = req.query.status as string | undefined;
      const type = req.query.type as string | undefined;
      const affiliateUserId = req.query.affiliateId as string | undefined;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

      const result = await storage.getAllCommissionsFiltered({
        page, limit, status, type, affiliateUserId, dateFrom, dateTo,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching commissions:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/commissions/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const commission = await storage.getCommission(id);
      if (!commission) {
        return res.status(404).json({ message: "Commission not found" });
      }
      res.json(commission);
    } catch (error) {
      console.error("Error fetching commission:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/commissions/:id/pay", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const adminId = req.user!.id;
      
      const commission = await storage.getCommission(id);
      if (!commission) {
        return res.status(404).json({ message: "Commission not found" });
      }

      if (commission.status !== "pending") {
        return res.status(400).json({ message: "Commission is not pending" });
      }

      const updated = await storage.markCommissionAsPaid(id, adminId);
      res.json(updated);
    } catch (error) {
      console.error("Error paying commission:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/commissions/:id/reverse", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;
      
      if (!reason) {
        return res.status(400).json({ message: "Reason is required" });
      }

      const commission = await storage.getCommission(id);
      if (!commission) {
        return res.status(404).json({ message: "Commission not found" });
      }

      if (commission.status === "reversed") {
        return res.status(400).json({ message: "Commission is already reversed" });
      }

      const updated = await storage.reverseCommission(id, reason);
      res.json(updated);
    } catch (error) {
      console.error("Error reversing commission:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN EMAIL LOGS
  // ==========================================

  app.get("/api/admin/emails", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const result = await storage.getEmailLogs(page, limit, {
        type: req.query.type as string | undefined,
        status: req.query.status as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        search: req.query.search as string | undefined,
        order: req.query.order as string | undefined,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching email logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users/:id/emails", isAdmin, async (req: Request, res: Response) => {
    try {
      const emails = await storage.getEmailLogsByUserId(req.params.id, 50);
      res.json(emails);
    } catch (error) {
      console.error("Error fetching user email logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/emails/:id/retry", isAdmin, async (req: Request, res: Response) => {
    try {
      const emailId = parseInt(req.params.id);
      if (isNaN(emailId)) return res.status(400).json({ message: "Invalid email ID" });

      const log = await storage.getEmailLogById(emailId);
      if (!log) return res.status(404).json({ message: "Email log not found" });

      const user = log.userId ? await storage.getUser(log.userId) : null;
      const meta = (log.metadata as Record<string, any>) || {};
      const retryCount = (meta.retryCount || 0) + 1;

      const variables: Record<string, string> = {
        firstName: user?.firstName || meta.firstName || 'Cliente',
        name: user?.firstName || meta.firstName || 'Cliente',
        email: log.toEmail,
        planName: meta.planName || meta.plan || 'seu plano',
        domain: meta.domainName || meta.domain || '',
        limitType: meta.limitType || 'clicks',
        currentUsage: String(meta.currentUsage || meta.usage || ''),
        limit: String(meta.limit || ''),
        endDate: meta.endDate || '',
        nextRenewalDate: meta.nextRenewalDate || '',
        reason: meta.reason || '',
        subscriptionStatus: user?.subscriptionStatus || '',
      };

      await sendTemplatedEmail(log.type as any, {
        to: log.toEmail,
        userId: log.userId || undefined,
        locale: 'pt',
        variables,
        fallbackSubject: log.subject,
        fallbackHtml: `<p>${log.subject}</p>`,
        metadata: { ...meta, retryCount, retriedFromId: emailId, isRetry: true },
      });

      console.log(`[ADMIN] Email ${emailId} retried (attempt #${retryCount})`);
      res.json({ success: true, retryCount });
    } catch (error: any) {
      console.error("Error retrying email:", error);
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  app.get("/api/admin/emails/stats", isAdmin, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getEmailStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching email stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // ADMIN EMAIL TEMPLATES
  // ==========================================

  app.post("/api/admin/emails/templates/seed", isAdmin, async (req: Request, res: Response) => {
    try {
      const seeded: string[] = [];
      for (const [type, template] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
        const existing = await storage.getEmailTemplate(type);
        if (!existing) {
          await storage.upsertEmailTemplate({ type, ...template });
          seeded.push(type);
        }
      }
      res.json({ success: true, seeded, message: `${seeded.length} templates criados` });
    } catch (error) {
      console.error("Error seeding email templates:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/emails/templates", isAdmin, async (req: Request, res: Response) => {
    try {
      const templates = await storage.getEmailTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/emails/templates/:type", isAdmin, async (req: Request, res: Response) => {
    try {
      const template = await storage.getEmailTemplate(req.params.type);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching email template:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/emails/templates", isAdmin, async (req: Request, res: Response) => {
    try {
      const templateSchema = z.object({
        type: z.string().min(1),
        subjectPt: z.string().min(1),
        subjectEn: z.string().min(1),
        htmlPt: z.string().min(1),
        htmlEn: z.string().min(1),
        description: z.string().optional(),
      });
      
      const parseResult = templateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid template data", errors: parseResult.error.errors });
      }
      
      const { type, subjectPt, subjectEn, htmlPt, htmlEn, description } = parseResult.data;
      
      const template = await storage.upsertEmailTemplate({
        type,
        subjectPt,
        subjectEn,
        htmlPt,
        htmlEn,
        description,
      });
      
      res.json(template);
    } catch (error) {
      console.error("Error saving email template:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/emails/send-test", isAdmin, async (req: Request, res: Response) => {
    try {
      const testEmailSchema = z.object({
        templateType: z.string().min(1),
        targetEmail: z.string().email(),
        targetUserId: z.string().optional(),
        locale: z.enum(['pt', 'en']).default('pt'),
      });
      
      const parseResult = testEmailSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid request data", errors: parseResult.error.errors });
      }
      
      const { templateType, targetEmail, targetUserId, locale } = parseResult.data;
      
      const template = await storage.getEmailTemplate(templateType);
      if (!template) {
        return res.status(404).json({ message: "Template not found. Please create a template first." });
      }
      
      let userName = locale === 'pt' ? "Usuário Teste" : "Test User";
      if (targetUserId) {
        const user = await storage.getUser(targetUserId);
        if (user) {
          userName = user.firstName || user.email.split("@")[0];
        }
      }
      
      const htmlTemplate = locale === 'pt' ? template.htmlPt : template.htmlEn;
      const subjectTemplate = locale === 'pt' ? template.subjectPt : template.subjectEn;
      
      const today = new Date().toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US');
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US');

      const replacePlaceholders = (text: string) => text
        .replace(/\{\{name\}\}/g, userName)
        .replace(/\{\{firstName\}\}/g, userName)
        .replace(/\{\{email\}\}/g, targetEmail)
        .replace(/\{\{planName\}\}/g, locale === 'pt' ? "Plano Teste" : "Test Plan")
        .replace(/\{\{domain\}\}/g, "example.com")
        .replace(/\{\{limitType\}\}/g, locale === 'pt' ? "cliques" : "clicks")
        .replace(/\{\{currentUsage\}\}/g, "1000")
        .replace(/\{\{limit\}\}/g, "1000")
        .replace(/\{\{endDate\}\}/g, futureDate)
        .replace(/\{\{nextRenewalDate\}\}/g, futureDate)
        .replace(/\{\{reason\}\}/g, locale === 'pt' ? "pagamento pendente" : "pending payment")
        .replace(/\{\{subscriptionStatus\}\}/g, locale === 'pt' ? "ativo" : "active")
        .replace(/\{\{date\}\}/g, today);

      const htmlContent = replacePlaceholders(htmlTemplate);
      const subject = `[TESTE] ${replacePlaceholders(subjectTemplate)}`;

      // Use central sendEmail so test emails appear in email_logs
      const result = await sendEmail({
        to: targetEmail,
        subject,
        html: htmlContent,
        type: templateType as any,
        userId: targetUserId,
        metadata: { isTest: true, locale },
      });

      console.log(`[ADMIN] Test email sent to ${targetEmail} (type: ${templateType}, locale: ${locale})`);
      res.json({ success: true, messageId: result?.id });
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // ADMIN CLICK LOGS — global traffic log for all users
  // ──────────────────────────────────────────────────────────────
  app.get("/api/admin/click-logs", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const page  = parseInt(req.query.page  as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

      const botDetected    = req.query.botDetected    !== undefined && req.query.botDetected    !== "all" ? req.query.botDetected    === "true" : undefined;
      const corporateProxy = req.query.corporateProxy !== undefined && req.query.corporateProxy !== "all" ? req.query.corporateProxy === "true" : undefined;
      const datacenter     = req.query.datacenter     !== undefined && req.query.datacenter     !== "all" ? req.query.datacenter     === "true" : undefined;
      const proxy          = req.query.proxy          !== undefined && req.query.proxy          !== "all" ? req.query.proxy          === "true" : undefined;

      const filters = {
        userId:        req.query.userId        as string | undefined || undefined,
        email:         req.query.email         as string | undefined || undefined,
        offerId:       req.query.offerId       ? parseInt(req.query.offerId as string) : undefined,
        redirectType:  req.query.redirectType  as string | undefined || undefined,
        reason:        req.query.reason        as string | undefined || undefined,
        platform:      req.query.platform      as string | undefined || undefined,
        country:       req.query.country       as string | undefined || undefined,
        device:        req.query.device        as string | undefined || undefined,
        ip:            req.query.ip            as string | undefined || undefined,
        startDate:     req.query.startDate     as string | undefined || undefined,
        endDate:       req.query.endDate       as string | undefined || undefined,
        botDetected,
        corporateProxy,
        datacenter,
        proxy,
      };

      const result = await storage.getAdminClickLogs(page, limit, filters);
      res.json({ ...result, page, limit });
    } catch (error) {
      console.error("[ADMIN] Error fetching click logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // CSV export of admin click logs
  app.get("/api/admin/click-logs/export", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const filters = {
        userId:       req.query.userId       as string | undefined || undefined,
        email:        req.query.email        as string | undefined || undefined,
        offerId:      req.query.offerId      ? parseInt(req.query.offerId as string) : undefined,
        redirectType: req.query.redirectType as string | undefined || undefined,
        reason:       req.query.reason       as string | undefined || undefined,
        platform:     req.query.platform     as string | undefined || undefined,
        country:      req.query.country      as string | undefined || undefined,
        device:       req.query.device       as string | undefined || undefined,
        ip:           req.query.ip           as string | undefined || undefined,
        startDate:    req.query.startDate    as string | undefined || undefined,
        endDate:      req.query.endDate      as string | undefined || undefined,
        botDetected:    req.query.botDetected    !== undefined && req.query.botDetected    !== "all" ? req.query.botDetected    === "true" : undefined,
        corporateProxy: req.query.corporateProxy !== undefined && req.query.corporateProxy !== "all" ? req.query.corporateProxy === "true" : undefined,
        datacenter:     req.query.datacenter     !== undefined && req.query.datacenter     !== "all" ? req.query.datacenter     === "true" : undefined,
        proxy:          req.query.proxy          !== undefined && req.query.proxy          !== "all" ? req.query.proxy          === "true" : undefined,
      };

      const { logs } = await storage.getAdminClickLogs(1, 10000, filters);

      const headers = [
        "id","createdAt","userId","userEmail","userName","offerId","offerName","platform",
        "ipAddress","country","device","redirectedTo","decisionReason","isBotDetected",
        "botReasons","botConfidence","paramsValid","xcodeValid","fbclValid","deviceAllowed",
        "countryAllowed","isDatacenter","isProxy","isCorporateProxy","route","responseTimeMs","requestUrl"
      ];

      const csvRows = [
        headers.join(","),
        ...logs.map(log => {
          const p = (log.allParams as any) || {};
          const escape = (v: any) => {
            if (v === null || v === undefined) return "";
            const s = String(v).replace(/"/g, '""');
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
          };
          return [
            log.id, log.createdAt, log.userId, log.userEmail, log.userName,
            log.offerId, log.offerName, log.platform,
            log.ipAddress, log.country, log.device, log.redirectedTo,
            p.decisionReason, p.isBotDetected,
            Array.isArray(p.botReasons) ? p.botReasons.join("|") : (p.botReasons || ""),
            p.botConfidence, p.paramsValid, p.xcodeValid, p.fbclValid,
            p.deviceAllowed, p.countryAllowed,
            p.isDatacenter, p.isProxy, p.isCorporateProxy, p.route,
            log.responseTimeMs, log.requestUrl
          ].map(escape).join(",");
        }),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=click_logs_admin_${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csvRows);
    } catch (error) {
      console.error("[ADMIN] Error exporting click logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── GET /api/admin/permissions/me ────────────────────────────────────────
  // Returns the full permission set for the currently authenticated admin.
  app.get("/api/admin/permissions/me", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id ?? (req as any).session?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const result = await getUserPermissions(userId);
      res.json(result);
    } catch (err: any) {
      console.error("[Permissions] /me error:", err.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── GET /api/admin/auth-debug ────────────────────────────────────────────
  // Diagnostic endpoint — shows exactly why a request is granted or denied.
  // Protected by requireAdmin so only real admins can call it.
  // Does NOT expose secrets (email is masked after '@').
  app.get("/api/admin/auth-debug", requireAdmin, async (req: Request, res: Response) => {
    try {
      const sessionUserId = (req as any).session?.userId ?? null;
      if (!sessionUserId) {
        return res.json({
          sessionUserId: null,
          loadedUserEmail: null,
          userIsAdminFromDb: false,
          adminEmailConfigured: !!process.env.ADMIN_EMAIL,
          adminEmailMatch: false,
          granted: false,
          source: "none",
          environment: process.env.NODE_ENV ?? "unknown",
        });
      }

      const check = await checkIsAdmin(sessionUserId);

      const maskEmail = (email: string | null | undefined) => {
        if (!email) return null;
        const [local, domain] = email.split("@");
        return `${local.slice(0, 2)}***@${domain}`;
      };

      res.json({
        sessionUserId,
        loadedUserEmail: maskEmail(check.user?.email),
        userIsAdminFromDb: check.userIsAdminFromDb,
        adminEmailConfigured: check.adminEmailConfigured,
        adminEmailMatch: check.adminEmailMatch,
        granted: check.granted,
        source: check.source,
        environment: process.env.NODE_ENV ?? "unknown",
      });
    } catch (err: any) {
      console.error("[Permissions] auth-debug error:", err.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}

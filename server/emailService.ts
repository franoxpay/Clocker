import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const FROM_EMAIL = process.env.SMTP_FROM || "noreply@seudominio.com";
const APP_NAME = "CloakHub";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.log("[Email] SMTP not configured, skipping email:", options.subject);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""),
    });
    console.log(`[Email] Sent "${options.subject}" to ${options.to}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return false;
  }
}

export async function sendWelcomeEmail(
  email: string,
  name: string,
  language: string = "pt"
): Promise<boolean> {
  const isPt = language === "pt";
  
  const subject = isPt 
    ? `Bem-vindo ao ${APP_NAME}!` 
    : `Welcome to ${APP_NAME}!`;

  const html = isPt
    ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0f0f10; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 28px; font-weight: 700; color: #a855f7; }
    .content { background: #1a1a1d; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 16px 0; color: #fafafa; }
    p { margin: 0 0 16px 0; line-height: 1.6; color: #a1a1aa; }
    .button { display: inline-block; background: #a855f7; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .steps { list-style: none; padding: 0; margin: 24px 0; }
    .steps li { padding: 12px 0; border-bottom: 1px solid #27272a; display: flex; align-items: center; gap: 12px; }
    .steps li:last-child { border-bottom: none; }
    .step-num { background: #a855f7; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
    .footer { text-align: center; color: #71717a; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
    </div>
    <div class="content">
      <h1>Ola ${name || "Usuario"}!</h1>
      <p>Sua conta foi criada com sucesso. Estamos muito felizes em te-lo conosco!</p>
      <p>O ${APP_NAME} e a plataforma mais avancada para gerenciar suas campanhas de anuncios com sistema de cloaking inteligente.</p>
      
      <h2 style="font-size: 18px; margin-top: 32px; color: #fafafa;">Como comecar:</h2>
      <ul class="steps">
        <li><span class="step-num">1</span> Cadastre seu primeiro dominio</li>
        <li><span class="step-num">2</span> Crie sua primeira oferta com as paginas black e white</li>
        <li><span class="step-num">3</span> Configure os filtros de pais e dispositivo</li>
        <li><span class="step-num">4</span> Use o link gerado em suas campanhas</li>
      </ul>
      
      <center>
        <a href="https://cloakhub.app/dashboard" class="button">Acessar Dashboard</a>
      </center>
    </div>
    <div class="footer">
      <p>Este email foi enviado por ${APP_NAME}.</p>
      <p>Se voce nao criou esta conta, ignore este email.</p>
    </div>
  </div>
</body>
</html>
`
    : `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0f0f10; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 28px; font-weight: 700; color: #a855f7; }
    .content { background: #1a1a1d; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 16px 0; color: #fafafa; }
    p { margin: 0 0 16px 0; line-height: 1.6; color: #a1a1aa; }
    .button { display: inline-block; background: #a855f7; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .steps { list-style: none; padding: 0; margin: 24px 0; }
    .steps li { padding: 12px 0; border-bottom: 1px solid #27272a; display: flex; align-items: center; gap: 12px; }
    .steps li:last-child { border-bottom: none; }
    .step-num { background: #a855f7; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
    .footer { text-align: center; color: #71717a; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
    </div>
    <div class="content">
      <h1>Hello ${name || "User"}!</h1>
      <p>Your account has been created successfully. We're thrilled to have you with us!</p>
      <p>${APP_NAME} is the most advanced platform for managing your ad campaigns with intelligent cloaking.</p>
      
      <h2 style="font-size: 18px; margin-top: 32px; color: #fafafa;">Getting Started:</h2>
      <ul class="steps">
        <li><span class="step-num">1</span> Register your first domain</li>
        <li><span class="step-num">2</span> Create your first offer with black and white pages</li>
        <li><span class="step-num">3</span> Configure country and device filters</li>
        <li><span class="step-num">4</span> Use the generated link in your campaigns</li>
      </ul>
      
      <center>
        <a href="https://cloakhub.app/dashboard" class="button">Access Dashboard</a>
      </center>
    </div>
    <div class="footer">
      <p>This email was sent by ${APP_NAME}.</p>
      <p>If you did not create this account, please ignore this email.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, html });
}

export async function sendSuspensionEmail(
  email: string,
  name: string,
  reason: "payment" | "clicks",
  language: string = "pt"
): Promise<boolean> {
  const isPt = language === "pt";
  
  const subject = isPt 
    ? `[${APP_NAME}] Conta Suspensa - Acao Necessaria` 
    : `[${APP_NAME}] Account Suspended - Action Required`;

  const reasonText = isPt
    ? reason === "payment" 
      ? "pagamento pendente" 
      : "limite de cliques excedido"
    : reason === "payment"
      ? "pending payment"
      : "click limit exceeded";

  const html = isPt
    ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0f0f10; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 28px; font-weight: 700; color: #a855f7; }
    .content { background: #1a1a1d; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 16px 0; color: #fafafa; }
    p { margin: 0 0 16px 0; line-height: 1.6; color: #a1a1aa; }
    .alert { background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 16px; margin: 16px 0; color: #fecaca; }
    .button { display: inline-block; background: #a855f7; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { text-align: center; color: #71717a; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
    </div>
    <div class="content">
      <h1>Ola ${name || "Usuario"},</h1>
      <div class="alert">
        Sua conta foi suspensa devido a: <strong>${reasonText}</strong>
      </div>
      <p>Suas ofertas nao estao mais redirecionando para as paginas black. Todo o trafego esta sendo enviado para as paginas white.</p>
      <p>Para reativar sua conta, regularize sua situacao acessando o painel:</p>
      <center>
        <a href="https://cloakhub.app/settings" class="button">Regularizar Conta</a>
      </center>
      <p style="font-size: 14px; color: #71717a;">Voce tem 3 dias para regularizar antes da suspensao completa.</p>
    </div>
    <div class="footer">
      <p>Este email foi enviado por ${APP_NAME}.</p>
    </div>
  </div>
</body>
</html>
`
    : `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0f0f10; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 28px; font-weight: 700; color: #a855f7; }
    .content { background: #1a1a1d; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 16px 0; color: #fafafa; }
    p { margin: 0 0 16px 0; line-height: 1.6; color: #a1a1aa; }
    .alert { background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 16px; margin: 16px 0; color: #fecaca; }
    .button { display: inline-block; background: #a855f7; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { text-align: center; color: #71717a; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
    </div>
    <div class="content">
      <h1>Hello ${name || "User"},</h1>
      <div class="alert">
        Your account has been suspended due to: <strong>${reasonText}</strong>
      </div>
      <p>Your offers are no longer redirecting to black pages. All traffic is being sent to white pages.</p>
      <p>To reactivate your account, please resolve the issue by accessing your dashboard:</p>
      <center>
        <a href="https://cloakhub.app/settings" class="button">Resolve Issue</a>
      </center>
      <p style="font-size: 14px; color: #71717a;">You have 3 days to resolve before complete suspension.</p>
    </div>
    <div class="footer">
      <p>This email was sent by ${APP_NAME}.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, html });
}

export async function sendDomainIssueEmail(
  email: string,
  name: string,
  domainName: string,
  language: string = "pt"
): Promise<boolean> {
  const isPt = language === "pt";
  
  const subject = isPt 
    ? `[${APP_NAME}] Problema com Dominio: ${domainName}` 
    : `[${APP_NAME}] Domain Issue: ${domainName}`;

  const html = isPt
    ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0f0f10; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 28px; font-weight: 700; color: #a855f7; }
    .content { background: #1a1a1d; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 16px 0; color: #fafafa; }
    p { margin: 0 0 16px 0; line-height: 1.6; color: #a1a1aa; }
    .warning { background: #422006; border: 1px solid #854d0e; border-radius: 8px; padding: 16px; margin: 16px 0; color: #fef08a; }
    .code { background: #27272a; border-radius: 6px; padding: 8px 12px; font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #e4e4e7; }
    .button { display: inline-block; background: #a855f7; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { text-align: center; color: #71717a; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
    </div>
    <div class="content">
      <h1>Ola ${name || "Usuario"},</h1>
      <div class="warning">
        Detectamos um problema com seu dominio: <strong class="code">${domainName}</strong>
      </div>
      <p>O apontamento DNS nao esta correto ou o certificado SSL nao pode ser gerado.</p>
      <p>Verifique se o registro CNAME esta apontando corretamente para nossos servidores.</p>
      <center>
        <a href="https://cloakhub.app/domains" class="button">Verificar Dominios</a>
      </center>
    </div>
    <div class="footer">
      <p>Este email foi enviado por ${APP_NAME}.</p>
    </div>
  </div>
</body>
</html>
`
    : `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0f0f10; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 28px; font-weight: 700; color: #a855f7; }
    .content { background: #1a1a1d; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 16px 0; color: #fafafa; }
    p { margin: 0 0 16px 0; line-height: 1.6; color: #a1a1aa; }
    .warning { background: #422006; border: 1px solid #854d0e; border-radius: 8px; padding: 16px; margin: 16px 0; color: #fef08a; }
    .code { background: #27272a; border-radius: 6px; padding: 8px 12px; font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #e4e4e7; }
    .button { display: inline-block; background: #a855f7; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { text-align: center; color: #71717a; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
    </div>
    <div class="content">
      <h1>Hello ${name || "User"},</h1>
      <div class="warning">
        We detected an issue with your domain: <strong class="code">${domainName}</strong>
      </div>
      <p>The DNS record is not correctly configured or the SSL certificate could not be generated.</p>
      <p>Please verify that the CNAME record is pointing to our servers correctly.</p>
      <center>
        <a href="https://cloakhub.app/domains" class="button">Check Domains</a>
      </center>
    </div>
    <div class="footer">
      <p>This email was sent by ${APP_NAME}.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, html });
}

export const EmailService = {
  sendWelcomeEmail,
  sendSuspensionEmail,
  sendDomainIssueEmail,
};

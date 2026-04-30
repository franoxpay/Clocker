/**
 * Timezone utilities — Horário de Brasília (BRT = UTC-3)
 *
 * Para alterar o fuso padrão da plataforma, basta mudar:
 *   APP_TZ_OFFSET_HOURS e APP_TZ_NAME
 */
export const APP_TZ_OFFSET_HOURS = -3; // BRT (Brasília)
export const APP_TZ_NAME = "America/Sao_Paulo";

const OFFSET_MS = Math.abs(APP_TZ_OFFSET_HOURS) * 60 * 60 * 1000;

/** Retorna o início do dia (00:00:00.000) no fuso local, expresso em UTC. */
export function startOfLocalDay(utcDate: Date): Date {
  const local = new Date(utcDate.getTime() - OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + OFFSET_MS);
}

/** Retorna o fim do dia (23:59:59.999) no fuso local, expresso em UTC. */
export function endOfLocalDay(utcDate: Date): Date {
  const local = new Date(utcDate.getTime() - OFFSET_MS);
  local.setUTCHours(23, 59, 59, 999);
  return new Date(local.getTime() + OFFSET_MS);
}

/** Meia-noite de hoje no fuso local (UTC). */
export function localTodayStart(): Date {
  return startOfLocalDay(new Date());
}

/** 23:59:59.999 de hoje no fuso local (UTC). */
export function localTodayEnd(): Date {
  return endOfLocalDay(new Date());
}

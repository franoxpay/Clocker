# Restauração de Backup PostgreSQL — Cleryon

## Arquivos de Backup

Os backups ficam na pasta `backups/` na raiz do projeto.

Formato do nome: `backup-YYYY-MM-DD-HH-mm.sql.gz`

Exemplo: `backup-2025-01-30-14-22.sql.gz`

---

## ⚠️ Cuidados ANTES de restaurar

1. **Faça um backup do banco atual antes de restaurar** — a restauração sobrescreve dados existentes.
2. **Pare ou avise os usuários** — a restauração pode causar inconsistências se o app estiver em uso.
3. **Confirme o banco de destino** — nunca restaure produção sem intenção consciente.
4. **Confira o tamanho do arquivo** — um arquivo de backup muito pequeno pode indicar dump incompleto.
5. **Nunca coloque senhas em argumentos de linha de comando** — use `PGPASSWORD` como variável de ambiente.

---

## Restaurar localmente (ambiente de desenvolvimento)

### 1. Descompactar o arquivo

```bash
gunzip backups/backup-2025-01-30-14-22.sql.gz
# Isso cria: backups/backup-2025-01-30-14-22.sql
```

### 2. Restaurar via psql

```bash
# Defina a senha via variável de ambiente (não na linha de comando)
export PGPASSWORD="sua-senha-aqui"

psql \
  --host=SEU_HOST \
  --port=5432 \
  --username=SEU_USUARIO \
  --dbname=SEU_BANCO \
  --file=backups/backup-2025-01-30-14-22.sql
```

> **Usando DATABASE_URL diretamente:**
> ```bash
> export PGPASSWORD="sua-senha"
> psql "$DATABASE_URL" --file=backups/backup-2025-01-30-14-22.sql
> ```

### 3. Confirmar restauração

```bash
psql "$DATABASE_URL" -c "\dt"
# Lista todas as tabelas — confira se estão presentes
```

---

## Restaurar em produção

### Opção A — Via terminal no servidor EasyPanel / VPS

```bash
# 1. Copie o arquivo para o servidor
scp backups/backup-2025-01-30-14-22.sql.gz usuario@servidor:/tmp/

# 2. No servidor, descompacte
gunzip /tmp/backup-2025-01-30-14-22.sql.gz

# 3. Restaure (com senha via env var)
export PGPASSWORD="senha-do-banco-producao"
psql \
  --host=SEU_HOST_PROD \
  --port=5432 \
  --username=SEU_USUARIO \
  --dbname=SEU_BANCO \
  --file=/tmp/backup-2025-01-30-14-22.sql
```

### Opção B — Via DATABASE_URL de produção

```bash
gunzip backups/backup-2025-01-30-14-22.sql.gz

# Use a DATABASE_URL do ambiente de produção
export PGPASSWORD="senha-producao"
psql "postgres://USER@HOST:PORT/DB" --file=backups/backup-2025-01-30-14-22.sql
```

---

## Restaurar apenas uma tabela específica

Se precisar restaurar apenas uma tabela (ex: `users`):

```bash
# Extraia apenas o bloco da tabela do SQL
gunzip -c backups/backup-2025-01-30-14-22.sql.gz \
  | grep -A 99999 "COPY public.users" \
  | grep -B 0 "\\\\." \
  | head -n -1 \
  > /tmp/users-only.sql

psql "$DATABASE_URL" --file=/tmp/users-only.sql
```

> Isso é avançado — prefira restaurar o banco completo quando possível.

---

## Criar backup manual

```bash
npm run db:backup
```

---

## Riscos restantes

| Risco | Descrição | Mitigação |
|---|---|---|
| Backups locais apenas | Os arquivos ficam no servidor/Replit — se o ambiente for destruído, os backups somem | Copie os `.gz` para S3, Google Drive ou outro storage externo |
| Sem rotação automática | O script não apaga backups antigos — a pasta pode crescer indefinidamente | Adicione um cron job para apagar backups com mais de N dias |
| Sem backup agendado | O backup é manual (`npm run db:backup`) | Configure um cron job ou task scheduler para rodar diariamente |
| Restauração não testada regularmente | Um backup corrompido só é descoberto na hora da crise | Faça restaurações de teste periodicamente em ambiente isolado |
| Dados sensíveis no arquivo | O dump contém todos os dados do banco | Armazene backups em local seguro com acesso restrito |

---

## Verificar integridade de um backup sem restaurar

```bash
# Checar se o .gz é válido
gunzip -t backups/backup-2025-01-30-14-22.sql.gz && echo "OK" || echo "ARQUIVO CORROMPIDO"

# Ver quantas linhas tem o SQL
gunzip -c backups/backup-2025-01-30-14-22.sql.gz | wc -l

# Ver as primeiras linhas (cabeçalho do pg_dump)
gunzip -c backups/backup-2025-01-30-14-22.sql.gz | head -20
```

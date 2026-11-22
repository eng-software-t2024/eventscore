-- V14: sessões autenticadas, telemetria operacional e gestão MASTER.
-- A auditoria de negócio existente permanece imutável e sem expurgo.

ALTER TABLE usuario DROP CONSTRAINT usuario_perfil_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_perfil_check
  CHECK (perfil IN ('ADMIN', 'MASTER', 'OPERADOR', 'CONSULTA', 'SISTEMA'));

CREATE TABLE auth_session (
  id UUID PRIMARY KEY,
  id_usuario INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason VARCHAR(12) CHECK (end_reason IS NULL OR end_reason IN ('LOGOUT', 'EXPIRED', 'REVOKED')),
  purge_after TIMESTAMPTZ,
  ip INET,
  user_agent VARCHAR(512),
  CONSTRAINT ck_auth_session_end_consistency CHECK (
    (ended_at IS NULL AND end_reason IS NULL AND purge_after IS NULL)
    OR (ended_at IS NOT NULL AND end_reason IS NOT NULL AND purge_after IS NOT NULL)
  )
);
CREATE INDEX ix_auth_session_usuario_issued ON auth_session(id_usuario, issued_at DESC);
CREATE INDEX ix_auth_session_expiration ON auth_session(expires_at, ended_at);
CREATE INDEX ix_auth_session_purge ON auth_session(purge_after) WHERE purge_after IS NOT NULL;

CREATE TABLE telemetry_period (
  id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ,
  status VARCHAR(8) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  CONSTRAINT ck_telemetry_period_end_consistency CHECK (
    (status = 'OPEN' AND ended_at IS NULL AND purge_after IS NULL)
    OR (status = 'CLOSED' AND ended_at IS NOT NULL AND purge_after IS NOT NULL)
  )
);
CREATE UNIQUE INDEX ux_telemetry_period_open ON telemetry_period(status) WHERE status = 'OPEN';
CREATE INDEX ix_telemetry_period_purge ON telemetry_period(purge_after) WHERE purge_after IS NOT NULL;

CREATE TABLE telemetry_event (
  id UUID PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES telemetry_period(id) ON DELETE CASCADE,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  correlation_id VARCHAR(100),
  source VARCHAR(10) NOT NULL CHECK (source IN ('API', 'FRONTEND', 'AUTH', 'SYSTEM')),
  event_type VARCHAR(60) NOT NULL,
  method VARCHAR(10),
  route VARCHAR(255),
  status INT CHECK (status IS NULL OR status BETWEEN 100 AND 599),
  duration_ms INT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  outcome VARCHAR(12) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE', 'INFO')),
  ip INET,
  user_agent VARCHAR(512),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX ix_telemetry_event_occurred ON telemetry_event(occurred_at DESC);
CREATE INDEX ix_telemetry_event_usuario ON telemetry_event(id_usuario, occurred_at DESC);
CREATE INDEX ix_telemetry_event_type ON telemetry_event(event_type, occurred_at DESC);

CREATE TABLE admin_audit_event (
  id UUID PRIMARY KEY,
  actor_user_id INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  target_user_id INT,
  action VARCHAR(40) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  correlation_id VARCHAR(100),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX ix_admin_audit_occurred ON admin_audit_event(occurred_at DESC);
CREATE INDEX ix_admin_audit_actor ON admin_audit_event(actor_user_id, occurred_at DESC);
CREATE INDEX ix_admin_audit_target ON admin_audit_event(target_user_id, occurred_at DESC);

CREATE FUNCTION impedir_mutacao_admin_audit_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_event é append-only';
END;
$$;
CREATE TRIGGER trg_admin_audit_event_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_event
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_admin_audit_event();

COMMENT ON TABLE auth_session IS 'Sessões JWT persistidas; sem renovação de token. Expurgo 30 dias após encerramento.';
COMMENT ON TABLE telemetry_period IS 'Período de teste de telemetria; fechamento define expurgo em 30 dias.';
COMMENT ON TABLE telemetry_event IS 'Telemetria operacional minimizada; nunca armazena tokens, corpos ou conteúdo digitado.';
COMMENT ON TABLE admin_audit_event IS 'Auditoria imutável das ações administrativas do painel MASTER; fora da retenção da telemetria.';

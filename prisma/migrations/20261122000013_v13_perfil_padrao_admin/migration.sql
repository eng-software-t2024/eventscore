-- EventScore - migration V13
-- Altera o perfil padrão de novos usuários para ADMIN.
-- Usuários existentes não são modificados.

ALTER TABLE usuario
    ALTER COLUMN perfil SET DEFAULT 'ADMIN';
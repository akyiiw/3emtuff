-- Adiciona coluna display_name (apelido) na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Copia os nomes existentes pra nova coluna
UPDATE profiles SET display_name = name WHERE display_name IS NULL AND name IS NOT NULL;
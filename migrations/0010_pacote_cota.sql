-- Cota de documentos por pacote (vazio = sem limite). O upload acima da cota é recusado; recarregar um título existente não conta de novo.
ALTER TABLE pacotes ADD COLUMN cota_documentos INTEGER;

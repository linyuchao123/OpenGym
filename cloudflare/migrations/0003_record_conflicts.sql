-- Additive and rerunnable. Compare the original JSON in the same D1 transaction as writes.
CREATE TABLE IF NOT EXISTS document_checks(scope TEXT NOT NULL,id TEXT NOT NULL,expected TEXT);
CREATE TRIGGER IF NOT EXISTS check_document BEFORE INSERT ON document_checks BEGIN
 SELECT CASE WHEN (SELECT body FROM documents WHERE scope=NEW.scope AND id=NEW.id) IS NOT NEW.expected THEN RAISE(ABORT,'revision-conflict') END;
END;
CREATE INDEX IF NOT EXISTS documents_life_recipient ON documents(scope,json_extract(body,'$.to'),json_extract(body,'$.createdAt'),id) WHERE scope='life';
CREATE INDEX IF NOT EXISTS documents_life_author ON documents(scope,json_extract(body,'$.uid'),json_extract(body,'$.createdAt'),id) WHERE scope='life';

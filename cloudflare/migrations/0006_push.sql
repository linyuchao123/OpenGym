CREATE INDEX IF NOT EXISTS documents_push_owner ON documents(scope,json_extract(body,'$.uid')) WHERE scope='push';
CREATE INDEX IF NOT EXISTS documents_push_due ON documents(scope,CAST(json_extract(body,'$.reminderAt') AS INTEGER)) WHERE scope='push-prefs';

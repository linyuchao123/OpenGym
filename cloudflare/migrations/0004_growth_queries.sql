CREATE INDEX IF NOT EXISTS documents_life_created ON documents(scope,json_extract(body,'$.createdAt'),json_extract(body,'$.id')) WHERE scope='life';
CREATE INDEX IF NOT EXISTS documents_share_token ON documents(scope,json_extract(body,'$.profile.externalShare.token')) WHERE scope='life';
CREATE INDEX IF NOT EXISTS documents_repost ON documents(scope,json_extract(body,'$.repostOf')) WHERE scope='life';

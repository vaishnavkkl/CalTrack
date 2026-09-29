ALTER TABLE automation_pipelines ADD COLUMN template_key TEXT NOT NULL DEFAULT 'blank';
ALTER TABLE automation_pipelines ADD COLUMN configuration_json TEXT NOT NULL DEFAULT '{}';

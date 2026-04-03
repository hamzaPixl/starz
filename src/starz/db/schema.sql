CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    owner TEXT NOT NULL,
    description TEXT,
    language TEXT,
    topics TEXT,
    stargazers_count INTEGER DEFAULT 0,
    html_url TEXT NOT NULL,
    homepage TEXT,
    updated_at TEXT,
    starred_at TEXT,
    readme_content TEXT,
    category TEXT,
    summary TEXT,
    embedding_text TEXT,
    synced_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_repos_category ON repos(category);
CREATE INDEX IF NOT EXISTS idx_repos_language ON repos(language);
CREATE INDEX IF NOT EXISTS idx_repos_starred_at ON repos(starred_at);

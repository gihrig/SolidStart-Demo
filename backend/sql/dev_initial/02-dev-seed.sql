-- root user (at id = 0)
INSERT INTO "user" 
    (id,  typ, username, cid, ctime, mid, mtime) VALUES 
    (0, 'Sys', 'root',  0,   now(), 0,   now());

-- User demo1
INSERT INTO "user" 
    (username, cid, ctime, mid, mtime) VALUES 
    ('demo1',  0,   now(), 0,   now());

-- Agent mock-01 (with 'parrot' model) (id: 100)
INSERT INTO "agent"
    (id,  owner_id, name,      cid, ctime, mid, mtime) VALUES
    (100, 0,        'mock-01', 0,   now(), 0,   now());

-- Category taxonomy (ids 1..6), seeded from the front-end mock fixture
-- (frontend/src/lib/jedi/data.json). `icon` is an opaque key (ADR-0011).
INSERT INTO "category"
    (id, name,            icon,          cid, ctime, mid, mtime) VALUES
    (1,  'Landscape',     'landscape',   0,   now(), 0,   now()),
    (2,  'People',        'portrait',    0,   now(), 0,   now()),
    (3,  'Animals',       'dog',         0,   now(), 0,   now()),
    (4,  'Abstract',      'collage',     0,   now(), 0,   now()),
    (5,  'Black & White', '180-degrees', 0,   now(), 0,   now()),
    (6,  'Cute',          'fire-heart',  0,   now(), 0,   now());


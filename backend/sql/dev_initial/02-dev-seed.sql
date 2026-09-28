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

-- Author Users (ids 1..3), seeded from the front-end mock fixture
-- (frontend/src/lib/jedi/data.json). Each carries a persisted avatar_url (#117);
-- they own the seeded Posts and Captions. username is the fixture display name.
INSERT INTO "user"
    (id, username, avatar_url,                                                 cid, ctime, mid, mtime) VALUES
    (1,  'Lisa',   'https://img.icons8.com/doodle/96/null/lisa-simpson.png',   0,   now(), 0,   now()),
    (2,  'Homer',  'https://img.icons8.com/doodle/96/null/homer-simpson.png',  0,   now(), 0,   now()),
    (3,  'Bart',   'https://img.icons8.com/doodle/96/null/bart-simpson.png',   0,   now(), 0,   now());

-- Liker Users (ids 4..11). They cast the seeded Likes below (#177). A Like is one
-- per (target, User), and Caption 1 needs 8, so 8 Users are required. They have
-- no pwd, so they cannot log in. root (a Sys User), demo1 (the login User), and
-- the Authors cast no Likes, so a later Like toggle by demo1 starts un-liked.
INSERT INTO "user"
    (id, username,   cid, ctime, mid, mtime) VALUES
    (4,  'Marge',    0,   now(), 0,   now()),
    (5,  'Maggie',   0,   now(), 0,   now()),
    (6,  'Milhouse', 0,   now(), 0,   now()),
    (7,  'Ned',      0,   now(), 0,   now()),
    (8,  'Apu',      0,   now(), 0,   now()),
    (9,  'Moe',      0,   now(), 0,   now()),
    (10, 'Krusty',   0,   now(), 0,   now()),
    (11, 'Ralph',    0,   now(), 0,   now());

-- Posts (ids 1..4), seeded from the front-end mock fixture. Every Post is public,
-- and owner_id is its author. The fixture likeCount is NOT stored — the like count
-- is derived from post_like, seeded below to match the fixture (#177).
INSERT INTO "post"
    (id, owner_id, title,            image_src,                                                              image_alt,          photographer,             photographer_url,                              source_url,                                                                     cid, ctime, mid, mtime) VALUES
    (1,  1,        'Little Jedi',    'https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg',     'Little Jedi cat',  'Felicity Berkleef',      'https://www.flickr.com/photos/felicefelines/', 'https://www.flickr.com/photos/felicefelines/50618365686/',                     0,   now(), 0,   now()),
    (2,  2,        'Brilliant tree', 'https://live.staticflickr.com/7374/9311425598_46cfda9977_c.jpg',       'Brilliant tree',   'Sunsword & Moonsabre',   'https://www.flickr.com/photos/sunsward7/',     'https://www.flickr.com/photos/sunsward7/9311425598/',                          0,   now(), 0,   now()),
    (3,  1,        'Camouflage',     'https://live.staticflickr.com/65535/54598806871_5d0522c3b2_b.jpg',     'Camouflaged cat',  'Felicity Berkleef',      'https://www.flickr.com/photos/felicefelines/', 'https://www.flickr.com/photos/felicefelines/54598806871/in/photostream/',       0,   now(), 0,   now()),
    (4,  2,        'Serene Beach',   'https://live.staticflickr.com/5338/9010271285_365982a7f7_b.jpg',       'Serene Beach',     'Sunsword & Moonsabre',   'https://www.flickr.com/photos/sunsward7/',     'https://www.flickr.com/photos/sunsward7/9010271285/in/photostream/',            0,   now(), 0,   now());

-- Post <-> Category joins, from the fixture category_ids. Each Post carries at
-- least one Category (#107): post 1 -> Animals + Cute, post 2 -> Landscape,
-- post 3 -> Animals + Cute, post 4 -> Landscape.
INSERT INTO "post_category"
    (post_id, category_id, cid, ctime, mid, mtime) VALUES
    (1, 3, 0, now(), 0, now()),
    (1, 6, 0, now(), 0, now()),
    (2, 1, 0, now(), 0, now()),
    (3, 3, 0, now(), 0, now()),
    (3, 6, 0, now(), 0, now()),
    (4, 1, 0, now(), 0, now());

-- Post Likes, from the fixture likeCount (#177): post 1 -> 5, post 2 -> 4,
-- post 3 -> 5, post 4 -> 3. Top Photos ranks [1, 3, 2, 4] (the 5-Like tie breaks
-- by id ascending). Each Like is cast by a Liker User, as its cid.
INSERT INTO "post_like"
    (post_id, user_id, cid, ctime, mid, mtime) VALUES
    (1, 4,  4,  now(), 4,  now()),
    (1, 5,  5,  now(), 5,  now()),
    (1, 6,  6,  now(), 6,  now()),
    (1, 7,  7,  now(), 7,  now()),
    (1, 8,  8,  now(), 8,  now()),
    (2, 4,  4,  now(), 4,  now()),
    (2, 5,  5,  now(), 5,  now()),
    (2, 6,  6,  now(), 6,  now()),
    (2, 7,  7,  now(), 7,  now()),
    (3, 4,  4,  now(), 4,  now()),
    (3, 5,  5,  now(), 5,  now()),
    (3, 6,  6,  now(), 6,  now()),
    (3, 7,  7,  now(), 7,  now()),
    (3, 8,  8,  now(), 8,  now()),
    (4, 4,  4,  now(), 4,  now()),
    (4, 5,  5,  now(), 5,  now()),
    (4, 6,  6,  now(), 6,  now());

-- Captions (ids 1..8), seeded from the front-end mock fixture. Every Caption is
-- public, and owner_id is its author. The fixture likeCount is NOT stored — the like
-- count is derived from caption_like, seeded below to match the fixture (#177).
INSERT INTO "caption"
    (id, post_id, owner_id, text,                             cid, ctime, mid, mtime) VALUES
    (1,  1,       1,        'Jedi Kitty protects the street', 0,   now(), 0,   now()),
    (2,  1,       3,        'May the paws be with you',       0,   now(), 0,   now()),
    (3,  2,       2,        'Nature''s cathedral',            0,   now(), 0,   now()),
    (4,  2,       2,        'Fall Fire!',                     0,   now(), 0,   now()),
    (5,  4,       3,        'Heaven on Earth!!',              0,   now(), 0,   now()),
    (6,  3,       2,        'Peek-a-Boo!',                    0,   now(), 0,   now()),
    (7,  4,       2,        'Undiscovered!',                  0,   now(), 0,   now()),
    (8,  3,       1,        'Can''t See Me!',                 0,   now(), 0,   now());

-- Caption Likes, from the fixture likeCount (#177): caption 1 -> 8, caption 2 -> 5,
-- captions 3..8 -> 2. Top Captions for post 1 ranks [1, 2], and each other Post's
-- 2-Like tie breaks by id ascending. Each Like is cast by a Liker User, as its cid.
INSERT INTO "caption_like"
    (caption_id, user_id, cid, ctime, mid, mtime) VALUES
    (1, 4,  4,  now(), 4,  now()),
    (1, 5,  5,  now(), 5,  now()),
    (1, 6,  6,  now(), 6,  now()),
    (1, 7,  7,  now(), 7,  now()),
    (1, 8,  8,  now(), 8,  now()),
    (1, 9,  9,  now(), 9,  now()),
    (1, 10, 10, now(), 10, now()),
    (1, 11, 11, now(), 11, now()),
    (2, 4,  4,  now(), 4,  now()),
    (2, 5,  5,  now(), 5,  now()),
    (2, 6,  6,  now(), 6,  now()),
    (2, 7,  7,  now(), 7,  now()),
    (2, 8,  8,  now(), 8,  now()),
    (3, 4,  4,  now(), 4,  now()),
    (3, 5,  5,  now(), 5,  now()),
    (4, 4,  4,  now(), 4,  now()),
    (4, 5,  5,  now(), 5,  now()),
    (5, 4,  4,  now(), 4,  now()),
    (5, 5,  5,  now(), 5,  now()),
    (6, 4,  4,  now(), 4,  now()),
    (6, 5,  5,  now(), 5,  now()),
    (7, 4,  4,  now(), 4,  now()),
    (7, 5,  5,  now(), 5,  now()),
    (8, 4,  4,  now(), 4,  now()),
    (8, 5,  5,  now(), 5,  now());

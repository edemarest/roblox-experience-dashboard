INSERT OR IGNORE INTO creators (creator_id, creator_type, name) VALUES
(1001,'GROUP','Demo Studio'),
(2001,'USER','Demo Dev');

INSERT OR IGNORE INTO universes (universe_id, name, description, creator_id, root_place_id, server_size, is_tracked, created_at)
VALUES
(15506160459, 'Demo Obby', 'A sample obby for testing', 1001, 1111111111, 12, 1, datetime('now')),
(12812920653, 'Demo Tycoon', 'A sample tycoon for testing', 2001, 2222222222, 10, 1, datetime('now'));
export type Creator = {
creator_id: number;
creator_type: 'USER' | 'GROUP';
name: string | null;
};

export type Universe = {
universe_id: number;
name: string | null;
description: string | null;
creator_id: number | null;
root_place_id: number | null;
server_size: number | null;
is_tracked: 0 | 1;
created_at: string | null;
updated_at: string | null;
last_seen_at: string | null;
};
import { z } from 'zod';

export const VoteSchema = z.object({ up: z.number(), down: z.number() });
export const SnapshotSchema = z.object({
asOf: z.string(),
playing: z.number().nullable(),
visitsTotal: z.number().nullable(),
favoritesTotal: z.number().nullable(),
votes: z.object({ up: z.number().nullable(), down: z.number().nullable() }),
likeRatio: z.number().nullable(),
wilsonScore: z.number().nullable()
});

export const ExperienceHeaderSchema = z.object({
universeId: z.number(),
name: z.string().nullable(),
creator: z.object({ id: z.number().nullable(), type: z.string().nullable(), name: z.string().nullable() }),
serverSize: z.number().nullable()
});

export const ExperienceViewSchema = z.object({
universeId: z.number(),
header: ExperienceHeaderSchema,
snapshot: SnapshotSchema,
sparklines: z.object({
playing24h: z.array(z.tuple([z.string(), z.number().nullable()])),
playing7d: z.array(z.tuple([z.string(), z.number().nullable()])),
favorites24h: z.array(z.tuple([z.string(), z.number().nullable()]))
}),
events: z.array(z.object({ ts: z.string(), type: z.string(), meta: z.any().nullable() })).optional(),
derived: z.object({ estimatedServers: z.number().nullable(), iconImpact6h: z.number().nullable() }).optional()
});

export const RadarItemSchema = z.object({
universeId: z.number(),
name: z.string().nullable(),
dz: z.number().nullable(),
accel: z.number().nullable(),
sustain: z.number().nullable(),
wilson: z.number().nullable(),
spark: z.array(z.tuple([z.string(), z.number().nullable()])).optional()
});
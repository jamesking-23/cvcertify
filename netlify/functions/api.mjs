import { handle } from '../lib/handlers.mjs';

export default async (req) => handle(req);

export const config = { path: '/api/*' };

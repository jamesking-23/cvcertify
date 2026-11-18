// Keeps the page code unchanged: pages call get/post/put/patch/del with REST-style paths,
// and backend.js maps those onto Supabase (tables, RPCs, the cvc-api Edge Function).
import { ApiError } from './errors.js';
import { handle, downloadFile } from './backend.js';

export { ApiError };

export async function api(method, path, body) {
  try {
    return await handle(method, path, body ?? {});
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401 && e.code === 'unauthenticated') window.dispatchEvent(new CustomEvent('cv:signed-out'));
      throw e;
    }
    console.error(e);
    throw new ApiError('Something went wrong. Please try again.', 500, 'client_error');
  }
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b) => api('PUT', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const del = (p, b) => api('DELETE', p, b);
export const download = downloadFile;

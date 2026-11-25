// Tiny helpers shared by the function modules. Works in Deno (Edge Functions) and Node (unit tests).

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

export const newId = (prefix = '') => {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return prefix + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const env = (k) => (typeof Deno !== 'undefined' ? Deno.env.get(k) : typeof process !== 'undefined' ? process.env[k] : undefined);

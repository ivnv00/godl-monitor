// Explicit subprocess-only synthetic fetch injection. The engine sees HTTPS;
// the isolated local test server uses HTTP and never contacts a remote host.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const endpoint = new URL(input);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== '127.0.0.1'
      || endpoint.username || endpoint.password) throw new Error('Synthetic loopback requests only');
  endpoint.protocol = 'http:';
  return nativeFetch(endpoint, init);
};

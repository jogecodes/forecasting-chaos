export async function loadManifest(url, fetcher = fetch) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Research manifest: HTTP ${response.status}`);
      const result = JSON.parse(await response.text());
      if (result.schema !== 1 || !result.systems || !result.gallery || !result.sensitivity) {
        throw new Error('Research manifest has an unsupported structure');
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw new Error(`The experiment data could not be read completely. Refresh to retry. (${lastError.message})`);
}

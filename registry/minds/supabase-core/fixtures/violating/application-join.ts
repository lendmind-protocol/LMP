export async function loadTenantRows(ids: string[]) {
  return Promise.all(ids.map(async (id) => id));
}

export async function loadTenantRows(client: { from: (table: string) => unknown }, tenantId: string) {
  return client.from(`tenant_rows:${tenantId}`);
}

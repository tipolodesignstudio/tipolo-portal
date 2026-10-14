// Who a document is addressed to. Kept free of any database code so the printed
// documents (js/print) can be used by both the previous portal and the new app.

/* who an invoice/proposal is addressed to: project contact -> client primary contact */
export function billingContact(project) {
  if (!project) return null;
  if (project.contact) return project.contact;
  const cs = project.client?.contacts || [];
  return cs.find((c) => c.is_primary) || cs[0] || null;
}
export function clientPrimaryContact(client) {
  const cs = client?.contacts || [];
  return cs.find((c) => c.is_primary) || cs[0] || null;
}

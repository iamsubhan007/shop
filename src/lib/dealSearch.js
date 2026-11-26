/** Does a deal match what was typed in a search box? (title, description or what it includes) */
export function dealMatches(deal, term) {
  const t = String(term || '').trim().toLowerCase();
  if (!t) return true;
  return [deal.title, deal.description, ...(deal.items || [])].some((v) => String(v || '').toLowerCase().includes(t));
}

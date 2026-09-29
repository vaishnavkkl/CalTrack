export const date = (value?: string, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-US', {
    ...(options || { month: 'short', day: 'numeric', year: 'numeric' }),
    timeZone: 'America/Los_Angeles'
  })
    .format(new Date(value));
};

export const dateTime = (value?: string) => date(value, {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
});

export const daysUntil = (value?: string) => {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
};

export const deadlineLabel = (value?: string) => {
  const days = daysUntil(value);
  if (days === null) return 'No deadline';
  if (days < 0) return 'Closed';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
};

export const initials = (email?: string) => (email || 'CT').split(/[@.\s]/).filter(Boolean)
  .slice(0, 2).map((part) => part[0].toUpperCase()).join('');

export const isIdentifierTitle = (value = '') =>
  /^(?=.*\d)(?:(?:rfo|rfp|rfq|rfi|rfb|ifb|event|bid)\s*)?[#:]?[a-z0-9][a-z0-9._/-]{3,}$/i.test(value.trim());

export const displayOpportunityTitle = (title: string, description = '') => {
  if (!isIdentifierTitle(title)) return title;
  const summary = description.split(/(?<=[.!?])\s+/)[0]?.trim();
  return summary && summary.length >= 12 ? summary : `Solicitation ${title}`;
};

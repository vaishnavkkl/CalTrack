import { Icon } from './Icon';

export function StatusBadge({ value }: { value: string }) {
  const className = value.toLowerCase().replace(/\s+/g, '-');
  return <span className={`status-badge status-${className}`}><i />{value}</span>;
}

export function MatchBadge({ score }: { score: number }) {
  const tone = score >= 90 ? 'high' : score >= 80 ? 'medium' : 'low';
  return <span className={`match-badge match-${tone}`}><Icon name="target" size={12} />{score}% match</span>;
}

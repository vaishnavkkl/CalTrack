import { Icon } from './Icon';

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><Icon name="search" size={28} /><h3>{title}</h3><p>{message}</p></div>;
}

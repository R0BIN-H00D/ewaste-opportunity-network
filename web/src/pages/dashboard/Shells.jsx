import { Bell } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';

export function NotificationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Notifications</h1>
      <EmptyState icon={Bell} title="You are all caught up">Updates about your listings, requests and verification will appear here.</EmptyState>
    </div>
  );
}

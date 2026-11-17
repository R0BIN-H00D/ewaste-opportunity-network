import { MessageCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ChatThread from '../../components/chat/ChatThread';
import ConversationList from '../../components/chat/ConversationList';
import GlassCard from '../../components/glass/GlassCard';

/** Conversations on the left and the open one on the right. On a phone only one of them shows at a time. */
export default function Messages() {
  const { id } = useParams();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Messages</h1>
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className={id ? 'hidden md:block' : ''}><ConversationList activeId={id} /></div>
        <div className={id ? '' : 'hidden md:block'}>
          {id ? (
            <ChatThread key={id} conversationId={id} />
          ) : (
            <GlassCard className="text-center">
              <MessageCircle className="mx-auto mb-2 text-primary dark:text-primary-tint" size={28} aria-hidden />
              <p className="text-ink-muted dark:text-[#9FB2A7]">Choose a conversation to read it.</p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}

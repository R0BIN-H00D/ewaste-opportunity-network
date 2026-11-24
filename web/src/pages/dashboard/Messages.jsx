import { MessageCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ChatThread from '../../components/chat/ChatThread';
import ConversationList from '../../components/chat/ConversationList';

/** One messenger panel: the conversations on the left and the open one on the right. On a phone only one of them shows at a time. */
export default function Messages() {
  const { id } = useParams();
  return (
    <div className="glass-strong flex h-[calc(100dvh-13rem)] min-h-[520px] overflow-hidden rounded-3xl">
      <section aria-label="All conversations" className={`min-h-0 w-full flex-col border-black/5 dark:border-white/10 md:flex md:w-[22rem] md:shrink-0 md:border-r ${id ? 'hidden' : 'flex'}`}>
        <div className="px-5 pb-3 pt-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink dark:text-white">Messages</h1>
          <p className="mt-0.5 text-sm text-ink-muted dark:text-[#9FB2A7]">Talk to sellers, technicians and refurbishers.</p>
        </div>
        <ConversationList activeId={id} />
      </section>
      <section aria-label="Open conversation" className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${id ? 'flex' : 'hidden'}`}>
        {id ? (
          <ChatThread key={id} conversationId={id} />
        ) : (
          <div className="m-auto max-w-sm px-6 text-center">
            <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary dark:text-primary-tint"><MessageCircle size={30} /></span>
            <h2 className="mt-4 text-lg font-bold text-ink dark:text-white">Your messages</h2>
            <p className="mt-1 text-ink-muted dark:text-[#9FB2A7]">Choose a conversation to read it.</p>
          </div>
        )}
      </section>
    </div>
  );
}

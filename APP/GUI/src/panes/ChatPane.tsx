import { Composer } from '../components/Composer';
import { MessageList } from '../components/MessageList';

export function ChatPane() {
  return (
    <section aria-label="Chat" className="flex h-full min-w-0 flex-1 flex-col">
      <MessageList />
      <Composer />
    </section>
  );
}

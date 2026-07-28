import { Composer } from '../components/Composer';
import { MessageList } from '../components/MessageList';

export function ChatPane() {
  return (
    <section className="chat" aria-label="Chat">
      <MessageList />
      <Composer />
    </section>
  );
}

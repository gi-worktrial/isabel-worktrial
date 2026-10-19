// the chat routes' skeletons, in the main view's chat column; route skeletons load with the first page, so this file
// imports only ui/skeleton and the message frame
import { Message, MessageContent } from "#/ui/message";
import { Skeleton } from "#/ui/skeleton";

/** A question and answer's shape while a chat's history loads; `label` announces it where nothing around it does. */
export function ConversationSkeleton({ label }: { label?: string }) {
  return (
    <div
      role={label === undefined ? undefined : "status"}
      aria-label={label}
      className="flex animate-fade flex-col gap-6"
    >
      <Message align="end">
        <MessageContent>
          <Skeleton className="h-9 w-1/2 rounded-2xl" />
        </MessageContent>
      </Message>
      <Message>
        <MessageContent>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-2/3" />
        </MessageContent>
      </Message>
    </div>
  );
}

// the chat column with the composer at its foot, over a question and an answer where the chat has some
function ChatColumn({ label, conversation }: { label: string; conversation: boolean }) {
  return (
    <section role="status" aria-label={label} className="flex h-full flex-col bg-surface">
      <div className="mx-auto flex min-h-0 w-full max-w-reading flex-1 flex-col px-4 pt-4">
        {conversation && <ConversationSkeleton />}
        <div className="mt-auto flex flex-col gap-2 pb-3">
          <Skeleton className="h-9 w-full rounded-sm" />
          <div className="h-6" />
        </div>
      </div>
    </section>
  );
}

// a used chat opens on its transcript
export function ChatSkeleton() {
  return <ChatColumn label="Loading chat" conversation />;
}

// Pebble's main view opens the last used chat, or a new one
export function MainViewSkeleton() {
  return <ChatColumn label="Loading Pebble" conversation={false} />;
}

import { HTMLAttributes } from "react";
export function Conversation(props: HTMLAttributes<HTMLDivElement>) { return <div className="conversation" {...props} />; }
export function ConversationContent(props: HTMLAttributes<HTMLDivElement>) { return <div className="conversation-content" {...props} />; }
export function ConversationScrollButton() { return null; }


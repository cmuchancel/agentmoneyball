import { HTMLAttributes } from "react";
export function Message({className = "", ...props}: HTMLAttributes<HTMLDivElement>) { return <div className={`message ${className}`} {...props} />; }
export function MessageContent(props: HTMLAttributes<HTMLDivElement>) { return <div className="message-content" {...props} />; }


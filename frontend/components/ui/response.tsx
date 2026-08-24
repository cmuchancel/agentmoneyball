import Markdown from "react-markdown";
export function Response({children}: {children: string}) { return <div className="response"><Markdown>{children}</Markdown></div>; }

